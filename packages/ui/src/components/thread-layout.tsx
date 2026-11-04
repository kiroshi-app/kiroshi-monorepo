import { type ReactNode, type Ref, useRef } from "react"

import { LibraryOverlayContainer } from "@workspace/ui/components/library-panel"
import type { ListEnd } from "@workspace/ui/components/list-skeleton"
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
} from "@workspace/ui/components/transcript"
import { cn, mergeRefs } from "@workspace/ui/lib/utils"

const THREAD_COLUMN = "mx-auto max-w-182"

const THREAD_PROMPT_COLUMN = "mx-auto max-w-184"

interface ThreadLayoutProps {
	header?: ReactNode
	notice?: ReactNode
	pending?: ReactNode
	queue?: ReactNode
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
	older?: ListEnd
	newer?: TranscriptNewer
	rows?: TranscriptItem[]
	onFollowChange?: (following: boolean) => void
	children: ReactNode
	overlay?: ReactNode
	rootRef?: Ref<HTMLDivElement>
	scrollerRef?: Ref<TranscriptHandle>
	className?: string
	contentClassName?: string
}

function ThreadLayout({
	header,
	notice,
	pending,
	queue,
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
	overlay,
	rootRef,
	scrollerRef,
	className,
	contentClassName,
}: ThreadLayoutProps) {
	const overlayContainer = useRef<HTMLDivElement>(null)

	return (
		<LibraryOverlayContainer.Provider value={overlayContainer}>
			<ScreenLayout
				ref={mergeRefs(rootRef, overlayContainer)}
				data-slot="chat-layout"
				className={cn("relative", className)}
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
								<div className="flex flex-col">
									{queue ? (
										<div className="-mb-1.5 empty:hidden *:pb-3">{queue}</div>
									) : null}
									<PromptReply quote={reply} className="relative">
										{composer}
									</PromptReply>
								</div>
							) : null}
						</>
					) : null
				}
				footerClassName={composer ? THREAD_PROMPT_COLUMN : "px-12 pb-6"}
			/>
			{overlay}
		</LibraryOverlayContainer.Provider>
	)
}

export { ThreadLayout, type ThreadLayoutProps }
