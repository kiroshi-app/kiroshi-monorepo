import type { TFunction } from "i18next"
import type { ComponentProps, ReactNode } from "react"

import type {
	AppRailDots,
	AppRailPanel,
} from "@workspace/ui/components/app-rail"
import type {
	BotBadge,
	BotMissionState,
	BotMissionTicket,
} from "@workspace/ui/components/bot-badge"
import type { ActivityIndicatorKind } from "@workspace/ui/components/bot-identity-avatar"
import type { BotAvatarBlot } from "@workspace/ui/components/companion-colour"
import type { ConversationParticipant } from "@workspace/ui/components/conversation-bot-pile"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import type { ListEnd } from "@workspace/ui/components/list-skeleton"
import type { MissionsPanelProps } from "@workspace/ui/components/missions-panel"
import type { Space } from "@workspace/ui/components/space"
import type {
	SpaceInvitation,
	SpaceInvitationCallbacks,
} from "@workspace/ui/components/space-invitations"
import type { Sidebar } from "@workspace/ui/components/ui/sidebar"
import type { UserChipIdentity } from "@workspace/ui/components/user-chip"
import { toPlainText } from "@workspace/ui/lib/plain-text"

const ROW_AVATAR_SIZE = 40

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
	blot?: BotAvatarBlot
	image?: string
	status?: AppSidebarStatus
	pose?: ActivityIndicatorKind
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
	lastMessage?: string
	lastSpeaker?: string
	timestamp?: string
	lastActivityAt?: number
	status?: AppSidebarStatus
	badge?: BotBadge
	pendingQuestion?: string
	missions?: AppSidebarRowMission[]
	icon?: string
	color?: BotAvatarBlot
}

const poseOf = (bot: AppSidebarBot) => bot.pose ?? "thinking"

const isBusy = (held: { status?: AppSidebarStatus }) =>
	held.status === "working"

const badgeOf = (conversation: AppSidebarConversation) =>
	conversation.participants.find(
		(participant) => isBusy(participant) && participant.badge,
	)?.badge ?? conversation.badge

const workingBotOf = ({ participants, lastSpeaker }: AppSidebarConversation) =>
	participants.find((bot) => isBusy(bot) && bot.name === lastSpeaker) ??
	participants.find(isBusy)

const botPreviewOf = (t: TFunction<"bots">, bot: AppSidebarBot) => {
	if (isBusy(bot))
		return t("roster.working", { pose: t(`roster.pose.${poseOf(bot)}`) })
	return bot.lastMessage ? toPlainText(bot.lastMessage) : ""
}

const previewOf = (
	t: TFunction<"bots">,
	conversation: AppSidebarConversation,
) => {
	const working = workingBotOf(conversation)
	if (working)
		return t("roster.conversation.preview", {
			name: working.name,
			text: t("roster.working", { pose: t(`roster.pose.${poseOf(working)}`) }),
		})
	if (!conversation.lastMessage) return null
	const text = toPlainText(conversation.lastMessage)
	if (!conversation.lastSpeaker) return text
	return t("roster.conversation.preview", {
		name: conversation.lastSpeaker,
		text,
	})
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
	onSelectBot?: (id: string) => void
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

interface RosterSpaceActions {
	onOpenSpaceSettings?: () => void
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
	onSelectConversation?: (id: string) => void
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
		SectionActions {
	bots: AppSidebarBot[]
	haveBotsFailedToLoad?: boolean
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
	spaces?: Space[]
	selectedSpaceId?: string
	isSpaceSwitchingEnabled?: boolean
	onSelectSpace?: (id: string) => void
	onReorderSpaces?: (ids: string[]) => void
	onCreateSpace?: () => void
	onLeaveSpace?: () => void
	hostBySpaceId?: Record<string, SpaceHost>
	onShare?: () => void
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
	missionsBySpaceId?: Record<string, MissionsPanelProps>
	onSearchMissions?: () => void
	insetWindowControls?: boolean
	windowControls?: ReactNode
	railDots?: AppRailDots
	openPanel?: string
	onOpenPanelChange?: (panel: AppRailPanel) => void
	"data-tauri-drag-region"?: string
}

export {
	type AppSidebarBot,
	type AppSidebarConversation,
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
	NO_BOTS,
	NO_COLLAPSED_SECTIONS,
	NO_CONVERSATIONS,
	NO_SECTIONS,
	poseOf,
	previewOf,
	ROW_AVATAR_SIZE,
	type RosterCreateActions,
	type RosterPin,
	type RosterSpaceActions,
	type SectionActions,
	type SectionNaming,
	spaceIdsOfBot,
	workingBotOf,
}
