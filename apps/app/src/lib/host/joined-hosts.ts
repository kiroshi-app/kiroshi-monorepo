import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core"
import type { EventCallback, UnlistenFn } from "@tauri-apps/api/event"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"

import {
	type ConversationSource,
	createConversationProvenance,
	LOCAL_IDS_COMMAND,
} from "./conversation-provenance"
import {
	createHttpHost,
	type HostRefusal,
	type HostSocket,
	type HttpHost,
} from "./http"
import {
	isJoinedSpaceError,
	joinRefusalNoticeOf,
	unexpectedJoinNotice,
} from "./join-refusal"

import {
	type commands,
	INVITATION_CHANGED_EVENT,
	JOINED_SPACE_RECONNECTED_EVENT,
	JOINED_SPACE_REMOVED_EVENT,
	type JoinedSpaceConnection,
	type JoinedSpaceError,
	type JoinedSpaceReconnected,
} from "../bindings"
import { failureReporterIn } from "../failure-report"
import { createStore } from "../store"

export const LOCAL_COMMANDS: ReadonlySet<string> = new Set([
	"space_list",
	"space_create",
	"space_update",
	"space_reorder",
	"space_delete",
	"space_export",
	"space_import",
	"joined_spaces_list",
	"joined_space_connect",
	"joined_space_remove",
	"user_preferences",
	"user_set_preferences",
	"user_set_profile_picture",
	"window_declare_maximize_button",
	"hosting_state",
	"hosting_start",
	"hosting_stop",
	"hosting_members",
	"hosting_invite_member",
	"hosting_withdraw_invitation",
	"hosting_remove_member",
	"mcp_oauth_cancel",
	"mission_board",
	"mission_unreported",
	"notification_show",
	"companion_launch_outcome",
	"account_state",
	"account_sign_in",
	"account_sign_out",
	"agent_account",
	"agent_sign_in",
	"agent_sign_in_code",
	"agent_sign_in_cancel",
	"agent_shutdown",
	"agent_live_sessions",
	"connection_set",
	"invitations_list",
	"invitation_accept",
	"invitation_decline",
	LOCAL_IDS_COMMAND,
])

export const JOINED_SPACE_CHANGED_EVENT = "joined-space://changed"

const LOCAL_EVENTS: ReadonlySet<string> = new Set([
	"host://presence",
	"hosting://changed",
	JOINED_SPACE_CHANGED_EVENT,
	JOINED_SPACE_REMOVED_EVENT,
	INVITATION_CHANGED_EVENT,
	"window-maximize-button",
	"notification://activated",
	"user://first-run-done",
	"companion://created",
	"companion://seed-refused",
	"account://changed",
	"agent://sign-in-started",
])

const TAURI_PLUGIN_PREFIX = "plugin:"

const SPACE_READS_THE_HOST_KEEPS: ReadonlySet<string> = new Set([
	"env_list",
	"mcp_application_status",
])

const COMMANDS_THE_HOST_REFUSES: ReadonlySet<string> = new Set([
	"env_list",
	"env_set",
	"env_delete",
	"mcp_application_status",
	"mcp_oauth_connect",
	"mcp_oauth_disconnect",
	"search_messages",
])

const PERSONAL_SCOPE_KINDS: ReadonlySet<unknown> = new Set([
	"user",
	"person",
	"account",
])

export type JoinedHostState =
	| { status: "connecting" }
	| { status: "up" }
	| { status: "down" }
	| { status: "refused"; failure: string }

export type JoinedHostsState = {
	active: string | null
	connections: Record<string, JoinedHostState>
}

type Invoke = <T>(
	command: string,
	args?: InvokeArgs,
	options?: InvokeOptions,
) => Promise<T>

type Listen = HttpHost["listen"]

type LocalHost = {
	invoke: Invoke
	listen: Listen
	fileSrc: (path: string) => string
}

type JoinOutcome = Awaited<ReturnType<typeof commands.joinedSpaceConnect>>

export type JoinedHostsOptions = {
	local: LocalHost
	join: (id: string) => Promise<JoinOutcome>
	fetch: typeof fetch
	openSocket: (url: string) => HostSocket
	reportFailure: (refusal: HostRefusal) => void
	reportJoinRefusal?: (notice: NoticeMessage) => void
	reportHostDown: () => string
	endHostDown: (noticeId: string) => void
}

type Route = (event: string) => Listen

type ReopenSignal = "relay" | "socket"

type UnpairedReopen = { signal: ReopenSignal; heardAt: number }

const REOPEN_PAIRING_MS = 10_000

type Subscription = {
	event: string
	handler: EventCallback<unknown>
	route: Route
	source: Listen
	unlisten: UnlistenFn
}

const unheard: Listen = async () => () => undefined

const isLocalCommand = (command: string): boolean =>
	command.startsWith(TAURI_PLUGIN_PREFIX) || LOCAL_COMMANDS.has(command)

type ScopeFields = { kind?: unknown; owner?: unknown; scope?: unknown }

const fieldsOf = (value: unknown): ScopeFields =>
	typeof value === "object" && value !== null ? value : {}

const isPersonalOwner = (owner: unknown): boolean =>
	fieldsOf(owner).kind === "user"

const isPersonalScope = (scope: unknown): boolean => {
	const { kind, owner } = fieldsOf(scope)
	return (
		PERSONAL_SCOPE_KINDS.has(kind) ||
		(kind === "server" && isPersonalOwner(owner))
	)
}

const carriesPersonalScope = (args?: InvokeArgs): boolean => {
	const { scope, owner } = fieldsOf(args)
	return isPersonalScope(scope) || isPersonalOwner(owner)
}

const isSpaceOwner = (owner: unknown): boolean =>
	fieldsOf(owner).kind === "space"

const isSpaceScope = (scope: unknown): boolean => {
	const { kind, owner } = fieldsOf(scope)
	return kind === "space" || (kind === "server" && isSpaceOwner(owner))
}

const readsWhatTheHostKeeps = (command: string, args?: InvokeArgs): boolean => {
	const { scope, owner } = fieldsOf(args)
	return (
		SPACE_READS_THE_HOST_KEEPS.has(command) &&
		(isSpaceScope(scope) || isSpaceOwner(owner))
	)
}

const describeRejection = (reason: unknown): string =>
	reason instanceof Error ? reason.message : String(reason)

const keepOnTheHost = <T>(command: string): Promise<T> =>
	Promise.reject(new Error(`${command} of a joined space stays on its host`))

export const createJoinedHosts = ({
	local,
	join,
	fetch,
	openSocket,
	reportFailure,
	reportJoinRefusal = failureReporterIn("joined-hosts"),
	reportHostDown,
	endHostDown,
}: JoinedHostsOptions) => {
	const store = createStore<JoinedHostsState>({ active: null, connections: {} })
	const hosts = new Map<string, HttpHost>()
	const sharedSpaceIds = new Map<string, string>()
	const pendingJoins = new Map<string, Promise<HttpHost | null>>()
	const subscriptions = new Set<Subscription>()
	const downNotices = new Map<string, string>()
	const reconnectionListeners = new Set<() => void>()
	const unpairedReopens = new Map<string, UnpairedReopen>()
	let isHearingRelayReopens = false
	const provenance = createConversationProvenance()
	let requested: string | null = null
	let localIdsRecall: Promise<void> | null = null
	let hasLocalIds = false

	const record = (id: string, state: JoinedHostState) => {
		const current = store.getState()
		store.setState({
			...current,
			connections: { ...current.connections, [id]: state },
		})
	}

	const refuse = (id: string, failure: string): null => {
		record(id, { status: "refused", failure })
		return null
	}

	const refuseJoin = (id: string, error: JoinedSpaceError): null => {
		const notice = joinRefusalNoticeOf(error)
		reportJoinRefusal(notice)
		return refuse(id, notice.title)
	}

	const refuseRejection = (id: string, reason: unknown): null => {
		if (isJoinedSpaceError(reason)) {
			return refuseJoin(id, reason)
		}
		reportJoinRefusal(unexpectedJoinNotice())
		return refuse(id, describeRejection(reason))
	}

	const isDown = (id: string) =>
		store.getState().connections[id]?.status === "down"

	const reportIfActiveDown = (id: string) => {
		if (store.getState().active === id && isDown(id) && !downNotices.has(id)) {
			downNotices.set(id, reportHostDown())
		}
	}

	const endDownNotice = (id: string) => {
		const noticeId = downNotices.get(id)
		if (noticeId) {
			endHostDown(noticeId)
			downNotices.delete(id)
		}
	}

	const announceReconnectionOf = (id: string) => {
		if (store.getState().active !== id) {
			return
		}
		for (const listener of [...reconnectionListeners]) {
			listener()
		}
	}

	const leaveUnpaired = (id: string, signal: ReopenSignal) => {
		unpairedReopens.set(id, { signal, heardAt: Date.now() })
	}

	const pairsWith = (id: string, signal: ReopenSignal) => {
		const unpaired = unpairedReopens.get(id)
		unpairedReopens.delete(id)
		return (
			unpaired?.signal === signal &&
			Date.now() - unpaired.heardAt <= REOPEN_PAIRING_MS
		)
	}

	const catchUpOnSocketReopen = (id: string) => {
		if (!pairsWith(id, "relay")) {
			leaveUnpaired(id, "socket")
		}
		announceReconnectionOf(id)
	}

	const catchUpOnRelayReopen: EventCallback<JoinedSpaceReconnected> = ({
		payload: { id },
	}) => {
		const status = store.getState().connections[id]?.status
		if (status === "down") {
			leaveUnpaired(id, "relay")
			return
		}
		if (status === "up" && !pairsWith(id, "socket")) {
			announceReconnectionOf(id)
		}
	}

	const markUp = (id: string) => {
		const wasDown = isDown(id)
		record(id, { status: "up" })
		endDownNotice(id)
		if (wasDown) {
			catchUpOnSocketReopen(id)
		}
	}

	const reportListenFailure = (reason: unknown): UnlistenFn => {
		reportFailure({ message: describeRejection(reason) })
		return () => undefined
	}

	const hearRelayReopens = () => {
		if (
			isHearingRelayReopens ||
			hosts.size === 0 ||
			reconnectionListeners.size === 0
		) {
			return
		}
		isHearingRelayReopens = true
		void local
			.listen(JOINED_SPACE_RECONNECTED_EVENT, catchUpOnRelayReopen)
			.catch(reportListenFailure)
	}

	const onReconnected = (listener: () => void) => {
		reconnectionListeners.add(listener)
		hearRelayReopens()
		return () => {
			reconnectionListeners.delete(listener)
		}
	}

	const openHost = (
		id: string,
		{ hostUrl, token, remoteSpaceId }: JoinedSpaceConnection,
	) => {
		const host = createHttpHost({
			host: hostUrl,
			token,
			fetch,
			openSocket,
			onUp: () => markUp(id),
			onDown: () => {
				record(id, { status: "down" })
				reportIfActiveDown(id)
			},
			onRefused: reportFailure,
		})
		hosts.set(id, host)
		sharedSpaceIds.set(id, remoteSpaceId ?? id)
		host.openEvents()
		hearRelayReopens()
		return host
	}

	const settleJoin = (id: string, outcome: JoinOutcome) =>
		outcome.status === "ok"
			? openHost(id, outcome.data)
			: refuseJoin(id, outcome.error)

	const startJoin = async (id: string): Promise<HttpHost | null> => {
		record(id, { status: "connecting" })
		try {
			return settleJoin(id, await join(id))
		} catch (reason) {
			return refuseRejection(id, reason)
		} finally {
			pendingJoins.delete(id)
		}
	}

	const openConnection = (id: string): Promise<HttpHost | null> => {
		const opened = hosts.get(id)
		if (opened) {
			return Promise.resolve(opened)
		}
		const pending = pendingJoins.get(id) ?? startJoin(id)
		pendingJoins.set(id, pending)
		return pending
	}

	const activeHost = (): HttpHost | undefined => {
		const { active } = store.getState()
		return active ? hosts.get(active) : undefined
	}

	const activeSpaceId = (): string | null => {
		const { active } = store.getState()
		return active ? (sharedSpaceIds.get(active) ?? null) : null
	}

	const listenerFor = (event: string): Listen => {
		const joined = LOCAL_EVENTS.has(event) ? undefined : activeHost()
		return joined ? joined.listen : local.listen
	}

	const relocate = (subscription: Subscription) => {
		const source = subscription.route(subscription.event)
		if (source === subscription.source) {
			return
		}
		subscription.unlisten()
		subscription.source = source
		const attached = source(subscription.event, subscription.handler).catch(
			reportListenFailure,
		)
		subscription.unlisten = () => {
			attached.then((unlisten) => unlisten())
		}
		attached.then((unlisten) => {
			if (subscription.source === source && subscriptions.has(subscription)) {
				subscription.unlisten = unlisten
			}
		})
	}

	const relocateAll = () => {
		for (const subscription of subscriptions) {
			relocate(subscription)
		}
	}

	const setActive = (active: string | null) => {
		const previous = store.getState().active
		if (previous === active) {
			return
		}
		if (previous) {
			endDownNotice(previous)
		}
		store.setState({ ...store.getState(), active })
		relocateAll()
	}

	const activate = async (
		id: string | null,
		sharedSpaceId?: string,
	): Promise<void> => {
		requested = id
		if (id === null) {
			setActive(null)
			return
		}
		sharedSpaceIds.set(id, sharedSpaceId ?? id)
		const previous = store.getState().active
		const opening = openConnection(id)
		setActive(id)
		const host = await opening
		if (requested !== id) {
			return
		}
		if (!host) {
			setActive(previous)
			return
		}
		relocateAll()
		reportIfActiveDown(id)
	}

	const forget = (id: string) => {
		hosts.get(id)?.close()
		hosts.delete(id)
		sharedSpaceIds.delete(id)
		unpairedReopens.delete(id)
		endDownNotice(id)
		const { [id]: _forgotten, ...connections } = store.getState().connections
		store.setState({ ...store.getState(), connections })
		if (requested === id) {
			void activate(null)
		}
	}

	const unreachable = (id: string) => {
		const connection = store.getState().connections[id]
		const failure =
			connection?.status === "refused" ? connection.failure : "unreachable"
		return new Error(`joined host ${id}: ${failure}`)
	}

	const invokeOnceOpen = async <T>(
		id: string,
		command: string,
		args?: InvokeArgs,
	): Promise<T> => {
		const host = await openConnection(id)
		if (!host) {
			throw unreachable(id)
		}
		return host.invoke<T>(command, args)
	}

	const isOpenHost = (source: ConversationSource) =>
		source !== null && hosts.has(source) && !isDown(source)

	const forgetLocalIdsRecall = (reason: unknown) => {
		localIdsRecall = null
		reportFailure({
			message: describeRejection(reason),
			command: LOCAL_IDS_COMMAND,
		})
	}

	const recallLocalIds = (): Promise<void> => {
		localIdsRecall ??= provenance
			.record(null, LOCAL_IDS_COMMAND, local.invoke(LOCAL_IDS_COMMAND))
			.then(() => {
				hasLocalIds = true
			}, forgetLocalIdsRecall)
		return localIdsRecall
	}

	const namesWhatOnlyThisMacHolds = (active: string, args?: InvokeArgs) =>
		provenance
			.heldOnlyHereIn(args, active)
			.some((id) => id !== sharedSpaceIds.get(active))

	const ownerOf = (active: string, args?: InvokeArgs): ConversationSource => {
		if (namesWhatOnlyThisMacHolds(active, args)) {
			return null
		}
		const sources = provenance.sourcesNamedIn(args)
		if (sources.size === 0) {
			return provenance.namesConversation(args) && !hasLocalIds ? null : active
		}
		if (sources.has(active)) {
			return active
		}
		if (sources.has(null)) {
			return null
		}
		return [...sources].find(isOpenHost) ?? null
	}

	const sendTo = <T>(
		target: ConversationSource,
		call: Parameters<Invoke>,
	): Promise<T> => {
		const [command, args] = call
		if (target === null) {
			return provenance.record(null, command, local.invoke<T>(...call))
		}
		const joined = hosts.get(target)
		return provenance.record(
			target,
			command,
			joined
				? joined.invoke<T>(command, args)
				: invokeOnceOpen<T>(target, command, args),
		)
	}

	const invoke: Invoke = <T>(...call: Parameters<Invoke>): Promise<T> => {
		const [command, args] = call
		const { active } = store.getState()
		if (
			isLocalCommand(command) ||
			active === null ||
			carriesPersonalScope(args)
		) {
			return sendTo<T>(null, call)
		}
		if (readsWhatTheHostKeeps(command, args)) {
			return keepOnTheHost<T>(command)
		}
		const route = () => {
			const target = ownerOf(active, args)
			return target !== null && COMMANDS_THE_HOST_REFUSES.has(command)
				? keepOnTheHost<T>(command)
				: sendTo<T>(target, call)
		}
		return provenance.namesConversation(args)
			? recallLocalIds().then(route)
			: route()
	}

	const routedListen =
		(route: Route): Listen =>
		async (event, handler) => {
			const source = route(event)
			const subscription: Subscription = {
				event,
				handler: handler as EventCallback<unknown>,
				route,
				source,
				unlisten: await source(event, handler),
			}
			subscriptions.add(subscription)
			relocate(subscription)
			return () => {
				subscriptions.delete(subscription)
				subscription.unlisten()
			}
		}

	const listen = routedListen(listenerFor)

	const listenToActiveHost = routedListen(() => activeHost()?.listen ?? unheard)

	const fileSrc = (path: string): string =>
		(activeHost() ?? local).fileSrc(path)

	return {
		getState: store.getState,
		subscribe: store.subscribe,
		connect: async (id: string) => {
			await openConnection(id)
		},
		activate,
		forget,
		invoke,
		activeSpaceId,
		listen,
		listenToActiveHost,
		onReconnected,
		fileSrc,
	}
}

export type JoinedHosts = ReturnType<typeof createJoinedHosts>
