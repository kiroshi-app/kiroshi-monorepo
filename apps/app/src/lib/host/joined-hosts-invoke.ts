import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core"

import {
	type ConversationSource,
	createConversationProvenance,
	LOCAL_IDS_COMMAND,
} from "./conversation-provenance"
import { HostRefused } from "./host-refused"
import { type HttpHost, hostOnlyRefusalOf } from "./http"
import type { JoinedHostsOptions, JoinedHostsState } from "./joined-hosts"
import type { Listen } from "./joined-hosts-listen"
import { ope1176, received, settled, stepped } from "./ope1176-probe"

import { describeFailure } from "../failure-report"
import type { Store } from "../store"

export const LOCAL_COMMANDS: ReadonlySet<string> = new Set([
	"space_list",
	"space_create",
	"space_update",
	"space_reorder",
	"space_delete",
	"space_export",
	"space_import",
	"library_save",
	"library_copy",
	"library_reveal",
	"library_save_bytes",
	"library_copy_bytes",
	"library_import_paths",
	"joined_spaces_list",
	"joined_space_connect",
	"joined_space_members",
	"joined_space_remove",
	"joined_space_describe",
	"join_link_listen",
	"user_preferences",
	"user_set_preferences",
	"user_set_profile_picture",
	"user_set_onboarding_step",
	"user_replay_onboarding",
	"user_set_onboarding_first_companion",
	"user_mark_onboarding_import_seen",
	"claude_import_inventory",
	"claude_import_run",
	"window_declare_maximize_button",
	"window_open",
	"window_identity",
	"window_report_space",
	"window_report_strip",
	"window_strip_at",
	"window_tab_drag_start",
	"window_tab_drag_move",
	"window_tab_drag_drop",
	"window_tab_drag_cancel",
	"window_start_native_move",
	"window_hide",
	"window_show",
	"drag_ghost_show",
	"drag_ghost_tab",
	"drag_ghost_move",
	"drag_ghost_hide",
	"diagnostics",
	"log_tail",
	"log_reveal",
	"log_clear",
	"hosting_state",
	"hosting_start",
	"hosting_stop",
	"mcp_oauth_cancel",
	"conversation_mission_thread",
	"mission_board",
	"mission_unreported",
	"mission_run_claim",
	"mission_run_release",
	"conversation_serve_awaited_runs",
	"conversation_claim_unseen_drops",
	"notification_show",
	"badge_set",
	"companion_launch_outcome",
	"get_device_identity",
	"device_approval",
	"device_approval_retry",
	"device_approval_code_request",
	"device_approval_code_submit",
	"device_approve",
	"device_refuse",
	"devices_list",
	"device_remove",
	"account_state",
	"account_sign_in",
	"account_sign_out",
	"agent_account",
	"agent_sign_in",
	"agent_sign_in_code",
	"agent_sign_in_cancel",
	"agent_live_sessions",
	"connection_set",
	"invitations_list",
	"invitation_accept",
	"invitation_decline",
	"update_state",
	"check_for_updates",
	"install_update",
	"release_notes",
	"running_companions",
	LOCAL_IDS_COMMAND,
])

const TAURI_PLUGIN_PREFIX = "plugin:"

const COMMANDS_ONLY_THE_HOST_RUNS: ReadonlySet<string> = new Set([
	"mcp_oauth_connect",
])

const PERSONAL_SCOPE_KINDS: ReadonlySet<unknown> = new Set([
	"user",
	"person",
	"account",
])

type HostInvokeOptions = Partial<InvokeOptions> & {
	signal?: AbortSignal
}

export type Invoke = <T>(
	command: string,
	args?: InvokeArgs,
	options?: HostInvokeOptions,
) => Promise<T>

export type LocalHost = {
	invoke: Invoke
	listen: Listen
	fileSrc: (path: string) => string
}

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

type JoinedHostsInvokeOptions = Pick<JoinedHostsOptions, "reportFailure"> & {
	store: Store<JoinedHostsState>
	hosts: Map<string, HttpHost>
	sharedSpaceIds: Map<string, string>
	local: LocalHost
	isDown: (id: string) => boolean
	invokeOnceOpen: <T>(
		id: string,
		command: string,
		args?: InvokeArgs,
		signal?: AbortSignal,
	) => Promise<T>
}

export const createJoinedHostsInvoke = ({
	store,
	hosts,
	sharedSpaceIds,
	local,
	isDown,
	invokeOnceOpen,
	reportFailure,
}: JoinedHostsInvokeOptions) => {
	const provenance = createConversationProvenance()
	let localIdsRecall: Promise<void> | null = null
	let hasLocalIds = false

	const isOpenHost = (source: ConversationSource) =>
		source !== null && hosts.has(source) && !isDown(source)

	const forgetLocalIdsRecall = (reason: unknown) => {
		localIdsRecall = null
		reportFailure({
			message: describeFailure(reason),
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

	let ownerReason = ""
	const ownerOf = (active: string, args?: InvokeArgs): ConversationSource => {
		if (namesWhatOnlyThisMacHolds(active, args)) {
			ownerReason = "names an id only this Mac holds"
			return null
		}
		const sources = provenance.sourcesNamedIn(args)
		if (sources.size === 0) {
			const isLocal = provenance.namesConversation(args) && !hasLocalIds
			ownerReason = isLocal
				? "no recorded source, local ids not recalled"
				: `no recorded source, hasLocalIds=${hasLocalIds}, defaults to active`
			return isLocal ? null : active
		}
		if (sources.has(active)) {
			ownerReason = "recorded source is the active host"
			return active
		}
		if (sources.has(null)) {
			ownerReason = "recorded source is this Mac"
			return null
		}
		const open = [...sources].find(isOpenHost)
		ownerReason = open
			? `recorded source ${open} is an open host`
			: `recorded sources [${[...sources].join(",")}] none open, falls back to this Mac`
		return open ?? null
	}

	const sendTo = <T>(
		target: ConversationSource,
		call: Parameters<Invoke>,
	): Promise<T> => {
		const [command, args, options] = call
		provenance.recordSent(target, command, args)
		if (target === null) {
			stepped(args, "sent to local (Tauri invoke)")
			return settled(
				args,
				"local",
				provenance.record(null, command, local.invoke<T>(...call)),
			)
		}
		const joined = hosts.get(target)
		const label = joined ? `joined host ${target}` : `invokeOnceOpen ${target}`
		stepped(args, `sent to ${label}`)
		return settled(
			args,
			label,
			provenance.record(
				target,
				command,
				joined
					? joined.invoke<T>(command, args, options?.signal)
					: invokeOnceOpen<T>(target, command, args, options?.signal),
			),
		)
	}

	const refuseAsTheHostWould = <T>(command: string): Promise<T> => {
		const refusal = hostOnlyRefusalOf(command)
		reportFailure(refusal)
		return Promise.reject(new HostRefused(refusal.message, refusal))
	}

	const invoke = <T>(...call: Parameters<Invoke>): Promise<T> => {
		const [command, args] = call
		const { active } = store.getState()
		received(command, args, active)
		if (
			isLocalCommand(command) ||
			active === null ||
			carriesPersonalScope(args)
		) {
			stepped(
				args,
				`route target=local reason=${active === null ? "no active joined Space" : "local command or personal scope"}`,
			)
			return sendTo<T>(null, call)
		}
		const route = () => {
			const target = ownerOf(active, args)
			stepped(
				args,
				`route target=${target ?? "local"} reason=${ownerReason} active=${active}`,
			)
			return target !== null && COMMANDS_ONLY_THE_HOST_RUNS.has(command)
				? refuseAsTheHostWould<T>(command)
				: sendTo<T>(target, call)
		}
		if (!provenance.namesConversation(args)) {
			return route()
		}
		stepped(args, "recallLocalIds wait started")
		const recallStarted = performance.now()
		const recall = recallLocalIds()
		recall.then(
			() =>
				stepped(
					args,
					`recallLocalIds settled resolved hasLocalIds=${hasLocalIds} wait_ms=${(performance.now() - recallStarted).toFixed(0)}`,
				),
			(reason: unknown) =>
				ope1176(
					`recallLocalIds settled rejected wait_ms=${(performance.now() - recallStarted).toFixed(0)} reason=${String(reason)}`,
				),
		)
		return recall.then(route)
	}

	const invokeOn =
		(target: ConversationSource): Invoke =>
		(...call) =>
			sendTo(target, call)

	return {
		invoke,
		invokeOn,
		invokeOnThisComputer: invokeOn(null),
	}
}
