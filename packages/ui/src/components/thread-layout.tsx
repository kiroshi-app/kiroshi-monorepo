import type { ReactNode, Ref } from "react"

import { MarkProvider } from "@workspace/ui/components/mark-context"
import {
	PromptReply,
	type ReplyQuote,
} from "@workspace/ui/components/prompt-reply"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"
import {
	Transcript,
	type TranscriptHandle,
	type TranscriptItem,
	type TranscriptNewer,
	type TranscriptOlder,
} from "@workspace/ui/components/transcript"
import { cn } from "@workspace/ui/lib/utils"

const THREAD_COLUMN = "mx-auto max-w-182"

const THREAD_PROMPT_COLUMN = "mx-auto max-w-184"

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
		<ScreenLayout
			ref={rootRef}
			data-slot="chat-layout"
			className={className}
			contentClassName={cn(THREAD_COLUMN, contentClassName)}
			header={header}
			scroller={(columnClassName) =>
				skeleton ? (
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
							contentClassName={columnClassName}
						>
							{children}
						</Transcript>
					</MarkProvider>
				)
			}
			footer={
				notice || pending || composer ? (
					<>
						{notice}
						{pending}
						{composer ? (
							<PromptReply quote={reply}>{composer}</PromptReply>
						) : null}
					</>
				) : null
			}
			footerClassName={composer ? THREAD_PROMPT_COLUMN : "px-12 pb-6"}
		/>
	)
}

export { ThreadLayout, type ThreadLayoutProps }
