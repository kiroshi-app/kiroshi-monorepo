import { useCallback, useSyncExternalStore } from "react"

import { Notice } from "@workspace/ui/components/notice"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"
import { useCommonCopy } from "@workspace/ui/hooks/use-common-copy"

import { BareAppHeader } from "@/components/bare-app-header"
import {
	HomeEmptyStage,
	HomeLines,
	type ThreadHome,
} from "@/components/home-screen"
import { MissionThreadScreen } from "@/components/mission-thread-screen"
import type { ActivityPanel } from "@/components/thread-routines"
import { ThreadScreen } from "@/components/thread-screen"
import type { AttachmentsController } from "@/lib/chat/attachments-controller"
import type { DraftsController } from "@/lib/chat/drafts-controller"
import type { Thread } from "@/lib/chat/thread-contract"
import type { Chat } from "@/lib/chat/use-chat"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { archiveOf, type HomeRenewals } from "@/lib/home/home-renewals"
import type { MissionLanding } from "@/lib/missions/mission-actions"
import type { OpenedMissionController } from "@/lib/missions/opened-mission-controller"
import type { ThreadSearch } from "@/lib/navigation/thread-search"
import type { OnboardingCreation } from "@/lib/onboarding/onboarding-flow-controller"
import type { SignIn } from "@/lib/onboarding/use-sign-in"
import type { MessageLandingController } from "@/lib/search/message-landing-controller"

type WorkspaceBodyProps = {
	activityPanel: ActivityPanel
	haveSpacesFailed: boolean
	onRetrySpaces: () => void
	bot?: Bot
	bots: Bot[]
	conversation?: Conversation
	conversations: Conversation[]
	conversationRuntimes: ConversationRuntimes
	store: TranscriptStore
	homeRenewals: HomeRenewals
	onSelectBot: (botId: string) => void
	chat: Chat
	attachments: AttachmentsController
	drafts: DraftsController
	landings: MessageLandingController
	readerName: string
	isOverlayOpen: boolean
	onToggleSettings: () => void
	isMissionsPanelOpen: boolean
	onOpenConversationSettings: (conversationId: string) => void
	onOpenThreadInNewTab: (thread: ThreadSearch) => void
	missions: OpenedMissionController
	onboardingCreation?: OnboardingCreation
	signIn: SignIn
	spaceId: string | null
	spaceRowId: string | null
}

const threadOf = ({
	bot,
	conversation,
	conversationRuntimes,
	chat,
	isOverlayOpen,
	onToggleSettings,
	onOpenConversationSettings,
}: WorkspaceBodyProps): Thread | null => {
	if (conversation) {
		return {
			kind: "conversation",
			conversation,
			runtimes: conversationRuntimes,
			onOpenSettings: onOpenConversationSettings,
		}
	}
	if (bot) {
		return {
			kind: "bot",
			bot,
			chat,
			isOverlayOpen,
			onToggleSettings,
		}
	}
	return null
}

type MissionRow = Pick<WorkspaceBodyProps, "conversation" | "bot">

const missionThreadOf = (
	{ conversation, bot }: MissionRow,
	missionId: string,
): ThreadSearch | null => {
	if (conversation) {
		return { conversation: conversation.id, mission: missionId }
	}
	if (bot) {
		return { bot: bot.id, mission: missionId }
	}
	return null
}

type HomeSeatInput = WorkspaceBodyProps & { bot: Bot }

const useHomeSeat = (props: HomeSeatInput): ThreadHome => {
	const { bot, homeRenewals, onOpenThreadInNewTab, spaceId } = props
	const archives = useSyncExternalStore(
		homeRenewals.subscribe,
		homeRenewals.getState,
	)
	const openConversation = (conversationId: string) =>
		onOpenThreadInNewTab({ conversation: conversationId })
	const lines = (
		<HomeLines
			agent={bot}
			bots={props.bots}
			conversations={props.conversations}
			key={bot.id}
			onOpenRoom={openConversation}
			runtimes={props.conversationRuntimes}
			spaceId={spaceId}
			store={props.store}
		/>
	)

	return {
		lines,
		emptyStage: (send) => (
			<HomeEmptyStage
				{...send}
				agent={bot}
				agents={props.bots}
				archive={archiveOf(archives, bot.id, spaceId)}
				lines={lines}
				onOpenArchive={openConversation}
				onSelectAgent={props.onSelectBot}
				readerName={props.readerName}
			/>
		),
	}
}

type BotThreadScreenProps = HomeSeatInput & {
	thread: Thread
	onOpenMission: (missionId: string, landing?: MissionLanding) => void
	onOpenMissionInNewTab: (missionId: string) => void
}

const BotThreadScreen = (props: BotThreadScreenProps) => (
	<ThreadScreen
		activityPanel={props.activityPanel}
		attachments={props.attachments}
		bots={props.bots}
		drafts={props.drafts}
		home={useHomeSeat(props)}
		landings={props.landings}
		onboardingCreation={props.onboardingCreation}
		onOpenMission={props.onOpenMission}
		onOpenMissionInNewTab={props.onOpenMissionInNewTab}
		readerName={props.readerName}
		runtimes={props.conversationRuntimes}
		signIn={props.signIn}
		spaceId={props.spaceId}
		thread={props.thread}
	/>
)

export function WorkspaceBody(props: WorkspaceBodyProps) {
	const t = useCommonCopy()
	const { missions } = props
	const opened = useSyncExternalStore(missions.subscribe, missions.getState)
	const rowId = props.conversation?.id ?? props.bot?.id ?? null
	const { spaceRowId } = props

	const openMission = useCallback(
		(missionId: string, landing?: MissionLanding) => {
			if (rowId && spaceRowId) {
				missions.open({ missionId, rowId, spaceId: spaceRowId, landing })
			}
		},
		[missions, rowId, spaceRowId],
	)
	const { conversation, bot, onOpenThreadInNewTab } = props
	const openMissionInNewTab = useCallback(
		(missionId: string) => {
			const thread = missionThreadOf({ conversation, bot }, missionId)
			if (thread) {
				onOpenThreadInNewTab(thread)
			}
		},
		[conversation, bot, onOpenThreadInNewTab],
	)
	const leaveMission = useCallback(() => missions.leave(), [missions])

	const openedMission = opened && opened.rowId === rowId ? opened : null

	if (props.haveSpacesFailed) {
		return (
			<ScreenLayout header={<BareAppHeader />}>
				<Notice
					description={t("spaces.unavailable.description")}
					retry={{ onRetry: props.onRetrySpaces }}
					title={t("spaces.unavailable.title")}
				/>
			</ScreenLayout>
		)
	}

	if (openedMission) {
		return (
			<MissionThreadScreen
				activityPanel={props.activityPanel}
				attachments={props.attachments}
				bots={props.bots}
				drafts={props.drafts}
				landings={props.landings}
				onLeave={leaveMission}
				onOpenMission={openMission}
				onOpenMissionInNewTab={openMissionInNewTab}
				opening={openedMission}
				readerName={props.readerName}
				runtimes={props.conversationRuntimes}
			/>
		)
	}

	const thread = props.isMissionsPanelOpen ? null : threadOf(props)

	if (!thread) {
		return <ScreenLayout header={<BareAppHeader />} />
	}

	if (thread.kind === "bot") {
		return (
			<BotThreadScreen
				{...props}
				bot={thread.bot}
				onOpenMission={openMission}
				onOpenMissionInNewTab={openMissionInNewTab}
				thread={thread}
			/>
		)
	}

	return (
		<ThreadScreen
			activityPanel={props.activityPanel}
			attachments={props.attachments}
			bots={props.bots}
			drafts={props.drafts}
			landings={props.landings}
			onboardingCreation={props.onboardingCreation}
			onOpenMission={openMission}
			onOpenMissionInNewTab={openMissionInNewTab}
			readerName={props.readerName}
			runtimes={props.conversationRuntimes}
			signIn={props.signIn}
			spaceId={props.spaceId}
			thread={thread}
		/>
	)
}
