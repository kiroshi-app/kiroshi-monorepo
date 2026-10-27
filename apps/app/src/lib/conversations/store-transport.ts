import { RefusedWrite } from "./refused-write"
import type {
	Bot,
	BotChangedFile,
	BotDraft,
	BotHistoryEntry,
	BotIdentity,
	BotMcpServer,
	BotSkill,
	BotSkillDraft,
	Chat,
	ContextCheckpoint,
	Conversation,
	ConversationDraft,
	ConversationEdit,
	ConversationPage,
	EnvEntry,
	EnvScope,
	Hue,
	McpServerMark,
	MessagePin,
	MessageReference,
	NewAssistantMessage,
	NewTurn,
	NewUserMessage,
	PluginScope,
	RosterPin,
	RuntimeSession,
	Section,
	SoloState,
	Space,
	SpacePreferences,
	SuggestedBot,
} from "./store-contract"
import type { TranscriptStore } from "./store-port"
import {
	COMPANION_ARRIVED_EVENT,
	COMPANION_SPOKE_EVENT,
	type CompanionArrival,
	type CompanionSpoke,
	MESSAGE_STORED_EVENT,
	type TerminalCompletion,
	TRANSCRIPT_PAGE_SIZE,
	TRANSCRIPT_WINDOW_SIZE,
	type TranscriptCursor,
	type TranscriptMessage,
	type TranscriptPage,
	type TranscriptWindow,
} from "./transcript-contract"

import { activeJoinedSpaceId, invoke, invokeOn, listen } from "../host"
import type { AgentCommand } from "@/lib/agent/contract"
import type { ConversationSource } from "../host/conversation-provenance"
import type { Invoke } from "../host/joined-hosts-invoke"
import type { ReportTurnWrites } from "../routines/run-report"

const spaceOrJoined = (spaceId?: string | null): string | null =>
	spaceId ?? activeJoinedSpaceId()

const joinedSpaceArgument = () => {
	const spaceId = activeJoinedSpaceId()
	return spaceId ? { spaceId } : {}
}

export const arrivalsTransport = {
	onCompanionArrived: (listener: (arrival: CompanionArrival) => void) =>
		listen<CompanionArrival>(COMPANION_ARRIVED_EVENT, ({ payload }) =>
			listener(payload),
		),

	onCompanionSpoke: (
		listener: (spoken: CompanionSpoke, side: ConversationSource) => void,
	) =>
		listen<CompanionSpoke>(COMPANION_SPOKE_EVENT, ({ payload }, side) =>
			listener(payload, side),
		),
}

const conversationReadsThrough = (call: Invoke) => ({
	spaces: () => call<Space[]>("space_list"),

	conversations: (spaceId: string) =>
		call<Conversation[]>("conversation_list", { spaceId }),
})

const reportTurnWritesThrough = (call: Invoke): ReportTurnWrites => ({
	startTurn: (turn: NewTurn) =>
		call<number>("conversation_start_turn", { turn }),

	completeTurn: (id: string, completedAt: number) =>
		call<void>("conversation_complete_turn", { id, completedAt }),

	openAssistantMessage: (message: NewAssistantMessage) =>
		call<number>("conversation_open_assistant_message", { message }),

	appendText: (id: string, delta: string) =>
		call<void>("conversation_append_text", { id, delta }),

	finalizeMessage: (
		id: string,
		completion: TerminalCompletion,
		settledText?: string,
	) =>
		call<void>("conversation_finalize_message", {
			id,
			completion,
			settledText,
		}),
})

const refusalsNamed =
	(call: Invoke, turnOf: () => string | undefined): Invoke =>
	<T>(...sent: Parameters<Invoke>) =>
		call<T>(...sent).catch((reason: unknown) => {
			throw new RefusedWrite(sent[0], turnOf(), reason)
		})

export const conversationReadsOn = (side: ConversationSource) =>
	conversationReadsThrough(invokeOn(side))

export const missionThreadReadOn =
	(side: ConversationSource) => (conversationId: string) =>
		invokeOn(side)<Conversation>("conversation_mission_thread", {
			conversationId,
		})

export const reportTurnWritesOn = (
	side: ConversationSource,
): ReportTurnWrites => {
	let turnId: string | undefined
	const writes = reportTurnWritesThrough(
		refusalsNamed(invokeOn(side), () => turnId),
	)
	return {
		...writes,
		startTurn: (turn) => {
			turnId = turn.id
			return writes.startTurn(turn)
		},
	}
}

export const transcriptEventsTransport = {
	onMessageStored: (listener: (stored: TranscriptMessage) => void) =>
		listen<TranscriptMessage>(MESSAGE_STORED_EVENT, ({ payload }) =>
			listener(payload),
		),
}

export const conversationStore: TranscriptStore = {
	...conversationReadsThrough(invoke),
	...reportTurnWritesThrough(invoke),

	loadPage: (conversationId: string, cursor: TranscriptCursor | null) =>
		invoke<TranscriptPage>("conversation_message_page", {
			conversationId,
			beforeSeq: cursor?.beforeSeq ?? null,
			limit: TRANSCRIPT_PAGE_SIZE,
		}),

	loadWindow: (conversationId: string, seq: number) =>
		invoke<TranscriptWindow>("conversation_message_page_around", {
			conversationId,
			seq,
			limit: TRANSCRIPT_WINDOW_SIZE,
		}),

	createSpace: (name: string) => invoke<Space>("space_create", { name }),

	updateSpace: (id: string, name: string, colour?: Hue) =>
		invoke<Space>("space_update", { id, name, colour: colour ?? null }),

	reorderSpaces: (ids: string[]) => invoke<void>("space_reorder", { ids }),

	deleteSpace: (id: string) => invoke<void>("space_delete", { id }),

	exportSpace: (id: string, path: string) =>
		invoke<void>("space_export", { id, path }),

	importSpace: (path: string) => invoke<Space>("space_import", { path }),

	spacePreferences: (spaceId: string) =>
		invoke<SpacePreferences>("space_preferences", { spaceId }),

	setSpacePreferences: (spaceId: string, preferences: SpacePreferences) =>
		invoke<SpacePreferences>("space_set_preferences", { spaceId, preferences }),

	sections: (spaceId: string) => invoke<Section[]>("section_list", { spaceId }),

	createSection: (spaceId: string, name: string) =>
		invoke<Section>("section_create", { spaceId, name }),

	renameSection: (id: string, name: string) =>
		invoke<Section>("section_rename", { id, name }),

	pinRoster: (spaceId: string, pins: RosterPin[]) =>
		invoke<void>("roster_pin", { spaceId, pins }),

	deleteSection: (id: string) => invoke<void>("section_delete", { id }),

	moveBotToSection: (botId: string, sectionId: string | null) =>
		invoke<void>("bot_move_to_section", {
			botId,
			sectionId,
			...joinedSpaceArgument(),
		}),

	moveBotToSpace: (botId: string, spaceId: string) =>
		invoke<void>("bot_move_to_space", { botId, spaceId }),

	addBotToSpace: (botId: string, spaceId: string, sectionId?: string | null) =>
		invoke<void>("bot_add_to_space", {
			botId,
			spaceId,
			sectionId: sectionId ?? null,
		}),

	removeBotFromSpace: (botId: string, spaceId: string) =>
		invoke<void>("bot_remove_from_space", { botId, spaceId }),

	bots: (spaceId?: string | null, signal?: AbortSignal) =>
		invoke<Bot[]>(
			"conversation_bots",
			{ spaceId: spaceOrJoined(spaceId) },
			{ signal },
		),

	botsByPresence: (spaceId: string, excludedConversationId?: string | null) =>
		invoke<Bot[]>("conversation_bots_by_presence", {
			spaceId,
			excludedConversationId: excludedConversationId ?? null,
		}),

	createBot: (identity: BotIdentity, spaceId?: string | null) =>
		invoke<Bot>("conversation_create_bot", {
			identity,
			spaceId: spaceOrJoined(spaceId),
		}),

	createBotFromDraft: (draft: BotDraft, spaceId: string) =>
		invoke<Bot>("conversation_create_bot_from_draft", { draft, spaceId }),

	suggestedBots: () => invoke<SuggestedBot[]>("conversation_suggested_bots"),

	duplicateBot: (botId: string, spaceId?: string | null) =>
		invoke<Bot>("conversation_duplicate_bot", {
			botId,
			spaceId: spaceOrJoined(spaceId),
		}),

	updateBot: (id: string, identity: BotIdentity) =>
		invoke<Bot>("conversation_update_bot", { id, identity }),

	deleteBot: (id: string) => invoke<void>("conversation_delete_bot", { id }),

	setBotAvatarImage: (id: string, bytes: Uint8Array) =>
		invoke<Bot>("conversation_set_bot_avatar_image", { id, bytes }),

	setBotMemory: (id: string, memory: string) =>
		invoke<Bot>("conversation_set_bot_memory", { id, memory }),

	pluginSkills: (scope: PluginScope) =>
		invoke<BotSkill[]>("plugin_skills", { scope }),

	createPluginSkill: (scope: PluginScope, draft: BotSkillDraft) =>
		invoke<BotSkill>("plugin_create_skill", { scope, draft }),

	updatePluginSkill: (
		scope: PluginScope,
		skillId: string,
		draft: BotSkillDraft,
	) => invoke<BotSkill>("plugin_update_skill", { scope, skillId, draft }),

	setPluginSkillPreloaded: (
		scope: PluginScope,
		skillId: string,
		isPreloaded: boolean,
	) =>
		invoke<BotSkill>("plugin_set_skill_preloaded", {
			scope,
			skillId,
			isPreloaded,
		}),

	deletePluginSkill: (scope: PluginScope, skillId: string) =>
		invoke<void>("plugin_delete_skill", { scope, skillId }),

	pluginSkillFile: (scope: PluginScope, skillId: string, path: string) =>
		invoke<string>("plugin_skill_file", { scope, skillId, path }),

	writePluginSkillFile: (
		scope: PluginScope,
		skillId: string,
		path: string,
		text: string,
	) =>
		invoke<BotSkill>("plugin_write_skill_file", {
			scope,
			skillId,
			path,
			text,
		}),

	deletePluginSkillFile: (scope: PluginScope, skillId: string, path: string) =>
		invoke<void>("plugin_delete_skill_file", { scope, skillId, path }),

	pluginMcpServers: (scope: PluginScope) =>
		invoke<BotMcpServer[]>("plugin_mcp_servers", { scope }),

	setPluginMcpServer: (
		scope: PluginScope,
		name: string,
		config: Record<string, unknown>,
		mark?: McpServerMark,
	) =>
		invoke<BotMcpServer>("plugin_set_mcp_server", {
			scope,
			name,
			config,
			mark,
		}),

	deletePluginMcpServer: (scope: PluginScope, name: string) =>
		invoke<void>("plugin_delete_mcp_server", { scope, name }),

	pluginHistory: (scope: PluginScope) =>
		invoke<BotHistoryEntry[]>("plugin_history", { scope }),

	pluginHistoryDiff: (
		scope: PluginScope,
		oldestCommitId: string,
		newestCommitId: string,
	) =>
		invoke<BotChangedFile[]>("plugin_history_diff", {
			scope,
			oldestCommitId,
			newestCommitId,
		}),

	revertPlugin: (
		scope: PluginScope,
		oldestCommitId: string,
		newestCommitId: string,
	) =>
		invoke<BotHistoryEntry[]>("plugin_revert", {
			scope,
			oldestCommitId,
			newestCommitId,
		}),

	environmentVariables: (scope: EnvScope) =>
		invoke<EnvEntry[]>("env_list", { scope }),

	setEnvironmentVariable: (scope: EnvScope, name: string, value: string) =>
		invoke<void>("env_set", { scope, name, value }),

	deleteEnvironmentVariable: (scope: EnvScope, name: string) =>
		invoke<void>("env_delete", { scope, name }),

	recordBotCommands: (botId: string, commands: AgentCommand[]) =>
		invoke<void>("conversation_record_bot_commands", { botId, commands }),

	botCommands: (botId: string) =>
		invoke<AgentCommand[]>("conversation_bot_commands", { botId }),

	mainChat: (botId: string, spaceId?: string | null, signal?: AbortSignal) =>
		invoke<Chat>(
			"conversation_main_chat",
			{ botId, spaceId: spaceOrJoined(spaceId) },
			{ signal },
		),

	conversationPage: (
		spaceId: string,
		cursor: string | null,
		limit: number,
		signal?: AbortSignal,
	) =>
		invoke<ConversationPage>(
			"conversation_page",
			{ spaceId, cursor, limit },
			{ signal },
		),

	conversationSoloStates: (spaceId: string, signal?: AbortSignal) =>
		invoke<SoloState[]>("conversation_solo_states", { spaceId }, { signal }),

	createConversation: ({
		spaceId,
		sectionId,
		title,
		botIds,
	}: ConversationDraft) =>
		invoke<Conversation>("conversation_create", {
			spaceId,
			sectionId,
			title,
			botIds,
		}),

	updateConversation: (
		conversationId: string,
		{ title, instructions, sectionId, icon, color }: ConversationEdit,
	) =>
		invoke<Conversation>("conversation_update", {
			conversationId,
			title,
			instructions,
			sectionId,
			icon,
			color,
		}),

	deleteConversation: (conversationId: string) =>
		invoke<void>("conversation_delete", { conversationId }),

	addConversationParticipant: (conversationId: string, botId: string) =>
		invoke<Conversation>("conversation_add_participant", {
			conversationId,
			botId,
			invitedByBotId: null,
		}),

	removeConversationParticipant: (conversationId: string, botId: string) =>
		invoke<Conversation>("conversation_remove_participant", {
			conversationId,
			botId,
		}),

	setConversationLead: (conversationId: string, botId: string) =>
		invoke<Conversation>("conversation_set_lead", { conversationId, botId }),

	openRuntimeSession: (
		conversationId: string,
		botId: string,
		startedAt: number,
		runtimeSessionId: string | null,
		reason: string | null,
	) =>
		invoke<RuntimeSession>("conversation_open_runtime_session", {
			conversationId,
			botId,
			startedAt,
			runtimeSessionId,
			reason,
		}),

	recordProviderSession: (
		conversationId: string,
		botId: string,
		runtimeSessionId: string,
		providerSessionId: string,
	) =>
		invoke<void>("conversation_record_provider_session", {
			conversationId,
			botId,
			runtimeSessionId,
			providerSessionId,
		}),

	boundedContext: (
		conversationId: string,
		botId: string,
		runtimeSessionId: string,
		promptMessageId: string,
	) =>
		invoke<string>("conversation_bounded_context", {
			conversationId,
			botId,
			runtimeSessionId,
			promptMessageId,
		}),

	messageHeader: (conversationId: string, messageId: string) =>
		invoke<string>("conversation_message_header", {
			conversationId,
			messageId,
		}),

	captureCheckpoint: (
		conversationId: string,
		botId: string,
		runtimeSessionId: string,
		createdAt: number,
	) =>
		invoke<ContextCheckpoint | null>("conversation_capture_checkpoint", {
			conversationId,
			botId,
			runtimeSessionId,
			createdAt,
		}),

	messageReference: (conversationId: string, messageId: string) =>
		invoke<MessageReference | null>("conversation_message_reference", {
			conversationId,
			messageId,
		}),

	pinMessage: (
		conversationId: string,
		messageId: string,
		blockIndex: number,
		pinnedAt: number,
	) =>
		invoke<void>("conversation_pin_message", {
			conversationId,
			messageId,
			blockIndex,
			pinnedAt,
		}),

	unpinMessage: (
		conversationId: string,
		messageId: string,
		blockIndex: number,
	) =>
		invoke<void>("conversation_unpin_message", {
			conversationId,
			messageId,
			blockIndex,
		}),

	pinnedMessages: (conversationId: string) =>
		invoke<MessagePin[]>("conversation_pinned_messages", {
			conversationId,
		}),

	appendUserMessage: (message: NewUserMessage) =>
		invoke<number>("conversation_append_user_message", { message }),

	sendUserMessage: (message: NewUserMessage, summoned: string[]) =>
		invoke<number>("conversation_send_user_message", { message, summoned }),
}
