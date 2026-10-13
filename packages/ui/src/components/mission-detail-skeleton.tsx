import { SkeletonBar } from "@workspace/ui/components/list-skeleton"
import {
	AgentSkeleton,
	TranscriptSkeleton,
} from "@workspace/ui/components/thread-transcript-skeleton"

type EventSkeletonProps = {
	lineClassName: string
}

const EventSkeleton = ({ lineClassName }: EventSkeletonProps) => (
	<div className="ps-12">
		<div className="flex h-5 items-center justify-between px-1">
			<div className="flex min-w-0 items-center gap-2">
				<SkeletonBar className="size-1.25 shrink-0" isFaint />
				<SkeletonBar className={lineClassName} isFaint />
			</div>
			<SkeletonBar className="w-7 shrink-0" isFaint />
		</div>
	</div>
)

const LongAgent = () => (
	<AgentSkeleton bubbleClassName="h-20 w-135" nameClassName="w-9" />
)

const ShortAgent = () => (
	<AgentSkeleton bubbleClassName="h-11 w-155" nameClassName="w-9" />
)

const MISSION_CYCLE_FROM_THE_COMPOSER = [
	<LongAgent key="agent-long-first" />,
	<EventSkeleton key="event-1" lineClassName="w-41" />,
	<EventSkeleton key="event-2" lineClassName="w-59" />,
	<ShortAgent key="agent-short-first" />,
	<EventSkeleton key="event-3" lineClassName="w-44" />,
	<LongAgent key="agent-long-second" />,
	<EventSkeleton key="event-4" lineClassName="w-41" />,
	<EventSkeleton key="event-5" lineClassName="w-59" />,
	<ShortAgent key="agent-short-second" />,
	<EventSkeleton key="event-6" lineClassName="w-44" />,
]

const missionItemAt = (index: number) =>
	MISSION_CYCLE_FROM_THE_COMPOSER[
		index % MISSION_CYCLE_FROM_THE_COMPOSER.length
	]

const MissionDetailSkeleton = () => <TranscriptSkeleton row={missionItemAt} />

export { MissionDetailSkeleton }
