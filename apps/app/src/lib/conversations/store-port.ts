import type {
	AvatarBlot,
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
import type { TerminalCompletion } from "./transcript-contract"
import type { TranscriptPort } from "./transcript-port"

import type { AgentCommand } from "@/lib/agent/contract"

export type TranscriptStore = TranscriptPort & {
	spaces: () => Promise<Space[]>
	createSpace: (name: string) => Promise<Space>
	updateSpace: (id: string, name: string, colour?: AvatarBlot) => Promise<Space>
	reorderSpaces: (ids: string[]) => Promise<void>
	deleteSpace: (id: string) => Promise<void>
	exportSpace: (id: string, path: string) => Promise<void>
	importSpace: (path: string) => Promise<Space>
	spacePreferences: (spaceId: string) => Promise<SpacePreferences>
	setSpacePreferences: (
		spaceId: string,
		preferences: SpacePreferences,
	) => Promise<SpacePreferences>
	sections: (spaceId: string) => Promise<Section[]>
	createSection: (spaceId: string, name: string) => Promise<Section>
	renameSection: (id: string, name: string) => Promise<Section>
	pinRoster: (spaceId: string, pins: RosterPin[]) => Promise<void>
	deleteSection: (id: string) => Promise<void>
	moveBotToSection: (botId: string, sectionId: string | null) => Promise<void>
	moveBotToSpace: (botId: string, spaceId: string) => Promise<void>
	bots: (spaceId?: string | null, signal?: AbortSignal) => Promise<Bot[]>
	botsByPresence: (
		spaceId: string,
		excludedConversationId?: string | null,
	) => Promise<Bot[]>
	createBot: (identity: BotIdentity, spaceId?: string | null) => Promise<Bot>
	createBotFromDraft: (draft: BotDraft, spaceId: string) => Promise<Bot>
	suggestedBots: () => Promise<SuggestedBot[]>
	duplicateBot: (botId: string, spaceId?: string | null) => Promise<Bot>
	updateBot: (id: string, identity: BotIdentity) => Promise<Bot>
	deleteBot: (id: string) => Promise<void>
	setBotAvatarImage: (id: string, bytes: Uint8Array) => Promise<Bot>
	setBotMemory: (id: string, memory: string) => Promise<Bot>
	pluginSkills: (scope: PluginScope) => Promise<BotSkill[]>
	createPluginSkill: (
		scope: PluginScope,
		draft: BotSkillDraft,
	) => Promise<BotSkill>
	updatePluginSkill: (
		scope: PluginScope,
		skillId: string,
		draft: BotSkillDraft,
	) => Promise<BotSkill>
	setPluginSkillPreloaded: (
		scope: PluginScope,
		skillId: string,
		isPreloaded: boolean,
	) => Promise<BotSkill>
	deletePluginSkill: (scope: PluginScope, skillId: string) => Promise<void>
	pluginSkillFile: (
		scope: PluginScope,
		skillId: string,
		path: string,
	) => Promise<string>
	writePluginSkillFile: (
		scope: PluginScope,
		skillId: string,
		path: string,
		text: string,
	) => Promise<BotSkill>
	deletePluginSkillFile: (
		scope: PluginScope,
		skillId: string,
		path: string,
	) => Promise<void>
	pluginMcpServers: (scope: PluginScope) => Promise<BotMcpServer[]>
	setPluginMcpServer: (
		scope: PluginScope,
		name: string,
		config: Record<string, unknown>,
		mark?: McpServerMark,
	) => Promise<BotMcpServer>
	deletePluginMcpServer: (scope: PluginScope, name: string) => Promise<void>
	pluginHistory: (scope: PluginScope) => Promise<BotHistoryEntry[]>
	pluginHistoryDiff: (
		scope: PluginScope,
		oldestCommitId: string,
		newestCommitId: string,
	) => Promise<BotChangedFile[]>
	revertPlugin: (
		scope: PluginScope,
		oldestCommitId: string,
		newestCommitId: string,
	) => Promise<BotHistoryEntry[]>
	environmentVariables: (scope: EnvScope) => Promise<EnvEntry[]>
	setEnvironmentVariable: (
		scope: EnvScope,
		name: string,
		value: string,
	) => Promise<void>
	deleteEnvironmentVariable: (scope: EnvScope, name: string) => Promise<void>
	recordBotCommands: (botId: string, commands: AgentCommand[]) => Promise<void>
	botCommands: (botId: string) => Promise<AgentCommand[]>
	mainChat: (
		botId: string,
		spaceId?: string | null,
		signal?: AbortSignal,
	) => Promise<Chat>
	addBotToSpace: (
		botId: string,
		spaceId: string,
		sectionId?: string | null,
	) => Promise<void>
	removeBotFromSpace: (botId: string, spaceId: string) => Promise<void>
	conversations: (spaceId: string) => Promise<Conversation[]>
	conversationPage: (
		spaceId: string,
		cursor: string | null,
		limit: number,
		signal?: AbortSignal,
	) => Promise<ConversationPage>
	conversationSoloStates: (
		spaceId: string,
		signal?: AbortSignal,
	) => Promise<SoloState[]>
	createConversation: (draft: ConversationDraft) => Promise<Conversation>
	updateConversation: (
		conversationId: string,
		edit: ConversationEdit,
	) => Promise<Conversation>
	deleteConversation: (conversationId: string) => Promise<void>
	addConversationParticipant: (
		conversationId: string,
		botId: string,
	) => Promise<Conversation>
	removeConversationParticipant: (
		conversationId: string,
		botId: string,
	) => Promise<Conversation>
	setConversationLead: (
		conversationId: string,
		botId: string,
	) => Promise<Conversation>
	openRuntimeSession: (
		conversationId: string,
		botId: string,
		startedAt: number,
		runtimeSessionId: string | null,
		reason: string | null,
	) => Promise<RuntimeSession>
	recordProviderSession: (
		conversationId: string,
		botId: string,
		runtimeSessionId: string,
		providerSessionId: string,
	) => Promise<void>
	boundedContext: (
		conversationId: string,
		botId: string,
		runtimeSessionId: string,
		promptMessageId: string,
	) => Promise<string>
	messageHeader: (conversationId: string, messageId: string) => Promise<string>
	captureCheckpoint: (
		conversationId: string,
		botId: string,
		runtimeSessionId: string,
		createdAt: number,
	) => Promise<ContextCheckpoint | null>
	messageReference: (
		conversationId: string,
		messageId: string,
	) => Promise<MessageReference | null>
	pinMessage: (
		conversationId: string,
		messageId: string,
		blockIndex: number,
		pinnedAt: number,
	) => Promise<void>
	unpinMessage: (
		conversationId: string,
		messageId: string,
		blockIndex: number,
	) => Promise<void>
	pinnedMessages: (conversationId: string) => Promise<MessagePin[]>
	startTurn: (turn: NewTurn) => Promise<number>
	completeTurn: (id: string, completedAt: number) => Promise<void>
	appendUserMessage: (message: NewUserMessage) => Promise<number>
	sendUserMessage: (
		message: NewUserMessage,
		summoned: string[],
	) => Promise<number>
	openAssistantMessage: (message: NewAssistantMessage) => Promise<number>
	appendText: (id: string, delta: string) => Promise<void>
	finalizeMessage: (
		id: string,
		completion: TerminalCompletion,
		settledText?: string,
	) => Promise<void>
}
