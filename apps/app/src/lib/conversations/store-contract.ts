export type {
	ActiveTurn,
	ApplicationMark_Serialize as McpServerMark,
	Bot,
	BotChangedFile,
	BotDraft,
	BotHistoryEntry,
	BotIdentity,
	Chat,
	ContextCheckpoint,
	Conversation,
	ConversationInPage,
	ConversationPage,
	ConversationState as ConversationHostState,
	EnvEntry_Serialize as EnvEntry,
	EnvOwner,
	EnvScope_Serialize as EnvScope,
	HistoryAuthor as BotHistoryAuthor,
	Hue,
	Json as BotSkillValue,
	LastWord as StoredLastWord,
	McpServer_Serialize as BotMcpServer,
	MessageReference,
	NewAssistantMessage,
	NewTurn,
	NewUserMessage,
	ObservedState,
	Participant,
	ParticipantRole,
	PendingPrompt,
	PinnedBubble as MessagePin,
	PluginScope,
	RosterPin,
	RuntimeSession,
	Section,
	SectionError,
	Skill as BotSkill,
	SkillDraft as BotSkillDraft,
	SkillFront as BotSkillFront,
	SoloState,
	Space,
	SpaceError,
	SpacePreferences,
	SuggestedBot,
	TranscriptStoreError,
} from "@/lib/bindings"

import type { Hue } from "@/lib/bindings"

export type ConversationDraft = {
	spaceId: string
	sectionId: string | null
	title: string
	botIds: string[]
}

export type ConversationEdit = {
	title: string
	instructions: string
	sectionId: string | null
	icon: string | null
	color: Hue | null
}
