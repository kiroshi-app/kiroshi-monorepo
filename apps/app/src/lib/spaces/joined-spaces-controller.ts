import {
	type NoticeMessage,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import type { Space as SwitcherSpace } from "@workspace/ui/components/space"
import type { SpaceRemote } from "@workspace/ui/components/space-switcher"
import { i18n } from "@workspace/ui/lib/i18n"

import { type SpaceInviters, storedInviters } from "./space-inviters"
import type { SpacesController } from "./spaces-controller"

import {
	commands,
	JOINED_SPACE_REMOVED_EVENT,
	type JoinedSpace,
	type JoinedSpaceError,
	type JoinedSpaceRemoved,
} from "../bindings"
import { failureReporterIn } from "../failure-report"
import { joinedHosts, listen } from "../host"
import { createStore } from "../store"
import type { RosterSpace } from "../bots/roster-controller"
import type { Space } from "../conversations/store-contract"
import { joinRejectionNoticeOf } from "../host/join-refusal"
import {
	JOINED_SPACE_CHANGED_EVENT,
	type JoinedHostState,
	type JoinedHosts,
} from "../host/joined-hosts"

export type JoinedSpacesState = {
	joinedSpaces: JoinedSpace[]
	hasFailedToLoad: boolean
	isLeaveOpen: boolean
	leavingId: string | null
	openId: string | null
}

export type JoinedSpacesController = {
	getState: () => JoinedSpacesState
	subscribe: (listener: () => void) => () => void
	watch: () => () => void
	selectSpace: (id: string) => void
	restore: (rowId: string | null) => void
	askToLeave: () => void
	setLeaveOpen: (isLeaveOpen: boolean) => void
	leave: (id: string) => Promise<void>
	admit: (joined: JoinedSpace, hostEmail: string) => Promise<void>
	hostEmailOf: (id: string) => string
}

export type JoinedSpacesTransport = {
	list: () => Promise<JoinedSpace[]>
	remove: (id: string) => Promise<void>
	onChanged: (listener: () => void) => Promise<() => void>
	onRemoved: (
		listener: (removed: JoinedSpaceRemoved) => void,
	) => Promise<() => void>
}

type JoinedSpacesHosts = Pick<
	JoinedHosts,
	"getState" | "connect" | "activate" | "forget"
>

type JoinedSpacesControllerOptions = {
	spaces: Pick<SpacesController, "getState" | "select" | "setSettingsOpen">
	hosts?: JoinedSpacesHosts
	transport?: JoinedSpacesTransport
	reportFailure?: (notice: NoticeMessage) => void
	reportRemoval?: (notice: NoticeMessage) => void
	inviters?: SpaceInviters
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
	onChanged: (listener) => listen(JOINED_SPACE_CHANGED_EVENT, () => listener()),
	onRemoved: (listener) =>
		listen<JoinedSpaceRemoved>(JOINED_SPACE_REMOVED_EVENT, ({ payload }) =>
			listener(payload),
		),
}

const raiseRemovalNotice = (notice: NoticeMessage) =>
	raiseTransientNotice({ ...notice, type: "info" })

const JOINED_ROW_PREFIX = "joined:"

const rowIdOf = (joined: JoinedSpace): string =>
	`${JOINED_ROW_PREFIX}${joined.id}`

const isSharedSpaceKnown = (joined: JoinedSpace) =>
	joined.remoteSpaceId !== null

const hostSpaceIdOf = (joined: JoinedSpace): string =>
	joined.remoteSpaceId ?? joined.id

const isUnreachable = (connection: JoinedHostState | undefined) =>
	connection?.status === "down" || connection?.status === "refused"

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
	state: Pick<JoinedSpacesState, "joinedSpaces" | "openId">,
	selectedSpaceId: string | null,
): string | null => {
	const open = openJoinedSpaceOf(
		state.joinedSpaces,
		state.openId,
		selectedSpaceId,
	)
	return open ? rowIdOf(open) : selectedSpaceId
}

export const switcherSpacesOf = (
	spaces: Space[],
	joinedSpaces: JoinedSpace[],
): SwitcherSpace[] => [
	...spaces,
	...joinedSpaces.map((joined) => ({ id: rowIdOf(joined), name: joined.name })),
]

export const remoteMarksOf = (
	joinedSpaces: JoinedSpace[],
	connections: Record<string, JoinedHostState>,
): Record<string, SpaceRemote> =>
	Object.fromEntries(
		joinedSpaces.map((joined) => [
			rowIdOf(joined),
			isUnreachable(connections[joined.id]) ? "unreachable" : "connected",
		]),
	)

export const openLocalSpaceOf = (
	spaces: Space[],
	openRowId: string | null,
): Space | undefined => spaces.find((space) => space.id === openRowId)

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

const initialJoinedSpacesState: JoinedSpacesState = {
	joinedSpaces: [],
	hasFailedToLoad: false,
	isLeaveOpen: false,
	leavingId: null,
	openId: null,
}

export const createJoinedSpacesController = ({
	spaces,
	hosts = joinedHosts,
	transport = joinedSpacesTransport,
	reportFailure = failureReporterIn("joined-spaces-controller"),
	reportRemoval = raiseRemovalNotice,
	inviters = storedInviters,
}: JoinedSpacesControllerOptions): JoinedSpacesController => {
	const stateStore = createStore(initialJoinedSpacesState)
	const current = stateStore.getState
	let latestRead = 0
	let previousLocalId: string | null = null
	let hasRead = false
	let pendingRowId: string | null = null
	let awaitedRowId: string | null = null

	const set = (fields: Partial<JoinedSpacesState>) =>
		stateStore.setState({ ...current(), ...fields })

	const reportRefusal = (reason: unknown) =>
		reportFailure(joinRejectionNoticeOf(reason))

	const noteFailedLoad = (reason: unknown) => {
		set({ hasFailedToLoad: true })
		reportRefusal(reason)
	}

	const connectEach = (joinedSpaces: JoinedSpace[]) => {
		for (const joined of joinedSpaces) {
			void hosts.connect(joined.id)
		}
	}

	const vanishedFrom = (listed: JoinedSpace[]) =>
		current().joinedSpaces.filter(
			(held) => !listed.some((joined) => joined.id === held.id),
		)

	const leaveVanished = (gone: JoinedSpace[]) => {
		for (const joined of gone) {
			hosts.forget(joined.id)
			inviters.forget(joined.id)
		}
		if (!gone.some(isOpenJoined)) {
			return
		}
		const back = backSpaceId()
		if (back) selectSpace(back)
	}

	const read = async () => {
		latestRead += 1
		const ticket = latestRead
		try {
			const joinedSpaces = await transport.list()
			if (ticket === latestRead) {
				const gone = vanishedFrom(joinedSpaces)
				set({ joinedSpaces, hasFailedToLoad: false })
				hasRead = true
				connectEach(joinedSpaces)
				leaveVanished(gone)
				reopenPending()
			}
		} catch (reason) {
			if (ticket === latestRead) noteFailedLoad(reason)
		}
	}

	const watch = () => {
		void read()
		const detachChanges = transport
			.onChanged(() => {
				void read()
			})
			.catch((reason: unknown) => {
				noteFailedLoad(reason)
				return undefined
			})
		const detachRemovals = transport
			.onRemoved(noteRemoval)
			.catch((reason: unknown) => {
				reportRefusal(reason)
				return undefined
			})
		return () => {
			void detachChanges.then((unlisten) => unlisten?.())
			void detachRemovals.then((unlisten) => unlisten?.())
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

	const removalNoticeOf = (name: string, hostEmail: string) => ({
		title: i18n.t("bots:spaces.removed.notice", { email: hostEmail, name }),
		description: i18n.t("bots:spaces.removed.noticeDescription", {
			host: hostEmail,
		}),
	})

	const noteRemoval = ({ id, name }: JoinedSpaceRemoved) => {
		const hostEmail = inviters.of(id)
		const wasOpen = isOpen(id)
		const back = backSpaceId()
		hosts.forget(id)
		inviters.forget(id)
		set({ joinedSpaces: heldWithout(id) })
		reportRemoval(removalNoticeOf(name, hostEmail))
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

	const selectSpace = (id: string) => {
		awaitedRowId = null
		const joined = joinedOfRow(id)
		if (joined && !isSharedSpaceKnown(joined)) {
			void selectOnceSharedSpaceKnown(joined)
			return
		}
		notePreviousLocal()
		pendingRowId = null
		set({ openId: joined?.id ?? null })
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

	const admit = async (joined: JoinedSpace, hostEmail: string) => {
		inviters.remember(joined.id, hostEmail)
		set({ joinedSpaces: [...heldWithout(joined.id), joined] })
		await hosts.connect(joined.id)
		await read()
		const learned = current().joinedSpaces.find((held) => held.id === joined.id)
		selectSpace(rowIdOf(learned ?? joined))
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
		set({
			joinedSpaces: heldWithout(leaving.id),
		})
		spaces.setSettingsOpen(false)
		const [firstLocal] = spaces.getState().spaces
		if (isOpenJoined(leaving) && firstLocal) {
			selectSpace(firstLocal.id)
		}
	}

	return {
		getState: current,
		subscribe: stateStore.subscribe,
		watch,
		selectSpace,
		restore,
		askToLeave: () =>
			set({
				isLeaveOpen: true,
				leavingId: openJoined()?.id ?? null,
			}),
		setLeaveOpen: (isLeaveOpen: boolean) => set({ isLeaveOpen }),
		leave,
		admit,
		hostEmailOf: inviters.of,
	}
}
