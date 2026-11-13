import type { TFunction } from "i18next"
import type { ComponentProps, ReactNode } from "react"

import type {
	AppRailPanel,
	AppRailSettings,
} from "@workspace/ui/components/app-rail"
import type {
	BotBadge,
	BotMissionState,
	BotMissionTicket,
} from "@workspace/ui/components/bot-badge"
import type { ActivityIndicatorKind } from "@workspace/ui/components/bot-identity-avatar"
import type { ConversationParticipant } from "@workspace/ui/components/conversation-bot-pile"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import type { ListEnd } from "@workspace/ui/components/list-skeleton"
import type { SidebarClickModifiers } from "@workspace/ui/components/sidebar-menu-row"
import type { Space } from "@workspace/ui/components/space"
import type {
	SpaceInvitation,
	SpaceInvitationCallbacks,
} from "@workspace/ui/components/space-invitations"
import type { TitleBarTabsProps } from "@workspace/ui/components/title-bar-tabs"
import type { Sidebar } from "@workspace/ui/components/ui/sidebar"
import type { UserChipIdentity } from "@workspace/ui/components/user-chip"
import { toPlainText } from "@workspace/ui/lib/plain-text"

type AppSidebarOpenPanel = Exclude<AppRailPanel, "library">

const ROW_AVATAR_SIZE = 28

type AppSidebarStatus = "idle" | "working"

const NO_BOTS: AppSidebarBot[] = []

const NO_CONVERSATIONS: AppSidebarConversation[] = []

const NO_SECTIONS: AppSidebarSection[] = []

const NO_COLLAPSED_SECTIONS: string[] = []

interface AppSidebarSection {
	id: string
	name: string
	position: number
}

interface AppSidebarRowMission {
	id: string
	state: BotMissionState
	ticket: BotMissionTicket
	objective?: string
	isLive?: boolean
}

interface AppSidebarBot {
	id: string
	name: string
	sectionId?: string | null
	pinPosition?: number | null
	title?: string
	lastMessage?: string
	timestamp?: string
	lastActivityAt?: number
	blot?: number | null
	image?: string
	status?: AppSidebarStatus
	pose?: ActivityIndicatorKind
	backgroundTasks?: number
	badge?: BotBadge
	pendingQuestion?: string
	missions?: AppSidebarRowMission[]
}

interface AppSidebarConversation {
	id: string
	name: string
	sectionId?: string | null
	pinPosition?: number | null
	participants: AppSidebarBot[]
	agent?: AppSidebarBot
	lastMessage?: string
	lastSpeaker?: string
	timestamp?: string
	isNotSent?: boolean
	lastActivityAt?: number
	status?: AppSidebarStatus
	badge?: BotBadge
	pendingQuestion?: string
	missions?: AppSidebarRowMission[]
	icon?: string
	color?: number | null
}

const poseOf = (bot: AppSidebarBot) => bot.pose ?? "thinking"

const isBusy = (held: { status?: AppSidebarStatus }) =>
	held.status === "working"

const badgeOf = (conversation: AppSidebarConversation) =>
	conversation.participants.find(
		(participant) => isBusy(participant) && participant.badge,
	)?.badge ?? conversation.badge

type NeedsYouCarrier = {
	badge?: BotBadge
	pendingQuestion?: string
}

const isNeedingYou = ({ badge, pendingQuestion }: NeedsYouCarrier) =>
	Boolean(pendingQuestion) || badge === "attention"

const workingBotOf = ({ participants, lastSpeaker }: AppSidebarConversation) =>
	participants.find((bot) => isBusy(bot) && bot.name === lastSpeaker) ??
	participants.find(isBusy)

const workingTextOf = (t: TFunction<"bots">, bot: AppSidebarBot) =>
	bot.backgroundTasks
		? t("roster.backgroundTasks", { count: bot.backgroundTasks })
		: t("roster.working", { pose: t(`roster.pose.${poseOf(bot)}`) })

const botPreviewOf = (t: TFunction<"bots">, bot: AppSidebarBot) => {
	if (!isBusy(bot)) return bot.lastMessage ? toPlainText(bot.lastMessage) : ""
	return workingTextOf(t, bot)
}

const previewOf = (
	t: TFunction<"bots">,
	conversation: AppSidebarConversation,
) => {
	const working = workingBotOf(conversation)
	if (working)
		return t("roster.conversation.preview", {
			name: working.name,
			text: workingTextOf(t, working),
		})
	if (!conversation.lastMessage) return null
	const text = toPlainText(conversation.lastMessage)
	const speaker = conversation.isNotSent
		? t("roster.conversation.you")
		: conversation.lastSpeaker
	if (!speaker) return text
	return t("roster.conversation.preview", { name: speaker, text })
}

const announcementFor = (
	t: TFunction<"bots">,
	bot?: AppSidebarBot,
	conversation?: AppSidebarConversation,
) => {
	if (conversation)
		return t("roster.announcement.selected", {
			name: conversation.name,
			state: isBusy(conversation) ? t("roster.pose.working") : t("roster.idle"),
		})
	if (!bot) return t("roster.announcement.none")
	return t("roster.announcement.selected", {
		name: bot.name,
		state: isBusy(bot) ? t(`roster.pose.${poseOf(bot)}`) : t("roster.idle"),
	})
}

interface BotRosterActions {
	onSelectBot?: (id: string, modifiers?: SidebarClickModifiers) => void
	onOpenBotInNewTab?: (id: string) => void
	onEditBot?: (id: string) => void
	onDuplicateBot?: (id: string) => void
	onAddBotToSpace?: (botId: string, spaceId: string) => void
	onRemoveBotFromSpace?: (botId: string, spaceId: string) => void
	onDeleteBot?: (id: string) => void
}

interface SectionNaming {
	rowId: string | null
}

interface RosterCreateActions {
	onCreateBot?: () => void
	onCreateConversation?: () => void
}

interface RosterPin {
	id: string
	sectionId: string | null
}

interface SectionActions {
	onCreateSection?: (name: string, rowId?: string) => void
	onRenameSection?: (id: string, name: string) => void
	onDeleteSection?: (id: string) => void
	onCollapseSection?: (id: string, isCollapsed: boolean) => void
	onPinRoster?: (spaceId: string, pins: RosterPin[]) => void
}

interface BotMembershipQuery {
	botId: string
	botsBySpaceId?: Record<string, AppSidebarBot[]>
}

const spaceIdsOfBot = ({
	botId,
	botsBySpaceId,
}: BotMembershipQuery): string[] => {
	if (!botsBySpaceId) return []
	return Object.entries(botsBySpaceId)
		.filter(([, held]) => held.some((bot) => bot.id === botId))
		.map(([spaceId]) => spaceId)
}

const heldBotsOf = (
	conversation: AppSidebarConversation,
): ConversationParticipant[] =>
	conversation.participants.map((participant) => ({
		...participant,
		kind: poseOf(participant),
		working: isBusy(participant),
	}))

interface ConversationRosterActions {
	onSelectConversation?: (id: string, modifiers?: SidebarClickModifiers) => void
	onOpenConversationInNewTab?: (id: string) => void
	onOpenConversationSettings?: (id: string) => void
	onDeleteConversation?: (id: string) => void
}

type SidebarShellProps = Omit<
	ComponentProps<typeof Sidebar>,
	"children" | "collapsible"
>

interface AppSidebarProps
	extends SidebarShellProps,
		BotRosterActions,
		ConversationRosterActions,
		SectionActions,
		TitleBarTabsProps {
	bots: AppSidebarBot[]
	haveBotsFailedToLoad?: boolean
	onRetryLoadBots?: () => void
	rosterSkeleton?: ReactNode
	rosterListEnd?: ListEnd
	botsBySpaceId?: Record<string, AppSidebarBot[]>
	conversations?: AppSidebarConversation[]
	conversationsBySpaceId?: Record<string, AppSidebarConversation[]>
	badgesBySpaceId?: Record<string, BotBadge>
	sections?: AppSidebarSection[]
	sectionsBySpaceId?: Record<string, AppSidebarSection[]>
	collapsedSectionIds?: string[]
	selectedBotId?: string
	selectedConversationId?: string
	onCreateBot?: () => void
	onCreateConversation?: () => void
	space?: Space
	spaces?: Space[]
	selectedSpaceId?: string
	isSpaceSwitchingEnabled?: boolean
	onSelectSpace?: (id: string) => void
	onReorderSpaces?: (ids: string[]) => void
	onCreateSpace?: () => void
	hostBySpaceId?: Record<string, SpaceHost>
	spaceHost?: SpaceHost
	invitations?: SpaceInvitation[]
	onAcceptInvitation?: SpaceInvitationCallbacks["onAcceptInvitation"]
	onDeclineInvitation?: SpaceInvitationCallbacks["onDeclineInvitation"]
	onRetryInvitation?: SpaceInvitationCallbacks["onRetryInvitation"]
	onSpaceSwitcherOpenChange?: (isOpen: boolean) => void
	onOpenSpaceSettings?: () => void
	updateBadge?: ReactNode
	user?: UserChipIdentity
	onOpenUserSettings?: () => void
	onOpenSearch?: () => void
	isSearchOpen?: boolean
	onSearchMissions?: () => void
	insetWindowControls?: boolean
	windowControls?: ReactNode
	openPanel?: string
	openSettings?: AppRailSettings
	onOpenPanelChange?: (panel: AppSidebarOpenPanel) => void
	onSelectLibrary?: () => void
	"data-tauri-drag-region"?: string
}

export {
	type AppSidebarBot,
	type AppSidebarConversation,
	type AppSidebarOpenPanel,
	type AppSidebarProps,
	type AppSidebarRowMission,
	type AppSidebarSection,
	announcementFor,
	type BotRosterActions,
	badgeOf,
	botPreviewOf,
	type ConversationRosterActions,
	heldBotsOf,
	isBusy,
	isNeedingYou,
	NO_BOTS,
	NO_COLLAPSED_SECTIONS,
	NO_CONVERSATIONS,
	NO_SECTIONS,
	poseOf,
	previewOf,
	ROW_AVATAR_SIZE,
	type RosterCreateActions,
	type RosterPin,
	type SectionActions,
	type SectionNaming,
	type SidebarClickModifiers,
	spaceIdsOfBot,
	workingBotOf,
}
