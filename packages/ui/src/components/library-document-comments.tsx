"use client"

import type { TFunction } from "i18next"
import {
	type ReactNode,
	type Ref,
	useEffect,
	useEffectEvent,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import type {
	LibraryCommentAgent,
	LibraryCommentAnchor,
	LibraryCommentAuthor,
} from "@workspace/ui/components/library-comment-author"
import { LibraryCommentComposer } from "@workspace/ui/components/library-comment-composer"
import type { LibraryCommentDraftOptions } from "@workspace/ui/components/library-comment-field"
import { LibraryCommentPin } from "@workspace/ui/components/library-comment-pin"
import {
	type LibraryComment,
	LibraryCommentThread,
	type LibraryCommentThreadProps,
} from "@workspace/ui/components/library-comment-thread"
import {
	foundAnchorIn,
	type LibraryBlock,
	type LibraryBlockAnchor,
} from "@workspace/ui/components/library-document-blocks"
import type { MarkdownRun } from "@workspace/ui/components/markdown/runs"
import { isMacPlatform } from "@workspace/ui/lib/platform"
import { cn } from "@workspace/ui/lib/utils"

type LibraryDocumentThread = {
	id: string
	anchor: LibraryBlockAnchor
	comments: [LibraryComment, ...LibraryComment[]]
	workingAgent?: LibraryCommentAgent
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

const anchorLineOf = (
	{ passage }: LibraryBlockAnchor,
	t: TFunction<"common">,
) =>
	passage
		? t("library.comments.anchor.passage", { text: passage.text })
		: t("library.comments.anchor.block")

const focusFieldIn = (card: HTMLElement | null) => {
	card?.querySelector("textarea")?.focus()
}

type ThreadPinProps = {
	layer: LibraryDocumentCommentLayer
	thread: LibraryDocumentThread
	className?: string
}

const ThreadPin = ({ layer, thread, className }: ThreadPinProps) => (
	<LibraryCommentPin
		author={thread.comments[0].author}
		className={className}
		data-comment-pin={runIdOf(thread)}
		onClick={() => layer.onOpenThread?.(thread.id)}
		state={layer.openThread?.id === thread.id ? "selected" : "rest"}
	/>
)

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
		workingAgent={thread.workingAgent}
	/>
)

type DraftCardProps = {
	placed: PlacedDraft
	participants: LibraryCommentAuthor[]
}

const DraftCard = ({
	placed: { draft, anchor },
	participants,
}: DraftCardProps) => {
	const { t } = useTranslation("common")

	return (
		<div className="contents" ref={focusFieldIn}>
			<LibraryCommentComposer
				anchor={anchorLineOf(anchor, t)}
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
		</div>
	)
}

type CardFrameProps = {
	children: ReactNode
	className?: string
	left?: number
	top?: number
	ref?: Ref<HTMLDivElement>
}

const CardFrame = ({ children, className, left, top, ref }: CardFrameProps) => (
	// biome-ignore lint/a11y/noStaticElementInteractions: keys typed in a comment card stay out of the shortcuts of the block under it
	<div
		className={cn("absolute z-10 w-max cursor-auto", className)}
		data-slot={COMMENT_CARD_SLOT}
		onKeyDown={(event) => event.stopPropagation()}
		ref={ref}
		style={{ left, top }}
	>
		{children}
	</div>
)

type Place = {
	left: number
	top: number
}

type CardBesidePinProps = {
	pin: string
	children: ReactNode
}

const CardBesidePin = ({ pin, children }: CardBesidePinProps) => {
	const frame = useRef<HTMLDivElement>(null)
	const [place, setPlace] = useState<Place>()

	const measure = useEffectEvent(() => {
		const block = frame.current?.parentElement
		const anchor = block?.querySelector(`[data-comment-pin="${pin}"]`)
		if (!block || !anchor) return
		const from = block.getBoundingClientRect()
		const box = anchor.getBoundingClientRect()
		const next = {
			left: box.right - from.left + PIN_GAP,
			top: box.top - from.top,
		}
		setPlace((shown) =>
			shown?.left === next.left && shown.top === next.top ? shown : next,
		)
	})

	useLayoutEffect(() => measure())

	useEffect(() => {
		const block = frame.current?.parentElement
		if (!block) return
		const observer = new ResizeObserver(() => measure())
		observer.observe(block)
		return () => observer.disconnect()
	}, [])

	return (
		<CardFrame
			className={cn(!place && "opacity-0")}
			left={place?.left}
			ref={frame}
			top={place?.top}
		>
			{children}
		</CardFrame>
	)
}

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
			"pointer-events-none absolute z-20 size-5 -translate-y-full rounded-full rounded-bl-[0.15625rem] bg-primary ring-2 ring-white",
			!isShown && "hidden",
		)}
		data-slot="library-document-comment-cursor"
		ref={ref}
	/>
)

const PASSAGE_PIN = "absolute start-0 top-1/2 -translate-y-1/2"

type PassageProps = {
	isSelected: boolean
	pin: ReactNode
	children: ReactNode
}

const Passage = ({ isSelected, pin, children }: PassageProps) => (
	<>
		<span
			className={cn(
				"box-decoration-clone border-b-2",
				isSelected
					? "border-primary bg-primary/16 dark:bg-primary/20"
					: "border-primary/50 bg-primary/8",
			)}
			data-slot="library-document-passage"
			data-state={isSelected ? "selected" : "rest"}
		>
			{children}
		</span>
		{pin ? <span className="relative select-none">{pin}</span> : null}
	</>
)

type LibraryDocumentCommentRunProps = {
	layer: LibraryDocumentCommentLayer
	id: string
	isEnd: boolean
	children: ReactNode
}

const LibraryDocumentCommentRun = ({
	layer,
	id,
	isEnd,
	children,
}: LibraryDocumentCommentRunProps) => {
	if (id === DRAFT_RUN)
		return (
			<Passage
				isSelected
				pin={
					isEnd && layer.draft ? (
						<LibraryCommentPin
							author={layer.draft.draft.author}
							className={PASSAGE_PIN}
							data-comment-pin={DRAFT_RUN}
							state="selected"
						/>
					) : null
				}
			>
				{children}
			</Passage>
		)
	const placed = layer.threads.find(({ thread }) => runIdOf(thread) === id)
	if (!placed) return children
	return (
		<Passage
			isSelected={layer.openThread?.id === placed.thread.id}
			pin={
				isEnd ? (
					<ThreadPin
						className={PASSAGE_PIN}
						layer={layer}
						thread={placed.thread}
					/>
				) : null
			}
		>
			{children}
		</Passage>
	)
}

const UNDER_PIN = "end-0 top-full mt-2"

type LibraryDocumentBlockCommentsProps = {
	layer: LibraryDocumentCommentLayer
	blockId: string
}

const LibraryDocumentBlockComments = ({
	layer,
	blockId,
}: LibraryDocumentBlockCommentsProps) => {
	const { t } = useTranslation("common")
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
	const isFromShortcut = draft?.draft.target.origin === "shortcut"
	const draftCard = draft ? (
		<DraftCard participants={participants} placed={draft} />
	) : null
	const threadCardOf = ({ thread, anchor }: PlacedThread) =>
		openThread ? (
			<LibraryDocumentThreadCard
				anchor={anchorLineOf(anchor, t)}
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
							<LibraryCommentPin
								author={draft.draft.author}
								data-comment-pin={DRAFT_RUN}
								state="selected"
							/>
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
