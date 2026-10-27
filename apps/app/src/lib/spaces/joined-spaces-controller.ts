import { type QueryClient, queryOptions } from "@tanstack/react-query"

import type { SpaceHost } from "@workspace/ui/components/host-pill"
import {
	type NoticeMessage,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import type { Space as SwitcherSpace } from "@workspace/ui/components/space"
import type { SpaceSettingsValue } from "@workspace/ui/components/space-settings"
import { i18n } from "@workspace/ui/lib/i18n"

import { heldJoinedMembersOf } from "./joined-space-members"
import { spaceQueryKeys } from "./space-query-keys"
import type { SpacesController, SpacesState } from "./spaces-controller"

import {
	commands,
	JOINED_SPACE_REMOVED_EVENT,
	type JoinedSpace,
	type JoinedSpaceError,
	type JoinedSpaceRemovalReason,
	type JoinedSpaceRemoved,
	type JoinedSpaceWaitReason,
	SPACE_DESCRIBED_EVENT,
	type SpaceDescribed,
} from "../bindings"
import { describeFailure, failureReporterIn } from "../failure-report"
import { joinedHosts, listen } from "../host"
import { createQueue } from "../queue"
import { createStore } from "../store"
import { createWriteLoop } from "../write-loop"
import type { RosterSpace, RosterState } from "../bots/roster-controller"
import type { Space } from "../conversations/store-contract"
import { joinRejectionNoticeOf } from "../host/join-refusal"
import {
	JOINED_SPACE_CHANGED_EVENT,
	type JoinedHostState,
	type JoinedHosts,
} from "../host/joined-hosts"
import { hostAmong, memberNameOf } from "../host/member-names"
import { memoizedOn, subscribeWithQueries } from "../query/cache-view"
import { runMutation } from "../query/run-mutation"

export type DepartureReason = Exclude<JoinedSpaceRemovalReason, "left">

export type DepartedSpace = {
	rowId: string
	spaceId: string
	reason: DepartureReason
	space: string
	host: string
	threadId: string | null
}

export type JoinedSpacesState = {
	joinedSpaces: JoinedSpace[]
	hasFailedToLoad: boolean
	openId: string | null
	departed: DepartedSpace | null
}

export type JoinedSpacesController = {
	getState: () => JoinedSpacesState
	subscribe: (listener: () => void) => () => void
	listQuery: JoinedSpaceListQuery
	watch: () => () => void
	selectSpace: (id: string) => void
	restore: (rowId: string | null) => void
	leave: (id: string) => Promise<void>
	admit: (joined: JoinedSpace) => Promise<void>
	describe: (id: string, value: SpaceSettingsValue) => void
	hostNameOf: (id: string) => string
}

export type JoinedSpacesTransport = {
	list: () => Promise<JoinedSpace[]>
	remove: (id: string) => Promise<void>
	describe: (
		id: string,
		name: string,
		colour: number | null,
	) => Promise<JoinedSpace>
	onChanged: (listener: () => void) => Promise<() => void>
	onDescribed: (
		listener: (described: SpaceDescribed) => void,
	) => Promise<() => void>
	onRemoved: (
		listener: (removed: JoinedSpaceRemoved) => void,
	) => Promise<() => void>
}

type JoinedSpaceDescription = Pick<JoinedSpace, "name" | "colour">

type ShownThread = Pick<RosterState, "selectedBotId" | "selectedConversationId">

type ShownThreads = {
	getState: () => ShownThread
	subscribe: (listener: () => void) => () => void
}

type JoinedSpacesHosts = Pick<
	JoinedHosts,
	"getState" | "connect" | "activate" | "forget"
>

type JoinedSpacesControllerOptions = {
	queryClient: QueryClient
	spaces: Pick<SpacesController, "getState" | "select">
	hosts?: JoinedSpacesHosts
	transport?: JoinedSpacesTransport
	reportFailure?: (notice: NoticeMessage) => void
	shownThreads?: ShownThreads
	reportHostOffline?: (notice: NoticeMessage) => void
}

type CommandResult<T> =
	| { status: "ok"; data: T }
	| { status: "error"; error: JoinedSpaceError }

const dataOf = <T>(result: CommandResult<T>): T => {
	if (result.status === "error") {
		throw result.error
	}
	return result.data
}

const joinedSpacesTransport: JoinedSpacesTransport = {
	list: async () => dataOf(await commands.joinedSpacesList()),
	remove: async (id) => {
		dataOf(await commands.joinedSpaceRemove(id))
	},
	describe: async (id, name, colour) =>
		dataOf(await commands.joinedSpaceDescribe(id, name, colour)),
	onChanged: (listener) => listen(JOINED_SPACE_CHANGED_EVENT, () => listener()),
	onDescribed: (listener) =>
		listen<SpaceDescribed>(SPACE_DESCRIBED_EVENT, ({ payload }) =>
			listener(payload),
		),
	onRemoved: (listener) =>
		listen<JoinedSpaceRemoved>(JOINED_SPACE_REMOVED_EVENT, ({ payload }) =>
			listener(payload),
		),
}

const raiseInfoNotice = (notice: NoticeMessage) =>
	raiseTransientNotice({ ...notice, type: "info" })

const isDeparture = (
	reason: JoinedSpaceRemovalReason,
): reason is DepartureReason => reason !== "left"

const threadIdOf = ({ selectedConversationId, selectedBotId }: ShownThread) =>
	selectedConversationId ?? selectedBotId

const JOINED_ROW_PREFIX = "joined:"

export const joinedRowIdOf = (hostId: string): string =>
	`${JOINED_ROW_PREFIX}${hostId}`

const rowIdOf = (joined: JoinedSpace): string => joinedRowIdOf(joined.id)

export const isJoinedRowId = (rowId: string): boolean =>
	rowId.startsWith(JOINED_ROW_PREFIX)

const hostOfflineBodyKeyOf = (reason: JoinedSpaceWaitReason | undefined) =>
	reason
		? (`chat:spaceAccessBanner.offline.reasons.${reason}` as const)
		: "chat:spaceAccessBanner.offline.body"

const isWaitingForHost = (joined: JoinedSpace) =>
	joined.state === "waitingForHost"

const descriptionOf = ({
	name,
	colour,
}: JoinedSpaceDescription): JoinedSpaceDescription => ({ name, colour })

const isSharedSpaceKnown = (joined: JoinedSpace) =>
	joined.remoteSpaceId !== null

const hostSpaceIdOf = (joined: JoinedSpace): string =>
	joined.remoteSpaceId ?? joined.id

const HOST_OF_STATUS: Record<JoinedHostState["status"], SpaceHost> = {
	connecting: "connecting",
	up: "up",
	down: "down",
	refused: "down",
}

const RELAY_HOST_SUFFIX = "/relay/member"

export const isRelaySpace = (joined: JoinedSpace) =>
	joined.hostUrl.endsWith(RELAY_HOST_SUFFIX)

const joinedSpaceOfRow = (
	joinedSpaces: JoinedSpace[],
	rowId: string | null,
): JoinedSpace | undefined =>
	joinedSpaces.find((joined) => rowIdOf(joined) === rowId)

const isOpenIn =
	(openId: string | null, selectedSpaceId: string | null) =>
	(joined: JoinedSpace) =>
		joined.id === openId && hostSpaceIdOf(joined) === selectedSpaceId

export const openJoinedSpaceOf = (
	joinedSpaces: JoinedSpace[],
	openId: string | null,
	selectedSpaceId: string | null,
): JoinedSpace | undefined =>
	joinedSpaces.find(isOpenIn(openId, selectedSpaceId))

export const openRowIdOf = (
	state: Pick<JoinedSpacesState, "joinedSpaces" | "openId" | "departed">,
	selectedSpaceId: string | null,
): string | null => {
	if (state.departed?.spaceId === selectedSpaceId) {
		return state.departed.rowId
	}
	const open = openJoinedSpaceOf(
		state.joinedSpaces,
		state.openId,
		selectedSpaceId,
	)
	return open ? rowIdOf(open) : selectedSpaceId
}

const ownedSwitcherSpaceOf = (space: Space): SwitcherSpace => ({
	...space,
	avatarSeed: space.instanceId ?? space.id,
})

const joinedSwitcherSpaceOf = (joined: JoinedSpace): SwitcherSpace => ({
	id: rowIdOf(joined),
	name: joined.name,
	colour: joined.colour,
	avatarSeed: joined.instanceId ?? rowIdOf(joined),
})

export const switcherSpacesOf = (
	spaces: Space[],
	joinedSpaces: JoinedSpace[],
): SwitcherSpace[] => [
	...spaces.map(ownedSwitcherSpaceOf),
	...joinedSpaces.map(joinedSwitcherSpaceOf),
]

export const hostMarksOf = (
	joinedSpaces: JoinedSpace[],
	connections: Record<string, JoinedHostState>,
): Record<string, SpaceHost> =>
	Object.fromEntries(
		joinedSpaces.map((joined) => [
			rowIdOf(joined),
			isWaitingForHost(joined)
				? "down"
				: HOST_OF_STATUS[connections[joined.id]?.status ?? "connecting"],
		]),
	)

export const openLocalSpaceOf = (
	spaces: Space[],
	openRowId: string | null,
): Space | undefined => spaces.find((space) => space.id === openRowId)

export const openSpaceColourOf = (
	{ spaces, selectedSpaceId }: Pick<SpacesState, "spaces" | "selectedSpaceId">,
	joined: Pick<JoinedSpacesState, "joinedSpaces" | "openId" | "departed">,
) => {
	const openRowId = openRowIdOf(joined, selectedSpaceId)
	return (
		joinedSpaceOfRow(joined.joinedSpaces, openRowId)?.colour ??
		openLocalSpaceOf(spaces, openRowId)?.colour
	)
}

export const rosterSpacesOf = (
	spaces: Space[],
	joinedSpaces: JoinedSpace[],
	activeHostId: string | null,
): RosterSpace[] => {
	const active = joinedSpaces.find((joined) => joined.id === activeHostId)
	return active
		? [{ spaceRowId: rowIdOf(active), spaceId: hostSpaceIdOf(active) }]
		: spaces.map((space) => ({ spaceRowId: space.id, spaceId: space.id }))
}

type JoinedSpacesChoice = Pick<JoinedSpacesState, "openId" | "departed">

const initialJoinedSpacesChoice: JoinedSpacesChoice = {
	openId: null,
	departed: null,
}

const NO_JOINED_SPACES: JoinedSpace[] = []

const joinedSpaceListQueryOf = (read: () => Promise<JoinedSpace[]>) =>
	queryOptions({
		queryKey: spaceQueryKeys.joined(),
		queryFn: read,
		meta: {
			failureNotice: joinRejectionNoticeOf,
			raisedIn: "joined-spaces-controller",
		},
	})

type JoinedSpaceListQuery = ReturnType<typeof joinedSpaceListQueryOf>

const joinedSpacesStateOf = (
	choice: JoinedSpacesChoice,
	joinedSpaces: JoinedSpace[],
	hasFailedToLoad: boolean,
): JoinedSpacesState => ({ ...choice, joinedSpaces, hasFailedToLoad })

const vanishedFrom = (held: JoinedSpace[], listed: JoinedSpace[]) =>
	held.filter((joined) => !listed.some((entry) => entry.id === joined.id))

const wentOfflineIn = (held: JoinedSpace[], listed: JoinedSpace[]) =>
	listed.filter(
		(joined) =>
			isWaitingForHost(joined) &&
			held.some((entry) => entry.id === joined.id && entry.state === "online"),
	)

export const createJoinedSpacesController = ({
	queryClient,
	spaces,
	hosts = joinedHosts,
	transport = joinedSpacesTransport,
	reportFailure = failureReporterIn("joined-spaces-controller"),
	shownThreads,
	reportHostOffline = raiseInfoNotice,
}: JoinedSpacesControllerOptions): JoinedSpacesController => {
	const choiceStore = createStore(initialJoinedSpacesChoice)
	const listQuery = joinedSpaceListQueryOf(() => transport.list())
	const listKey = listQuery.queryKey
	let previousLocalId: string | null = null
	let hasRead = false
	let pendingRowId: string | null = null
	let awaitedRowId: string | null = null
	let admittedRowId: string | null = null

	const current = memoizedOn(
		() => [
			choiceStore.getState(),
			queryClient.getQueryData<JoinedSpace[]>(listKey) ?? NO_JOINED_SPACES,
			queryClient.getQueryState(listKey)?.status === "error",
		],
		joinedSpacesStateOf,
	)

	const set = (fields: Partial<JoinedSpacesChoice>) =>
		choiceStore.setState({ ...choiceStore.getState(), ...fields })

	const hold = (joinedSpaces: JoinedSpace[]) =>
		queryClient.setQueryData(listKey, joinedSpaces)

	const reportRefusal = (reason: unknown) =>
		reportFailure(joinRejectionNoticeOf(reason))

	const reportDescribeRefusal = (refusal: unknown) => {
		const reason =
			refusal == null ? undefined : describeFailure(refusal).trim() || undefined
		reportFailure({
			title: i18n.t("chat:screen.notice.describeRefused.title"),
			description:
				reason === undefined
					? i18n.t("chat:screen.notice.describeRefused.description")
					: i18n.t("chat:screen.notice.describeRefused.descriptionWithReason", {
							reason,
						}),
		})
	}

	const heldJoined = (id: string) =>
		current().joinedSpaces.find((joined) => joined.id === id)

	const replaceRow = (written: JoinedSpace) =>
		hold(
			current().joinedSpaces.map((joined) =>
				joined.id === written.id ? written : joined,
			),
		)

	const paint = (id: string, description: JoinedSpaceDescription) => {
		const held = heldJoined(id)
		if (held) replaceRow({ ...held, ...description })
	}

	const savedDescriptions = new Map<string, JoinedSpaceDescription>()

	const restoreSaved = (id: string) => {
		const saved = savedDescriptions.get(id)
		savedDescriptions.delete(id)
		if (saved) paint(id, saved)
	}

	const writes = createWriteLoop<SpaceSettingsValue, JoinedSpace>({
		enqueue: createQueue(),
		write: async (id, { name, colour }) => {
			const written = await runMutation(queryClient, () =>
				transport.describe(id, name, colour ?? null),
			)
			savedDescriptions.set(id, descriptionOf(written))
			return written
		},
		apply: (id, written) => {
			savedDescriptions.delete(id)
			replaceRow(written)
		},
		onRefused: (id, reason) => {
			writes.drop(id)
			restoreSaved(id)
			reportDescribeRefusal(reason)
		},
	})

	const describe = (id: string, value: SpaceSettingsValue) => {
		const held = heldJoined(id)
		if (!held || isWaitingForHost(held)) {
			return
		}
		if (!savedDescriptions.has(id)) {
			savedDescriptions.set(id, descriptionOf(held))
		}
		paint(id, { name: value.name, colour: value.colour ?? held.colour })
		writes.push(id, value)
	}

	const noteDescription = (
		joined: JoinedSpace,
		description: JoinedSpaceDescription,
	) => {
		if (savedDescriptions.has(joined.id)) {
			savedDescriptions.set(joined.id, description)
			return
		}
		paint(joined.id, description)
	}

	const noteDescribed = ({ spaceId, name, colour }: SpaceDescribed) => {
		for (const joined of current().joinedSpaces) {
			if (joined.remoteSpaceId === spaceId) {
				noteDescription(joined, { name, colour: colour ?? joined.colour })
			}
		}
	}

	const connectEach = (joinedSpaces: JoinedSpace[]) => {
		for (const joined of joinedSpaces) {
			void hosts.connect(joined.id)
		}
	}

	const leaveIfOpen = (joinedSpaces: JoinedSpace[]) => {
		if (!joinedSpaces.some(isOpenJoined)) {
			return
		}
		const back = backSpaceId()
		if (back) selectSpace(back)
	}

	const leaveVanished = (gone: JoinedSpace[]) => {
		for (const joined of gone) {
			hosts.forget(joined.id)
		}
		leaveIfOpen(gone)
	}

	const hostOfflineNoticeOf = (joined: JoinedSpace) => {
		const naming = { space: joined.name, host: hostNameOf(joined.id) }
		return {
			title: i18n.t("chat:spaceAccessBanner.offline.title", naming),
			description: i18n.t(hostOfflineBodyKeyOf(joined.wait?.reason), naming),
		}
	}

	const noteWentOffline = (wentOffline: JoinedSpace[]) => {
		for (const joined of wentOffline) {
			reportHostOffline(hostOfflineNoticeOf(joined))
		}
	}

	const selectAdmittedOnceOnline = () => {
		const admitted = joinedOfRow(admittedRowId)
		if (admitted && !isWaitingForHost(admitted)) selectSpace(rowIdOf(admitted))
	}

	const hasListed = () =>
		queryClient.getQueryState(listKey)?.status === "success"

	const read = async () => {
		const held = current().joinedSpaces
		await queryClient.cancelQueries({ queryKey: listKey })
		await queryClient.prefetchQuery({ ...listQuery, staleTime: 0 })
		if (!hasListed()) {
			return
		}
		const { joinedSpaces } = current()
		hasRead = true
		connectEach(joinedSpaces)
		leaveVanished(vanishedFrom(held, joinedSpaces))
		noteWentOffline(wentOfflineIn(held, joinedSpaces))
		selectAdmittedOnceOnline()
		reopenPending()
	}

	const watch = () => {
		void read()
		const detachChanges = transport
			.onChanged(() => {
				void read()
			})
			.catch((reason: unknown) => {
				reportRefusal(reason)
				return undefined
			})
		const detachRemovals = transport
			.onRemoved(noteRemoval)
			.catch((reason: unknown) => {
				reportRefusal(reason)
				return undefined
			})
		const detachDescriptions = transport
			.onDescribed(noteDescribed)
			.catch((reason: unknown) => {
				reportRefusal(reason)
				return undefined
			})
		const stopFollowingThreads = shownThreads?.subscribe(
			leaveDepartedOnceElsewhere,
		)
		return () => {
			void detachChanges.then((unlisten) => unlisten?.())
			void detachRemovals.then((unlisten) => unlisten?.())
			void detachDescriptions.then((unlisten) => unlisten?.())
			stopFollowingThreads?.()
		}
	}

	const heldWithout = (id: string) =>
		current().joinedSpaces.filter((held) => held.id !== id)

	const joinedOfRow = (rowId: string | null) =>
		joinedSpaceOfRow(current().joinedSpaces, rowId)

	const isOpenJoined = (joined: JoinedSpace) =>
		isOpenIn(current().openId, spaces.getState().selectedSpaceId)(joined)

	const openJoined = () => current().joinedSpaces.find(isOpenJoined)

	const isLocalSpace = (id: string | null) =>
		spaces.getState().spaces.some((space) => space.id === id)

	const notePreviousLocal = () => {
		const { selectedSpaceId } = spaces.getState()
		if (!openJoined() && isLocalSpace(selectedSpaceId)) {
			previousLocalId = selectedSpaceId
		}
	}

	const backSpaceId = () =>
		isLocalSpace(previousLocalId)
			? previousLocalId
			: (spaces.getState().spaces[0]?.id ?? null)

	const isOpen = (id: string) =>
		hosts.getState().active === id || openJoined()?.id === id

	const hostNameOf = (id: string) =>
		memberNameOf(
			hostAmong(heldJoinedMembersOf(queryClient, id)),
			i18n.t("chat:working.name"),
		)

	const shownThreadId = () =>
		shownThreads ? threadIdOf(shownThreads.getState()) : null

	const leaveDepartedOnceElsewhere = () => {
		const { departed } = current()
		const shown = shownThreadId()
		if (!departed || shown === null || shown === departed.threadId) {
			return
		}
		set({ departed: null })
		const back = backSpaceId()
		if (back) selectSpace(back)
	}

	const noteRemoval = ({ id, name, reason }: JoinedSpaceRemoved) => {
		const removed = current().joinedSpaces.find((joined) => joined.id === id)
		const hostName = hostNameOf(id)
		const wasOpen = isOpen(id)
		const back = backSpaceId()
		hosts.forget(id)
		hold(heldWithout(id))
		if (removed && isOpenJoined(removed) && isDeparture(reason)) {
			set({
				openId: null,
				departed: {
					rowId: rowIdOf(removed),
					spaceId: hostSpaceIdOf(removed),
					reason,
					space: name,
					host: hostName,
					threadId: shownThreadId(),
				},
			})
			return
		}
		if (wasOpen && back) selectSpace(back)
	}

	const selectOnceSharedSpaceKnown = async (joined: JoinedSpace) => {
		const rowId = rowIdOf(joined)
		awaitedRowId = rowId
		await hosts.connect(joined.id)
		await read()
		const learned = joinedOfRow(rowId)
		if (awaitedRowId === rowId && learned && isSharedSpaceKnown(learned)) {
			selectSpace(rowId)
		}
	}

	const isAwaitingAdmission = (joined: JoinedSpace) =>
		rowIdOf(joined) === admittedRowId && isWaitingForHost(joined)

	const selectSpace = (id: string) => {
		const joined = joinedOfRow(id)
		if (joined && isAwaitingAdmission(joined)) {
			return
		}
		awaitedRowId = null
		admittedRowId = null
		if (joined && !isSharedSpaceKnown(joined)) {
			void selectOnceSharedSpaceKnown(joined).catch(reportRefusal)
			return
		}
		notePreviousLocal()
		pendingRowId = null
		set({ openId: joined?.id ?? null, departed: null })
		spaces.select(joined ? hostSpaceIdOf(joined) : id)
		void (joined
			? hosts.activate(joined.id, hostSpaceIdOf(joined))
			: hosts.activate(null))
	}

	const reopenPending = () => {
		const rowId = pendingRowId
		if (!hasRead || !rowId) {
			return
		}
		pendingRowId = null
		if (joinedOfRow(rowId)) selectSpace(rowId)
	}

	const restore = (rowId: string | null) => {
		pendingRowId = rowId
		reopenPending()
	}

	const admit = async (joined: JoinedSpace) => {
		hold([...heldWithout(joined.id), joined])
		await hosts.connect(joined.id)
		await read()
		const learned =
			current().joinedSpaces.find((held) => held.id === joined.id) ?? joined
		if (isWaitingForHost(learned)) {
			admittedRowId = rowIdOf(learned)
			return
		}
		selectSpace(rowIdOf(learned))
	}

	const leave = async (id: string) => {
		const leaving = current().joinedSpaces.find((joined) => joined.id === id)
		if (!leaving) {
			return
		}
		await transport.remove(leaving.id).catch((reason: unknown) => {
			reportRefusal(reason)
			throw reason
		})
		hosts.forget(leaving.id)
		hold(heldWithout(leaving.id))
		const [firstLocal] = spaces.getState().spaces
		if (isOpenJoined(leaving) && firstLocal) {
			selectSpace(firstLocal.id)
		}
	}

	return {
		getState: current,
		subscribe: subscribeWithQueries(choiceStore, queryClient, listKey),
		listQuery,
		watch,
		selectSpace,
		restore,
		leave,
		admit,
		describe,
		hostNameOf,
	}
}
