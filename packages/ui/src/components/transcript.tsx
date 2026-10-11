"use client"

import { useReducedMotion } from "motion/react"
import {
	type ComponentPropsWithRef,
	type ReactNode,
	type Ref,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { MessageHighlightProvider } from "@workspace/ui/components/message-highlight-context"
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
	useMessageScroller,
	useMessageScrollerScrollable,
} from "@workspace/ui/components/message-scroller"
import { Button } from "@workspace/ui/components/ui/button"
import {
	scrollTraceViewportRef,
	traceScrollWrite,
} from "@workspace/ui/lib/scroll-trace"
import { cn } from "@workspace/ui/lib/utils"

const RUN_AFTER_RUN_JOINS =
	"[[data-slot=message-scroller-item]:has(>[data-slot=chat-turn-group]:only-child)+&:has(>[data-slot=chat-turn-group]:only-child)]:-mt-6"

export interface TranscriptItem {
	key: string
	messageIds?: string[]
	isAnchor?: boolean
	render: () => ReactNode
}

export interface TranscriptOlder {
	has: boolean
	isLoading?: boolean
	onLoad: () => void
	label?: string
	startOfHistoryLabel?: string
}

export interface TranscriptNewer {
	isLoading?: boolean
	onLoad: () => void
	onLoadLatest: () => void
	label?: string
}

export interface TranscriptHandle {
	scrollToEnd: (behavior?: ScrollBehavior) => void
	scrollToMessage: (
		messageId: string,
		behavior?: ScrollBehavior,
		align?: "start" | "center",
	) => boolean
}

export interface TranscriptProps extends ComponentPropsWithRef<"div"> {
	rows?: TranscriptItem[]
	transcriptKey?: string
	autoScroll?: boolean
	anchorOnSend?: boolean
	marksNewMessages?: boolean
	countsNewMessages?: boolean
	onFollowChange?: (following: boolean) => void
	label?: string
	busy?: boolean
	highlightedMessageId?: string
	older?: TranscriptOlder
	newer?: TranscriptNewer
	scrollerRef?: Ref<TranscriptHandle>
	contentClassName?: string
}

const NO_ROWS: TranscriptItem[] = []

const NO_SCROLL_FADE = "[animation-name:none] [mask-image:none]"

const NO_SCROLLBAR_GUTTER = "scrollbar-auto scrollbar-gutter-auto"

const indexOfKey = (rows: TranscriptItem[], key: string | null) =>
	key === null ? -1 : rows.findIndex((row) => row.key === key)

const keyAfter = (rows: TranscriptItem[], key: string | null) => {
	const index = indexOfKey(rows, key)
	return index < 0 ? undefined : rows[index + 1]?.key
}

const messagesAfter = (rows: TranscriptItem[], key: string | null) => {
	const index = indexOfKey(rows, key)
	if (index < 0) return 0

	let counted = 0
	for (let next = index + 1; next < rows.length; next += 1) {
		counted += rows[next].messageIds?.length ?? 1
	}
	return counted
}

const lastAnchorKey = (rows: TranscriptItem[]) => {
	for (let index = rows.length - 1; index >= 0; index -= 1) {
		if (rows[index].isAnchor) return rows[index].key
	}
}

const rowHolding = (rows: TranscriptItem[], messageId: string) =>
	rows.find(
		(row) => row.key === messageId || row.messageIds?.includes(messageId),
	)

type NewMarksInput = {
	rows: TranscriptItem[]
	isFollowing: boolean
	marksNewMessages?: boolean
	countsNewMessages?: boolean
	onFollowChange?: (following: boolean) => void
}

const useNewMarks = ({
	rows,
	isFollowing,
	marksNewMessages,
	countsNewMessages,
	onFollowChange,
}: NewMarksInput) => {
	const [releasedAfterKey, setReleasedAfterKey] = useState<string | null>(null)
	const [markedAfterKey, setMarkedAfterKey] = useState<string | null>(null)
	const lastRowKeyRef = useRef<string | undefined>(undefined)
	const wasFollowingRef = useRef(true)

	lastRowKeyRef.current = rows.at(-1)?.key

	useEffect(() => {
		if (wasFollowingRef.current === isFollowing) return

		wasFollowingRef.current = isFollowing
		onFollowChange?.(isFollowing)
		if (isFollowing) return

		const lastRowKey = lastRowKeyRef.current
		if (lastRowKey === undefined) return

		setReleasedAfterKey(lastRowKey)
		setMarkedAfterKey((current) => current ?? lastRowKey)
	}, [isFollowing, onFollowChange])

	return {
		markKey: marksNewMessages ? keyAfter(rows, markedAfterKey) : undefined,
		newCount: countsNewMessages ? messagesAfter(rows, releasedAfterKey) : 0,
	}
}

type AnchorReleaseInput = {
	busy?: boolean
	isFollowing: boolean
}

const useAnchorRelease = ({
	busy = false,
	isFollowing,
}: AnchorReleaseInput) => {
	const { scrollToEnd } = useMessageScroller()
	const wasBusyRef = useRef(busy)
	const isFollowingRef = useRef(isFollowing)

	isFollowingRef.current = isFollowing

	useLayoutEffect(() => {
		const hasSettled = wasBusyRef.current && !busy
		wasBusyRef.current = busy
		if (!hasSettled || !isFollowingRef.current) return

		traceScrollWrite("app-scroll-to-end", () =>
			scrollToEnd({ behavior: "auto" }),
		)
	}, [busy, scrollToEnd])
}

const useTranscriptHandle = (
	scrollerRef: Ref<TranscriptHandle> | undefined,
	rows: TranscriptItem[],
	defaultBehavior: ScrollBehavior,
) => {
	const { scrollToEnd, scrollToMessage } = useMessageScroller()
	const rowsRef = useRef(rows)

	rowsRef.current = rows

	useImperativeHandle(
		scrollerRef,
		() => ({
			scrollToEnd: (behavior = defaultBehavior) => {
				traceScrollWrite("app-scroll-to-end", () => scrollToEnd({ behavior }))
			},
			scrollToMessage: (
				messageId,
				behavior = defaultBehavior,
				align = "center",
			) => {
				const row = rowHolding(rowsRef.current, messageId)
				return row
					? traceScrollWrite("app-scroll-to-element", () =>
							scrollToMessage(row.key, { align, behavior }),
						)
					: false
			},
		}),
		[defaultBehavior, scrollToEnd, scrollToMessage],
	)
}

type TranscriptOlderControlProps = {
	older: TranscriptOlder
	isReducedMotion: boolean
}

const TranscriptOlderControl = ({
	older,
	isReducedMotion,
}: TranscriptOlderControlProps) => {
	const { t } = useTranslation("chat")

	return (
		<div
			data-slot="transcript-older"
			className="flex min-h-9 items-center justify-center px-3"
		>
			{older.has ? (
				<Button
					variant="ghost"
					size="sm"
					aria-busy={older.isLoading}
					aria-disabled={older.isLoading}
					className="aria-disabled:opacity-60"
					onClick={() => {
						if (!older.isLoading) older.onLoad()
					}}
				>
					{older.isLoading ? (
						<Icons.Loading
							data-icon="inline-start"
							className={cn(!isReducedMotion && "animate-spin")}
						/>
					) : null}
					{older.label ?? t("transcript.loadOlder")}
				</Button>
			) : (
				<p className="text-muted-foreground text-xs">
					{older.startOfHistoryLabel ?? t("transcript.startOfHistory")}
				</p>
			)}
		</div>
	)
}

type TranscriptNewerControlProps = {
	newer: TranscriptNewer
	isReducedMotion: boolean
}

const TranscriptNewerControl = ({
	newer,
	isReducedMotion,
}: TranscriptNewerControlProps) => {
	const { t } = useTranslation("chat")

	return (
		<div
			data-slot="transcript-newer"
			className="flex min-h-9 items-center justify-center px-3"
		>
			<Button
				variant="ghost"
				size="sm"
				aria-busy={newer.isLoading}
				aria-disabled={newer.isLoading}
				className="aria-disabled:opacity-60"
				onClick={() => {
					if (!newer.isLoading) newer.onLoad()
				}}
			>
				{newer.isLoading ? (
					<Icons.Loading
						data-icon="inline-start"
						className={cn(!isReducedMotion && "animate-spin")}
					/>
				) : null}
				{newer.label ?? t("transcript.loadNewer")}
			</Button>
		</div>
	)
}

const TranscriptNewMark = () => {
	const { t } = useTranslation("chat")

	return (
		<div data-slot="transcript-new-mark" className="flex items-center gap-3">
			<span aria-hidden="true" className="h-px flex-1 bg-transcript-new-mark" />
			<span className="font-medium text-bot-badge-attention text-xs">
				{t("transcript.newMessages")}
			</span>
			<span aria-hidden="true" className="h-px flex-1 bg-transcript-new-mark" />
		</div>
	)
}

type TranscriptBodyProps = Omit<TranscriptProps, "transcriptKey" | "autoScroll">

const TranscriptBody = ({
	rows = NO_ROWS,
	anchorOnSend,
	marksNewMessages,
	countsNewMessages,
	onFollowChange,
	label,
	busy,
	highlightedMessageId,
	older,
	newer,
	scrollerRef,
	contentClassName,
	className,
	children,
	...props
}: TranscriptBodyProps) => {
	const { t } = useTranslation("chat")
	const isReducedMotion = useReducedMotion() ?? false
	const behavior: ScrollBehavior = isReducedMotion ? "auto" : "smooth"
	const { end: hasContentBelow } = useMessageScrollerScrollable()

	useAnchorRelease({ busy, isFollowing: !hasContentBelow })

	const { markKey, newCount } = useNewMarks({
		countsNewMessages,
		isFollowing: !hasContentBelow,
		marksNewMessages,
		onFollowChange,
		rows,
	})

	useTranscriptHandle(scrollerRef, rows, behavior)

	const anchorKey = anchorOnSend ? lastAnchorKey(rows) : undefined

	return (
		<MessageScroller className={cn("min-h-0", className)} {...props}>
			<MessageScrollerViewport
				ref={scrollTraceViewportRef()}
				aria-label={label ?? t("transcript.label")}
				className={cn(
					NO_SCROLL_FADE,
					NO_SCROLLBAR_GUTTER,
					"scrollbar-overlay focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
				)}
			>
				{older ? (
					<TranscriptOlderControl
						isReducedMotion={isReducedMotion}
						older={older}
					/>
				) : null}

				<MessageScrollerContent
					aria-busy={busy}
					aria-relevant="additions text"
					className={cn("justify-end gap-6", contentClassName)}
				>
					<MessageHighlightProvider messageId={highlightedMessageId}>
						{rows.map((row) => (
							<MessageScrollerItem
								className={cn("flex flex-col gap-6", RUN_AFTER_RUN_JOINS)}
								key={row.key}
								messageId={row.key}
								scrollAnchor={row.key === anchorKey}
							>
								{row.key === markKey ? <TranscriptNewMark /> : null}
								{row.render()}
							</MessageScrollerItem>
						))}
						{children}
					</MessageHighlightProvider>
				</MessageScrollerContent>

				{newer ? (
					<TranscriptNewerControl
						isReducedMotion={isReducedMotion}
						newer={newer}
					/>
				) : null}
			</MessageScrollerViewport>

			<MessageScrollerButton
				behavior={behavior}
				className="rounded-full shadow-xl tabular-nums"
				onClick={
					newer
						? (event) => {
								event.preventDefault()
								newer.onLoadLatest()
							}
						: undefined
				}
				size="sm"
				variant="secondary"
			>
				<Icons.ArrowDown data-icon="inline-start" />
				{newCount > 0
					? t("transcript.newCounted", { count: newCount })
					: t("transcript.jumpToLatest")}
			</MessageScrollerButton>
		</MessageScroller>
	)
}

function Transcript({
	transcriptKey,
	autoScroll = true,
	...props
}: TranscriptProps) {
	return (
		<MessageScrollerProvider
			autoScroll={autoScroll}
			defaultScrollPosition="end"
			key={transcriptKey}
		>
			<TranscriptBody {...props} />
		</MessageScrollerProvider>
	)
}

export { Transcript }
