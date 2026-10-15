export type {
	ActiveTurn,
	ApplicationMark_Serialize as McpServerMark,
	AvatarBlot,
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
	EnvEntry_Serialize as EnvEntry,
	EnvOwner,
	EnvScope_Serialize as EnvScope,
	HistoryAuthor as BotHistoryAuthor,
	Json as BotSkillValue,
	LastWord as StoredLastWord,
	McpServer_Serialize as BotMcpServer,
	MessageReference,
	NewAssistantMessage,
	NewTurn,
	NewUserMessage,
	Participant,
	ParticipantRole,
	PinnedBubble as MessagePin,
	PluginScope,
	RosterPin,
	RuntimeSession,
	Section,
	SectionError,
	Skill as BotSkill,
	SkillDraft as BotSkillDraft,
	SkillFront as BotSkillFront,
	Space,
	SpaceError,
	SpacePreferences,
	SuggestedBot,
	TranscriptStoreError,
} from "@/lib/bindings"

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
}
