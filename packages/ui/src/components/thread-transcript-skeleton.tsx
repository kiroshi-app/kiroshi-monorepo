import {
	ListSkeleton,
	type ListSkeletonRowAt,
	SkeletonBar,
	SkeletonHexagon,
} from "@workspace/ui/components/list-skeleton"
import { cn } from "@workspace/ui/lib/utils"

const BUBBLE = "max-w-full shrink-0 rounded-bubble bg-border/60"

type AgentSkeletonProps = {
	nameClassName: string
	bubbleClassName: string
}

const AgentSkeleton = ({
	nameClassName,
	bubbleClassName,
}: AgentSkeletonProps) => (
	<div className="flex items-end gap-2">
		<SkeletonHexagon className="size-10" />
		<div className="flex min-w-0 flex-1 flex-col gap-1">
			<div className="flex h-5 items-center px-3.5">
				<SkeletonBar className={nameClassName} />
			</div>
			<div
				className={cn(BUBBLE, "rounded-es-md", bubbleClassName)}
				data-slot="skeleton-agent-bubble"
			/>
		</div>
	</div>
)

type UserSkeletonProps = {
	bubbleClassName: string
}

const UserSkeleton = ({ bubbleClassName }: UserSkeletonProps) => (
	<div className="flex justify-end">
		<div
			className={cn(BUBBLE, "h-11", bubbleClassName)}
			data-slot="skeleton-user-bubble"
		/>
	</div>
)

type TranscriptSkeletonProps = {
	row: ListSkeletonRowAt
}

const TranscriptSkeleton = ({ row }: TranscriptSkeletonProps) => (
	<ListSkeleton anchor="bottom" className="gap-4 px-6 pt-8 pb-4" row={row} />
)

const THREAD_CYCLE_FROM_THE_COMPOSER = [
	<AgentSkeleton
		bubbleClassName="h-11 w-100"
		key="agent-short"
		nameClassName="w-11"
	/>,
	<UserSkeleton bubbleClassName="w-59" key="user-short" />,
	<AgentSkeleton
		bubbleClassName="h-29 w-140"
		key="agent-long"
		nameClassName="w-11"
	/>,
	<UserSkeleton bubbleClassName="w-105" key="user-long" />,
]

const threadItemAt = (index: number) =>
	THREAD_CYCLE_FROM_THE_COMPOSER[index % THREAD_CYCLE_FROM_THE_COMPOSER.length]

const ThreadTranscriptSkeleton = () => <TranscriptSkeleton row={threadItemAt} />

export { AgentSkeleton, ThreadTranscriptSkeleton, TranscriptSkeleton }
