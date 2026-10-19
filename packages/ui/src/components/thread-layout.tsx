import type { ReactNode, Ref } from "react"

import { MarkProvider } from "@workspace/ui/components/mark-context"
import {
	PromptReply,
	type ReplyQuote,
} from "@workspace/ui/components/prompt-reply"
import {
	Transcript,
	type TranscriptHandle,
	type TranscriptItem,
	type TranscriptNewer,
	type TranscriptOlder,
} from "@workspace/ui/components/transcript"
import { cn } from "@workspace/ui/lib/utils"

interface ThreadLayoutProps {
	header?: ReactNode
	notice?: ReactNode
	pending?: ReactNode
	composer?: ReactNode
	skeleton?: ReactNode
	reply?: ReplyQuote
	highlightedMessageId?: string
	transcriptKey?: string
	autoScroll?: boolean
	busy?: boolean
	label?: string
	anchorOnSend?: boolean
	marksNewMessages?: boolean
	countsNewMessages?: boolean
	older?: TranscriptOlder
	newer?: TranscriptNewer
	rows?: TranscriptItem[]
	onFollowChange?: (following: boolean) => void
	children: ReactNode
	rootRef?: Ref<HTMLDivElement>
	scrollerRef?: Ref<TranscriptHandle>
	className?: string
	contentClassName?: string
}

function ThreadLayout({
	header,
	notice,
	pending,
	composer,
	skeleton,
	reply,
	highlightedMessageId,
	transcriptKey,
	autoScroll,
	busy,
	label,
	anchorOnSend,
	marksNewMessages,
	countsNewMessages,
	older,
	newer,
	rows,
	onFollowChange,
	children,
	rootRef,
	scrollerRef,
	className,
	contentClassName,
}: ThreadLayoutProps) {
	return (
		<div
			ref={rootRef}
			data-slot="chat-layout"
			className={cn(
				"flex h-svh max-h-full flex-col bg-background text-foreground in-data-content-card:bg-card",
				className,
			)}
		>
			{header}

			{skeleton ? (
				<div className="min-h-0 flex-1" data-slot="thread-skeleton">
					{skeleton}
				</div>
			) : (
				<MarkProvider transcriptKey={transcriptKey}>
					<Transcript
						className="flex-1"
						transcriptKey={transcriptKey}
						autoScroll={autoScroll}
						busy={busy}
						label={label}
						anchorOnSend={anchorOnSend}
						marksNewMessages={marksNewMessages}
						countsNewMessages={countsNewMessages}
						older={older}
						newer={newer}
						rows={rows}
						onFollowChange={onFollowChange}
						highlightedMessageId={highlightedMessageId}
						scrollerRef={scrollerRef}
						contentClassName={cn(
							"flex min-h-full w-full flex-col px-6 pt-8 pb-4",
							contentClassName,
						)}
					>
						{children}
					</Transcript>
				</MarkProvider>
			)}

			{notice || pending || composer ? (
				<div
					className={cn(
						"flex w-full shrink-0 flex-col gap-3",
						composer ? "px-(--shell-inset) pb-(--shell-inset)" : "px-12 pb-6",
					)}
				>
					{notice}
					{pending}
					{composer ? (
						<PromptReply quote={reply}>{composer}</PromptReply>
					) : null}
				</div>
			) : null}
		</div>
	)
}

export { ThreadLayout, type ThreadLayoutProps }
