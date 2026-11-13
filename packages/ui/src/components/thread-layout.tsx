import {
	type ReactNode,
	type Ref,
	type RefObject,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"

import { LibraryOverlayContainer } from "@workspace/ui/components/library-panel"
import type { ListEnd } from "@workspace/ui/components/list-skeleton"
import { MarkProvider } from "@workspace/ui/components/mark-context"
import {
	PromptReply,
	type ReplyQuote,
} from "@workspace/ui/components/prompt-reply"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"
import { useIsSidebarResizing } from "@workspace/ui/components/sidebar-resize"
import {
	Transcript,
	type TranscriptHandle,
	type TranscriptItem,
	type TranscriptNewer,
} from "@workspace/ui/components/transcript"
import { cn, mergeRefs } from "@workspace/ui/lib/utils"

const THREAD_WIDTHS =
	"[--prompt-overhang:calc(var(--spacing)*7)] [--thread-width:calc(var(--spacing)*184+var(--shell-inset)*2)]"

const THREAD_COLUMN =
	"[--thread-gutter:calc(max(0px,(100cqw-var(--thread-width))/2)+var(--shell-inset)+var(--prompt-overhang))] gap-8 ps-(--thread-gutter) pe-[calc(var(--thread-gutter)-(100cqw-100%))] pb-6"

const THREAD_PROMPT_COLUMN = "mx-auto max-w-(--thread-width)"

const ASIDE_RESIZING =
	"has-data-[resizing=true]:select-none has-data-[resizing=true]:**:cursor-col-resize"

type TranscriptWidthHoldProps = {
	transcriptRef: RefObject<HTMLDivElement | null>
}

const HoldTranscriptWidthWhileSidebarResizes = ({
	transcriptRef,
}: TranscriptWidthHoldProps) => {
	const isSidebarResizing = useIsSidebarResizing()
	const widthRef = useRef<number | null>(null)

	useLayoutEffect(() => {
		const transcript = transcriptRef.current
		if (!transcript) return
		const observer = new ResizeObserver(([entry]) => {
			widthRef.current = entry.borderBoxSize[0].inlineSize
		})
		observer.observe(transcript)
		return () => observer.disconnect()
	}, [transcriptRef])

	useLayoutEffect(() => {
		const transcript = transcriptRef.current
		const width = widthRef.current
		if (!isSidebarResizing || !transcript || width === null) return
		transcript.style.inlineSize = `${width}px`
		transcript.style.marginInline = `calc((100% - ${width}px) / 2)`
		return () => {
			transcript.style.inlineSize = ""
			transcript.style.marginInline = ""
		}
	}, [isSidebarResizing, transcriptRef])

	return null
}

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
	older?: ListEnd
	newer?: TranscriptNewer
	rows?: TranscriptItem[]
	onFollowChange?: (following: boolean) => void
	children: ReactNode
	overlay?: ReactNode
	aside?: ReactNode
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
	older,
	newer,
	rows,
	onFollowChange,
	children,
	overlay,
	aside,
	rootRef,
	scrollerRef,
	className,
	contentClassName,
}: ThreadLayoutProps) {
	const [overlayElement, setOverlayElement] = useState<HTMLDivElement | null>(
		null,
	)
	const overlayContainer = useMemo(
		() => ({ current: overlayElement }),
		[overlayElement],
	)
	const transcriptRef = useRef<HTMLDivElement>(null)
	const attachRoot = useMemo(
		() => mergeRefs(rootRef, setOverlayElement),
		[rootRef],
	)

	return (
		<LibraryOverlayContainer.Provider value={overlayContainer}>
			<div
				className={
					aside
						? cn("flex h-svh max-h-full w-full", ASIDE_RESIZING)
						: "contents"
				}
				data-slot="thread-with-aside"
			>
				<ScreenLayout
					ref={attachRoot}
					data-slot="chat-layout"
					className={cn(
						"relative",
						THREAD_WIDTHS,
						aside && "min-w-0 flex-1",
						className,
					)}
					contentClassName={cn(THREAD_COLUMN, contentClassName)}
					header={header}
					scroller={(columnClassName) =>
						skeleton ? (
							<div
								className="@container min-h-0 flex-1"
								data-slot="thread-skeleton"
							>
								<div
									className={cn(columnClassName, "h-full py-0")}
									data-slot="thread-skeleton-column"
								>
									{skeleton}
								</div>
							</div>
						) : (
							<MarkProvider transcriptKey={transcriptKey}>
								<Transcript
									ref={transcriptRef}
									className="@container flex-1"
									transcriptKey={transcriptKey}
									autoScroll={autoScroll}
									busy={busy}
									label={label}
									anchorOnSend={anchorOnSend}
									marksNewMessages={marksNewMessages}
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
								<HoldTranscriptWidthWhileSidebarResizes
									key={transcriptKey}
									transcriptRef={transcriptRef}
								/>
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
				{aside}
			</div>
			{overlay}
		</LibraryOverlayContainer.Provider>
	)
}

export { ThreadLayout, type ThreadLayoutProps }
