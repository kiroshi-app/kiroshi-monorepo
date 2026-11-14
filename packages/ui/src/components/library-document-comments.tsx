"use client"

import {
	type ReactNode,
	type Ref,
	useEffect,
	useEffectEvent,
	useLayoutEffect,
	useRef,
} from "react"
import { useTranslation } from "react-i18next"

import type {
	LibraryCommentAgent,
	LibraryCommentAnchor,
	LibraryCommentAuthor,
} from "@workspace/ui/components/library-comment-author"
import { LibraryCommentComposer } from "@workspace/ui/components/library-comment-composer"
import type { LibraryCommentDraftOptions } from "@workspace/ui/components/library-comment-field"
import {
	LibraryCommentPin,
	type LibraryCommentPinState,
} from "@workspace/ui/components/library-comment-pin"
import {
	type LibraryComment,
	type LibraryCommentResolution,
	LibraryCommentThread,
	type LibraryCommentThreadProps,
} from "@workspace/ui/components/library-comment-thread"
import {
	foundAnchorIn,
	type LibraryBlock,
	type LibraryBlockAnchor,
	passageQuoteOf,
} from "@workspace/ui/components/library-document-blocks"
import type { MarkdownRun } from "@workspace/ui/components/markdown/runs"
import { useRosterBots } from "@workspace/ui/components/roster"
import { isMacPlatform } from "@workspace/ui/lib/platform"
import { cn } from "@workspace/ui/lib/utils"

type LibraryDocumentThread = {
	id: string
	anchor: LibraryBlockAnchor
	comments: [LibraryComment, ...LibraryComment[]]
	workingAgent?: LibraryCommentAgent
	resolution?: LibraryCommentResolution
}

type LibraryDocumentOpenThread = Pick<
	LibraryCommentThreadProps,
	| "reply"
	| "onReplyChange"
	| "onReply"
	| "onResolve"
	| "onReopen"
	| "onMore"
	| "onClose"
> & { id: string }

type LibraryDocumentCommentOrigin = "pointer" | "shortcut"

type LibraryDocumentCommentTarget = LibraryBlockAnchor & {
	origin: LibraryDocumentCommentOrigin
}

type LibraryDocumentCommentDraft = Pick<
	LibraryCommentDraftOptions,
	"value" | "onValueChange" | "onSubmit"
> & {
	target: LibraryDocumentCommentTarget
	author: LibraryCommentAuthor
	onClose: () => void
}

type LibraryDocumentCommentProps = {
	threads?: LibraryDocumentThread[]
	openThread?: LibraryDocumentOpenThread
	commentDraft?: LibraryDocumentCommentDraft
	commentParticipants?: LibraryCommentAuthor[]
	onOpenThread?: (id: string) => void
	onStartComment?: (target: LibraryDocumentCommentTarget) => void
}

type PlacedThread = {
	thread: LibraryDocumentThread
	anchor: LibraryBlockAnchor
}

type PlacedDraft = {
	draft: LibraryDocumentCommentDraft
	anchor: LibraryBlockAnchor
}

type LibraryDocumentCommentLayer = {
	threads: PlacedThread[]
	draft?: PlacedDraft
	openThread?: LibraryDocumentOpenThread
	participants: LibraryCommentAuthor[]
	onOpenThread?: (id: string) => void
}

const NO_THREADS: LibraryDocumentThread[] = []

const NO_PARTICIPANTS: LibraryCommentAuthor[] = []

const COMMENT_CARD_SLOT = "library-document-comment-card"

const COMMENT_RUN = "comment:"

const DRAFT_RUN = "comment-draft"

const PIN_GAP = 8

const RESOLVED_PIN_OVERLAP = 1

const isCommentRun = (id: string) =>
	id === DRAFT_RUN || id.startsWith(COMMENT_RUN)

const runIdOf = ({ id }: LibraryDocumentThread) => `${COMMENT_RUN}${id}`

const commentLayerOf = (
	blocks: LibraryBlock[],
	{
		threads = NO_THREADS,
		openThread,
		commentDraft,
		commentParticipants = NO_PARTICIPANTS,
		onOpenThread,
	}: LibraryDocumentCommentProps,
): LibraryDocumentCommentLayer => {
	const draftAnchor = commentDraft && foundAnchorIn(blocks, commentDraft.target)
	return {
		threads: threads.flatMap((thread) => {
			const anchor = foundAnchorIn(blocks, thread.anchor)
			return anchor ? [{ thread, anchor }] : []
		}),
		draft:
			commentDraft && draftAnchor
				? { draft: commentDraft, anchor: draftAnchor }
				: undefined,
		openThread,
		participants: commentParticipants,
		onOpenThread,
	}
}

const commentRunsIn = (
	{ threads, draft }: LibraryDocumentCommentLayer,
	blockId: string,
): MarkdownRun[] => [
	...threads.flatMap(({ thread, anchor }) =>
		anchor.blockId === blockId && anchor.passage
			? [
					{
						id: runIdOf(thread),
						start: anchor.passage.start,
						end: anchor.passage.end,
					},
				]
			: [],
	),
	...(draft?.anchor.blockId === blockId && draft.anchor.passage
		? [
				{
					id: DRAFT_RUN,
					start: draft.anchor.passage.start,
					end: draft.anchor.passage.end,
				},
			]
		: []),
]

const hasBlockDraft = (
	{ draft }: LibraryDocumentCommentLayer,
	blockId: string,
) => draft?.anchor.blockId === blockId && !draft.anchor.passage

const useMentionNameOf = () => {
	const { t } = useTranslation("chat")
	const bots = useRosterBots()

	return (id: string) =>
		bots.find((bot) => bot.id === id)?.name ?? t("transcript.mention.unknown")
}

type ThreadPinProps = {
	layer: LibraryDocumentCommentLayer
	thread: LibraryDocumentThread
	className?: string
}

const pinStateOf = (
	{ openThread }: LibraryDocumentCommentLayer,
	{ id, resolution }: LibraryDocumentThread,
) => {
	if (resolution) return "resolved"
	return openThread?.id === id ? "selected" : "rest"
}

const ThreadPin = ({ layer, thread, className }: ThreadPinProps) => {
	const [{ author }] = thread.comments
	const state = pinStateOf(layer, thread)

	return (
		<LibraryCommentPin
			aria-expanded={layer.openThread?.id === thread.id}
			author={author}
			className={cn(
				state === "rest" &&
					author.kind === "agent" &&
					"shadow-comment-pin-agent",
				state === "resolved" && "shadow-comment-pin-resolved",
				className,
			)}
			data-comment-pin={runIdOf(thread)}
			onClick={() => layer.onOpenThread?.(thread.id)}
			state={state}
		/>
	)
}

type LibraryDocumentThreadCardProps = {
	thread: LibraryDocumentThread
	open: LibraryDocumentOpenThread
	anchor: LibraryCommentAnchor
	participants: LibraryCommentAuthor[]
	className?: string
}

const LibraryDocumentThreadCard = ({
	thread,
	open,
	anchor,
	participants,
	className,
}: LibraryDocumentThreadCardProps) => (
	<LibraryCommentThread
		{...open}
		anchor={anchor}
		className={className}
		comments={thread.comments}
		participants={participants}
		resolution={thread.resolution}
		workingAgent={thread.workingAgent}
	/>
)

type DraftCardProps = {
	draft: LibraryDocumentCommentDraft
	anchor: string
	participants: LibraryCommentAuthor[]
}

const DraftCard = ({ draft, anchor, participants }: DraftCardProps) => {
	const { t } = useTranslation("common")

	return (
		<LibraryCommentComposer
			anchor={anchor}
			className="w-80"
			onSubmit={draft.onSubmit}
			onValueChange={draft.onValueChange}
			participants={participants}
			shortcut={
				draft.target.origin === "shortcut"
					? t(
							`library.comments.composer.shortcut.${isMacPlatform() ? "mac" : "other"}`,
						)
					: undefined
			}
			value={draft.value}
		/>
	)
}

type CardFrameProps = {
	children: ReactNode
	className?: string
	ref?: Ref<HTMLDivElement>
}

const CardFrame = ({ children, className, ref }: CardFrameProps) => (
	// biome-ignore lint/a11y/noStaticElementInteractions: keys typed in a comment card stay out of the shortcuts of the block under it, Escape alone travels on to the editor
	<div
		className={cn("absolute z-10 w-max cursor-auto", className)}
		data-slot={COMMENT_CARD_SLOT}
		onKeyDown={(event) => {
			if (event.key !== "Escape") event.stopPropagation()
		}}
		ref={ref}
	>
		{children}
	</div>
)

type Place = {
	left: number
	top: number
}

type PlaceIn = (block: HTMLElement, placed: HTMLElement) => Place | undefined

const clippingBoxOf = (element: Element): Element => {
	const parent = element.parentElement
	if (!parent) return element
	return getComputedStyle(parent).overflowX === "visible"
		? clippingBoxOf(parent)
		: parent
}

const innerRightOf = (box: Element) =>
	box.getBoundingClientRect().left + box.clientLeft + box.clientWidth

const usePlaceInBlock = (placeIn: PlaceIn) => {
	const frame = useRef<HTMLDivElement>(null)

	const place = useEffectEvent(() => {
		const placed = frame.current
		const block = placed?.parentElement
		const next = placed && block ? placeIn(block, placed) : undefined
		if (!placed || !next) return
		placed.style.left = `${next.left}px`
		placed.style.top = `${next.top}px`
		placed.dataset.placed = ""
	})

	useLayoutEffect(() => place())

	useEffect(() => {
		const block = frame.current?.parentElement
		if (!block) return
		const observer = new ResizeObserver(() => place())
		observer.observe(block)
		observer.observe(clippingBoxOf(block))
		return () => observer.disconnect()
	}, [])

	return frame
}

const besidePin =
	(pin: string): PlaceIn =>
	(block, card) => {
		const anchor = block.querySelector(`[data-comment-pin="${pin}"]`)
		if (!anchor) return undefined
		const from = block.getBoundingClientRect()
		const box = anchor.getBoundingClientRect()
		const { width } = card.getBoundingClientRect()
		const edge = innerRightOf(clippingBoxOf(block))
		return box.right + PIN_GAP + width <= edge
			? { left: box.right - from.left + PIN_GAP, top: box.top - from.top }
			: {
					left: Math.min(box.right, edge) - width - from.left,
					top: box.bottom - from.top + PIN_GAP,
				}
	}

const onPassageEnd =
	(run: string, isAboveLine: boolean): PlaceIn =>
	(block) => {
		const end = [...block.querySelectorAll(`[data-passage-end="${run}"]`)].at(
			-1,
		)
		const line = [...(end?.getClientRects() ?? [])].at(-1)
		if (!line) return undefined
		const from = block.getBoundingClientRect()
		return {
			left: line.right - from.left,
			top:
				(isAboveLine
					? line.top + RESOLVED_PIN_OVERLAP
					: (line.top + line.bottom) / 2) - from.top,
		}
	}

type PlacedOnPinProps = {
	pin: string
	children: ReactNode
}

type PinOnPassageEndProps = PlacedOnPinProps & {
	isAboveLine: boolean
}

const CardBesidePin = ({ pin, children }: PlacedOnPinProps) => (
	<CardFrame
		className="opacity-0 data-placed:opacity-100"
		ref={usePlaceInBlock(besidePin(pin))}
	>
		{children}
	</CardFrame>
)

const PinOnPassageEnd = ({
	pin,
	isAboveLine,
	children,
}: PinOnPassageEndProps) => (
	// biome-ignore lint/a11y/noStaticElementInteractions: a press on a pin beside the field being written leaves the caret and the focus in that field
	<div
		className={cn(
			"invisible absolute z-10 flex data-placed:visible",
			isAboveLine ? "-translate-y-full" : "-translate-y-1/2",
		)}
		onMouseDown={(event) => event.preventDefault()}
		ref={usePlaceInBlock(onPassageEnd(pin, isAboveLine))}
	>
		{children}
	</div>
)

const LibraryDocumentBlockTint = () => (
	<span
		aria-hidden="true"
		className="pointer-events-none absolute -inset-2 rounded-sm bg-primary/5 inset-ring inset-ring-primary/35"
		data-slot="library-document-comment-tint"
	/>
)

type LibraryDocumentModeCursorProps = {
	isShown: boolean
	ref: Ref<HTMLSpanElement>
}

const LibraryDocumentModeCursor = ({
	isShown,
	ref,
}: LibraryDocumentModeCursorProps) => (
	<span
		aria-hidden="true"
		className={cn(
			"pointer-events-none absolute z-20 size-5 -translate-y-full rounded-full rounded-bl-[0.125rem] bg-primary shadow-comment-cursor ring-2 ring-white",
			!isShown && "hidden",
		)}
		data-slot="library-document-comment-cursor"
		ref={ref}
	/>
)

type PassageState = LibraryCommentPinState

const ON_PASSAGE_LINE = "absolute start-0 top-1/2 -translate-y-1/2"

const PASSAGE_PIN: Record<PassageState, string> = {
	rest: ON_PASSAGE_LINE,
	selected: ON_PASSAGE_LINE,
	resolved: "absolute start-0 bottom-full translate-y-px",
}

const PASSAGE_LOOK: Record<PassageState, string> = {
	rest: "border-primary/50 bg-primary/8",
	selected: "border-primary bg-primary/16 dark:bg-primary/20",
	resolved: "border-sketch-mark border-dashed bg-foreground/5",
}

type PassageProps = {
	state: PassageState
	pin: ReactNode
	endOf?: string
	children: ReactNode
}

const Passage = ({ state, pin, endOf, children }: PassageProps) => (
	<>
		<span
			className={cn("box-decoration-clone border-b-2", PASSAGE_LOOK[state])}
			data-passage-end={endOf}
			data-slot="library-document-passage"
			data-state={state}
		>
			{children}
		</span>
		{pin ? (
			// biome-ignore lint/a11y/noStaticElementInteractions: a press on the pin never follows the link its passage ends in
			<span
				className="relative select-none"
				onClick={(event) => event.preventDefault()}
			>
				{pin}
			</span>
		) : null}
	</>
)

type DraftPinProps = {
	draft: LibraryDocumentCommentDraft
	className?: string
}

const DraftPin = ({ draft, className }: DraftPinProps) => (
	<LibraryCommentPin
		author={draft.author}
		className={className}
		data-comment-pin={DRAFT_RUN}
		state="selected"
	/>
)

type LibraryDocumentCommentRunProps = {
	layer: LibraryDocumentCommentLayer
	id: string
	isEnd: boolean
	isInField?: boolean
	children: ReactNode
}

const LibraryDocumentCommentRun = ({
	layer,
	id,
	isEnd,
	isInField = false,
	children,
}: LibraryDocumentCommentRunProps) => {
	const placed = layer.threads.find(({ thread }) => runIdOf(thread) === id)
	const draft = id === DRAFT_RUN ? layer.draft?.draft : undefined
	if (!placed && !draft) return children
	const state = placed ? pinStateOf(layer, placed.thread) : "selected"
	const pin = placed ? (
		<ThreadPin
			className={PASSAGE_PIN[state]}
			layer={layer}
			thread={placed.thread}
		/>
	) : (
		draft && <DraftPin className={PASSAGE_PIN[state]} draft={draft} />
	)

	return (
		<Passage
			endOf={isEnd && isInField ? id : undefined}
			pin={isEnd && !isInField ? pin : null}
			state={state}
		>
			{children}
		</Passage>
	)
}

const UNDER_PIN = "end-0 top-full mt-2"

type LibraryDocumentBlockCommentsProps = {
	layer: LibraryDocumentCommentLayer
	blockId: string
	source: string
	isWriting: boolean
}

const LibraryDocumentBlockComments = ({
	layer,
	blockId,
	source,
	isWriting,
}: LibraryDocumentBlockCommentsProps) => {
	const { t } = useTranslation("common")
	const mentionNameOf = useMentionNameOf()
	const { openThread, participants } = layer
	const threads = layer.threads.filter(
		({ anchor }) => anchor.blockId === blockId,
	)
	const draft =
		layer.draft?.anchor.blockId === blockId ? layer.draft : undefined
	if (threads.length === 0 && !draft) return null

	const blockThreads = threads.filter(({ anchor }) => !anchor.passage)
	const openPassage = threads.find(
		({ thread, anchor }) => anchor.passage && thread.id === openThread?.id,
	)
	const isBlockDraft = draft !== undefined && !draft.anchor.passage
	const fieldPins = isWriting
		? [
				...threads.flatMap(({ thread, anchor }) =>
					anchor.passage
						? [
								{
									run: runIdOf(thread),
									isAboveLine: pinStateOf(layer, thread) === "resolved",
									pin: <ThreadPin layer={layer} thread={thread} />,
								},
							]
						: [],
				),
				...(draft?.anchor.passage
					? [
							{
								run: DRAFT_RUN,
								isAboveLine: false,
								pin: <DraftPin draft={draft.draft} />,
							},
						]
					: []),
			]
		: []
	const isFromShortcut = draft?.draft.target.origin === "shortcut"
	const lineOf = ({ passage }: LibraryBlockAnchor) =>
		passage
			? t("library.comments.anchor.passage", {
					text: passageQuoteOf(source, passage, mentionNameOf),
				})
			: t("library.comments.anchor.block")
	const draftCard = draft ? (
		<DraftCard
			anchor={lineOf(draft.anchor)}
			draft={draft.draft}
			participants={participants}
		/>
	) : null
	const threadCardOf = ({ thread, anchor }: PlacedThread) =>
		openThread ? (
			<LibraryDocumentThreadCard
				anchor={lineOf(anchor)}
				open={openThread}
				participants={participants}
				thread={thread}
			/>
		) : null

	return (
		<>
			{blockThreads.length > 0 || isBlockDraft ? (
				<div
					className="absolute start-full -top-1 ms-4 flex gap-1"
					data-slot="library-document-comment-pins"
				>
					{blockThreads.map((placed) => (
						<span className="relative flex" key={placed.thread.id}>
							<ThreadPin layer={layer} thread={placed.thread} />
							{placed.thread.id === openThread?.id ? (
								<CardFrame className={UNDER_PIN}>
									{threadCardOf(placed)}
								</CardFrame>
							) : null}
						</span>
					))}
					{isBlockDraft ? (
						<span className="relative flex">
							<DraftPin draft={draft.draft} />
							{isFromShortcut ? null : (
								<CardFrame className={UNDER_PIN}>{draftCard}</CardFrame>
							)}
						</span>
					) : null}
				</div>
			) : null}
			{isBlockDraft && isFromShortcut ? (
				<CardFrame className="-end-2 top-full mt-3">{draftCard}</CardFrame>
			) : null}
			{fieldPins.map(({ run, isAboveLine, pin }) => (
				<PinOnPassageEnd isAboveLine={isAboveLine} key={run} pin={run}>
					{pin}
				</PinOnPassageEnd>
			))}
			{draft?.anchor.passage ? (
				<CardBesidePin key={draft.anchor.passage.start} pin={DRAFT_RUN}>
					{draftCard}
				</CardBesidePin>
			) : null}
			{openPassage ? (
				<CardBesidePin
					key={openPassage.thread.id}
					pin={runIdOf(openPassage.thread)}
				>
					{threadCardOf(openPassage)}
				</CardBesidePin>
			) : null}
		</>
	)
}

export {
	COMMENT_CARD_SLOT,
	commentLayerOf,
	commentRunsIn,
	hasBlockDraft,
	isCommentRun,
	LibraryDocumentBlockComments,
	LibraryDocumentBlockTint,
	type LibraryDocumentCommentDraft,
	type LibraryDocumentCommentOrigin,
	type LibraryDocumentCommentProps,
	LibraryDocumentCommentRun,
	type LibraryDocumentCommentTarget,
	LibraryDocumentModeCursor,
	type LibraryDocumentOpenThread,
	type LibraryDocumentThread,
	LibraryDocumentThreadCard,
}
