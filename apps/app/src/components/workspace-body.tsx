import { useCallback, useContext, useSyncExternalStore } from "react"

import { Notice } from "@workspace/ui/components/notice"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"
import { SpaceAccessBanner } from "@workspace/ui/components/space-access-banner"
import { useCommonCopy } from "@workspace/ui/hooks/use-common-copy"

import { BareAppHeader } from "@/components/bare-app-header"
import { HomeEmptyStage, HomeLines } from "@/components/home-screen"
import { MissionThreadScreen } from "@/components/mission-thread-screen"
import type { ActivityPanel } from "@/components/thread-routines"
import { ThreadScreen } from "@/components/thread-screen"
import {
	type HomeConversationStart,
	useHomeSend,
} from "@/components/use-home-send"
import type { AttachmentsController } from "@/lib/chat/attachments-controller"
import type { DraftsController } from "@/lib/chat/drafts-controller"
import type { Thread } from "@/lib/chat/thread-contract"
import type { Chat } from "@/lib/chat/use-chat"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { type HomeVisits, visitOf } from "@/lib/home/home-visits"
import type { MissionLanding } from "@/lib/missions/mission-actions"
import type { OpenedMissionController } from "@/lib/missions/opened-mission-controller"
import type { ThreadSearch } from "@/lib/navigation/thread-search"
import type { OnboardingCreation } from "@/lib/onboarding/onboarding-flow-controller"
import type { SignIn } from "@/lib/onboarding/use-sign-in"
import type { MessageLandingController } from "@/lib/search/message-landing-controller"
import {
	OpenJoinedHostContext,
	spaceAccessOf,
} from "@/lib/spaces/open-joined-host"

type HomeSeat = HomeConversationStart & {
	visits: HomeVisits
	store: TranscriptStore
	conversations: Conversation[]
	onSelectAgent: (botId: string) => void
	arrivalKey?: string
}

export type WorkspaceBodyProps = {
	activityPanel: ActivityPanel
	haveSpacesFailed: boolean
	onRetrySpaces: () => void
	bot?: Bot
	bots: Bot[]
	conversation?: Conversation
	conversationRuntimes: ConversationRuntimes
	home?: HomeSeat
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

type HomeViewProps = {
	body: WorkspaceBodyProps
	seat: HomeSeat
	bot: Bot
}

const HomeView = ({ body, seat, bot }: HomeViewProps) => {
	const { onOpenThreadInNewTab, spaceId } = body
	const visits = useSyncExternalStore(
		seat.visits.subscribe,
		seat.visits.getState,
	)
	const visit = visitOf(visits, bot.id, spaceId)
	const joinedHost = useContext(OpenJoinedHostContext)
	const access = spaceAccessOf(joinedHost)
	const send = useHomeSend({
		agentId: bot.id,
		spaceId,
		attachments: body.attachments,
		drafts: body.drafts,
		runtimes: body.conversationRuntimes,
		startConversation: seat.startConversation,
		discardConversation: seat.discardConversation,
		openConversation: seat.openConversation,
	})
	const rooms = {
		agent: bot,
		conversations: seat.conversations,
		store: seat.store,
		spaceId,
		onOpenRoom: (conversationId: string) =>
			onOpenThreadInNewTab({ conversation: conversationId }),
	}

	return (
		<ScreenLayout width="full">
			<HomeEmptyStage
				{...send}
				{...rooms}
				arrivalKey={seat.arrivalKey}
				bots={body.bots}
				isBandDismissed={visit?.isBandDismissed ?? false}
				isReadOnly={Boolean(joinedHost?.departure)}
				lines={
					<HomeLines
						{...rooms}
						key={bot.id}
						openedAt={visit?.openedAt ?? null}
						roomLinesOf={(workingIds) =>
							seat.visits.roomLinesOf(bot.id, spaceId, workingIds)
						}
					/>
				}
				notice={
					joinedHost && access ? (
						<SpaceAccessBanner
							host={joinedHost.hostName}
							reason={access.reason}
							space={joinedHost.spaceName}
							waitReason={access.waitReason}
						/>
					) : null
				}
				onDismissBand={() => seat.visits.dismissBand(bot.id, spaceId)}
				onSelectAgent={seat.onSelectAgent}
				readerName={body.readerName}
				runtimes={body.conversationRuntimes}
			/>
		</ScreenLayout>
	)
}

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

	if (props.home && props.bot) {
		return (
			<HomeView
				body={props}
				bot={props.bot}
				key={props.spaceId}
				seat={props.home}
			/>
		)
	}

	const thread = props.isMissionsPanelOpen ? null : threadOf(props)

	if (!thread) {
		return <ScreenLayout header={<BareAppHeader />} />
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
