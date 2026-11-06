import type { ReactNode } from "react"

import {
	ListSkeleton,
	type ListSkeletonRowAt,
	SkeletonBar,
	SkeletonHexagon,
} from "@workspace/ui/components/list-skeleton"
import { MESSAGE_BUBBLE_MAX_INLINE_SIZE } from "@workspace/ui/components/message-bubble"
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

type TranscriptSkeletonProps = {
	row: ListSkeletonRowAt
}

const TranscriptSkeleton = ({ row }: TranscriptSkeletonProps) => (
	<ListSkeleton anchor="bottom" className="gap-4 px-6 pt-8 pb-4" row={row} />
)

type TurnAuthor = "agent" | "user" | "person"

type TurnLineCount = 1 | 2 | 3

const TEXT_HEIGHT = {
	1: "h-6",
	2: "h-12",
	3: "h-18",
} as const satisfies Record<TurnLineCount, string>

const TIME_BAR = <SkeletonBar className="w-6.5" isFaint />

const AGENT_AUTHOR_LINE = (
	<div className="flex h-5 items-center gap-2" data-slot="skeleton-author-line">
		<SkeletonHexagon className="size-5" />
		<SkeletonBar className="w-8" />
		<SkeletonBar className="h-5 w-13.5 shrink-0 rounded-sm" isFaint />
		{TIME_BAR}
	</div>
)

type EndAuthorLineProps = {
	nameClassName: string
}

const EndAuthorLine = ({ nameClassName }: EndAuthorLineProps) => (
	<div
		className="flex h-5 items-center justify-end gap-2"
		data-slot="skeleton-author-line"
	>
		<SkeletonBar className="size-5 shrink-0" />
		<SkeletonBar className={nameClassName} />
		{TIME_BAR}
	</div>
)

const AUTHOR_LINE = {
	agent: AGENT_AUTHOR_LINE,
	user: <EndAuthorLine nameClassName="w-5.5" />,
	person: <EndAuthorLine nameClassName="w-7" />,
} as const satisfies Record<TurnAuthor, ReactNode>

type TurnSkeletonProps = {
	author: TurnAuthor
	lineCount: TurnLineCount
	bubbleClassName: string
	hasAuthorLine?: boolean
}

const TurnSkeleton = ({
	author,
	lineCount,
	bubbleClassName,
	hasAuthorLine = true,
}: TurnSkeletonProps) => (
	<div className={cn("flex", author !== "agent" && "justify-end")}>
		<div
			className={cn(
				"flex min-w-0 flex-col gap-2 rounded-bubble bg-border/60 p-4.5",
				MESSAGE_BUBBLE_MAX_INLINE_SIZE,
				bubbleClassName,
			)}
			data-slot={`skeleton-${author}-bubble`}
		>
			<div className={TEXT_HEIGHT[lineCount]} />
			{hasAuthorLine ? AUTHOR_LINE[author] : null}
		</div>
	</div>
)

const THREAD_CYCLE_FROM_THE_COMPOSER = [
	<TurnSkeleton
		author="agent"
		bubbleClassName="w-100"
		key="agent-closing"
		lineCount={1}
	/>,
	<TurnSkeleton
		author="agent"
		bubbleClassName="w-140"
		hasAuthorLine={false}
		key="agent-middle"
		lineCount={2}
	/>,
	<TurnSkeleton
		author="agent"
		bubbleClassName="w-120"
		key="agent-opening"
		lineCount={1}
	/>,
	<TurnSkeleton
		author="user"
		bubbleClassName="w-59"
		key="user-short"
		lineCount={1}
	/>,
	<TurnSkeleton
		author="person"
		bubbleClassName="w-105"
		key="person"
		lineCount={2}
	/>,
	<TurnSkeleton
		author="user"
		bubbleClassName="w-90"
		key="user-long"
		lineCount={2}
	/>,
]

const threadItemAt = (index: number) =>
	THREAD_CYCLE_FROM_THE_COMPOSER[index % THREAD_CYCLE_FROM_THE_COMPOSER.length]

const ThreadTranscriptSkeleton = () => (
	<ListSkeleton
		anchor="bottom"
		className="gap-3 px-6 pt-8 pb-4"
		row={threadItemAt}
	/>
)

export { AgentSkeleton, ThreadTranscriptSkeleton, TranscriptSkeleton }
