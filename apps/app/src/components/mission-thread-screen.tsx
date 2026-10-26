import { useMemo } from "react"

import type { MissionEventModel } from "@workspace/ui/components/mission"
import { MissionDetailSkeleton } from "@workspace/ui/components/mission-detail-skeleton"
import { MissionHeaderSkeleton } from "@workspace/ui/components/mission-header-skeleton"
import { Notice } from "@workspace/ui/components/notice"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import type { ActivityPanel } from "@/components/thread-routines"
import { ThreadScreen } from "@/components/thread-screen"
import { titleBarDragRegion } from "@/components/window-caption-controls"
import { useRosterClock } from "@/lib/bots/use-roster-clock"
import type { AttachmentsController } from "@/lib/chat/attachments-controller"
import type { DraftsController } from "@/lib/chat/drafts-controller"
import type { Thread } from "@/lib/chat/thread-contract"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import type { Bot } from "@/lib/conversations/store-contract"
import type { OpenMission } from "@/lib/missions/mission-actions"
import type { Mission } from "@/lib/missions/mission-contract"
import { toMissionConversation } from "@/lib/missions/mission-thread-model"
import type { OpenedMission } from "@/lib/missions/opened-mission-controller"
import { useMissionDetail } from "@/lib/missions/use-mission-detail"
import { useMissionReadFailure } from "@/lib/missions/use-mission-failure-notices"
import { useSkeletonSlot } from "@/lib/query/use-skeleton-slot"
import type { MessageLandingController } from "@/lib/search/message-landing-controller"

const MISSION_DETAIL_SKELETON = <MissionDetailSkeleton />

type MissionReadFailureProps = {
	onRetry: () => void
}

const MissionReadFailure = ({ onRetry }: MissionReadFailureProps) => {
	const t = useChatCopy()

	return (
		<Notice
			description={t("missions.failure.read.description")}
			retry={{ onRetry }}
			title={t("missions.failure.read.title")}
		/>
	)
}

type MissionThreadProps = {
	activityPanel: ActivityPanel
	mission: Mission
	opening: OpenedMission
	bot: Bot
	bots: Bot[]
	events: MissionEventModel[]
	hasFailedToRead: boolean
	runtimes: ConversationRuntimes
	attachments: AttachmentsController
	drafts: DraftsController
	landings: MessageLandingController
	readerName: string
	onLeave: () => void
	onOpenMission: OpenMission
}

const MissionThread = ({
	activityPanel,
	mission,
	opening,
	bot,
	bots,
	events,
	hasFailedToRead,
	runtimes,
	attachments,
	drafts,
	landings,
	readerName,
	onLeave,
	onOpenMission,
}: MissionThreadProps) => {
	const now = useRosterClock()

	useMissionReadFailure(hasFailedToRead)

	const thread = useMemo<Thread>(
		() => ({
			kind: "conversation",
			conversation: toMissionConversation({ mission, bot }),
			runtimes,
			isSettingsOpen: false,
			onOpenSettings: () => undefined,
			mission: { mission, events, now, opening, onLeave },
		}),
		[mission, bot, events, now, opening, runtimes, onLeave],
	)

	return (
		<ThreadScreen
			activityPanel={activityPanel}
			attachments={attachments}
			bots={bots}
			drafts={drafts}
			landings={landings}
			onOpenMission={onOpenMission}
			readerName={readerName}
			runtimes={runtimes}
			spaceId={null}
			thread={thread}
		/>
	)
}

type MissionThreadScreenProps = {
	activityPanel: ActivityPanel
	opening: OpenedMission
	bots: Bot[]
	runtimes: ConversationRuntimes
	attachments: AttachmentsController
	drafts: DraftsController
	landings: MessageLandingController
	readerName: string
	onLeave: () => void
	onOpenMission: OpenMission
}

export function MissionThreadScreen({
	activityPanel,
	opening,
	bots,
	runtimes,
	attachments,
	drafts,
	landings,
	readerName,
	onLeave,
	onOpenMission,
}: MissionThreadScreenProps) {
	const { read, isPending, hasFailedToRead, onRetry } = useMissionDetail(
		opening.missionId,
	)
	const detailSkeleton = useSkeletonSlot(isPending, MISSION_DETAIL_SKELETON)

	const bot = read
		? bots.find(({ id }) => id === read.mission.botId)
		: undefined

	if (!read || !bot) {
		if (hasFailedToRead) return <MissionReadFailure onRetry={onRetry} />
		return detailSkeleton ? (
			<ThreadLayout
				header={
					<MissionHeaderSkeleton
						dragRegion={titleBarDragRegion()}
						onBack={onLeave}
					/>
				}
				skeleton={detailSkeleton}
			>
				{null}
			</ThreadLayout>
		) : null
	}

	return (
		<MissionThread
			activityPanel={activityPanel}
			attachments={attachments}
			bot={bot}
			bots={bots}
			drafts={drafts}
			events={read.events}
			hasFailedToRead={hasFailedToRead}
			landings={landings}
			mission={read.mission}
			onLeave={onLeave}
			onOpenMission={onOpenMission}
			opening={opening}
			readerName={readerName}
			runtimes={runtimes}
		/>
	)
}
