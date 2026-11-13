"use client"

import { type PointerEvent, type ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import type { BoardClientPoint } from "@workspace/ui/components/board/board-dock"
import {
	type BoardCommentAnchor,
	commentPinPointOf,
	commentRingRadiusOf,
	commentRingRectOf,
	composerCornerOf,
	isNodeAnchor,
	threadCornerBesidePin,
	threadCornerUnderRing,
	toScreenPoint,
} from "@workspace/ui/components/board-comments"
import type {
	BoardItem,
	BoardPoint,
	BoardRect,
	BoardViewport,
} from "@workspace/ui/components/board-view"
import type { LibraryCommentAuthor } from "@workspace/ui/components/library-comment-author"
import { LibraryCommentComposer } from "@workspace/ui/components/library-comment-composer"
import type { LibraryCommentDraftOptions } from "@workspace/ui/components/library-comment-field"
import { LibraryCommentModeHint } from "@workspace/ui/components/library-comment-mode-hint"
import { LibraryCommentPin } from "@workspace/ui/components/library-comment-pin"
import {
	LibraryCommentThread,
	type LibraryCommentThreadProps,
} from "@workspace/ui/components/library-comment-thread"

type BoardCommentThread = {
	id: string
	author: LibraryCommentAuthor
} & ({ anchor: string; lastPoint: BoardPoint } | { anchor: BoardPoint })

type BoardCommentDraft = LibraryCommentDraftOptions & {
	anchor: BoardCommentAnchor
	author: LibraryCommentAuthor
}

type BoardOpenCommentThread = Omit<
	LibraryCommentThreadProps,
	"anchor" | "className"
> & {
	id: string
}

type BoardCommentScene = {
	items: ReadonlyMap<string, BoardItem>
	boundsOf: (item: BoardItem) => BoardRect
	objectNodeOf: (id: string) => HTMLElement | null | undefined
	viewport: BoardViewport
}

type BoardCommentPlace = {
	anchor: BoardCommentAnchor
	lastPoint?: BoardPoint
}

const placedOf = (
	{ items, boundsOf, viewport }: BoardCommentScene,
	{ anchor, lastPoint }: BoardCommentPlace,
) => {
	const node = isNodeAnchor(anchor) ? items.get(anchor) : undefined
	const isGone = isNodeAnchor(anchor) && !node
	const point = node
		? commentPinPointOf(boundsOf(node))
		: isNodeAnchor(anchor)
			? lastPoint
			: anchor
	return point
		? { node, isGone, pinTail: toScreenPoint(point, viewport) }
		: null
}

const drawnRadiusOf = (object: Element | null | undefined) => {
	let drawn = object?.firstElementChild
	while (drawn && getComputedStyle(drawn).display === "contents")
		drawn = drawn.firstElementChild
	return drawn ? getComputedStyle(drawn).borderTopLeftRadius : ""
}

type BoardCommentRingProps = BoardCommentScene & {
	node: BoardItem
}

const BoardCommentRing = ({
	node,
	boundsOf,
	objectNodeOf,
	viewport,
}: BoardCommentRingProps) => {
	const [drawnRadius, setDrawnRadius] = useState("")
	const ring = commentRingRectOf(boundsOf(node), viewport)

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute border-2 border-primary"
			data-object-id={node.id}
			data-slot="board-comment-ring"
			ref={(mounted) => {
				if (mounted) setDrawnRadius(drawnRadiusOf(objectNodeOf(node.id)))
			}}
			style={{
				left: ring.x,
				top: ring.y,
				width: ring.width,
				height: ring.height,
				borderRadius: commentRingRadiusOf(drawnRadius, viewport.zoom),
			}}
		/>
	)
}

type BoardCommentMarkProps = {
	slot: string
	threadId?: string
	pinTail: BoardPoint
	children: ReactNode
}

const BoardCommentMark = ({
	slot,
	threadId,
	pinTail,
	children,
}: BoardCommentMarkProps) => (
	<div
		className="absolute -translate-y-full"
		data-slot={slot}
		data-thread-id={threadId}
		style={{ left: pinTail.x, top: pinTail.y }}
	>
		{children}
	</div>
)

type BoardCommentCornerProps = {
	at: BoardPoint
	children: ReactNode
}

const BoardCommentCorner = ({ at, children }: BoardCommentCornerProps) => (
	<div
		className="absolute z-10 size-0 select-text"
		style={{ left: at.x, top: at.y }}
	>
		{children}
	</div>
)

type BoardCommentAim = {
	at: BoardPoint
	nodeId: string | null
}

type BoardCommentIntents = {
	nodeIdUnder: (pointer: BoardClientPoint) => string | null
	onStartCommentAt: (pointer: BoardClientPoint) => void
	onLeaveCommentMode?: () => void
}

type BoardCommentSurfaceProps = BoardCommentScene &
	BoardCommentIntents & {
		ringedNodes: readonly BoardItem[]
	}

const BoardCommentSurface = ({
	nodeIdUnder,
	onStartCommentAt,
	onLeaveCommentMode,
	ringedNodes,
	...scene
}: BoardCommentSurfaceProps) => {
	const [aim, setAim] = useState<BoardCommentAim | null>(null)
	const aimedNode = aim?.nodeId ? scene.items.get(aim.nodeId) : undefined

	useEffect(() => {
		const leaveOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !event.defaultPrevented)
				onLeaveCommentMode?.()
		}
		window.addEventListener("keydown", leaveOnEscape)
		return () => window.removeEventListener("keydown", leaveOnEscape)
	}, [onLeaveCommentMode])

	const aimWithPointer = (event: PointerEvent<HTMLDivElement>) => {
		const surface = event.currentTarget.getBoundingClientRect()
		setAim({
			at: {
				x: event.clientX - surface.left,
				y: event.clientY - surface.top,
			},
			nodeId: nodeIdUnder(event),
		})
	}

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: comment mode is aimed with the pointer, Enter on a focused object is its keyboard twin and the board handles it */}
			<div
				className="absolute inset-0 cursor-none"
				data-slot="board-comment-surface"
				onClick={onStartCommentAt}
				onPointerLeave={() => setAim(null)}
				onPointerMove={aimWithPointer}
			/>
			{aimedNode && !ringedNodes.includes(aimedNode) ? (
				<BoardCommentRing {...scene} node={aimedNode} />
			) : null}
			{aim ? (
				<div
					aria-hidden="true"
					className="pointer-events-none absolute z-20 size-5 -translate-y-full rounded-full rounded-bl-[2px] bg-primary shadow-comment-pin-selected ring-2 ring-white"
					data-slot="board-comment-cursor"
					style={{ left: aim.at.x, top: aim.at.y }}
				/>
			) : null}
		</>
	)
}

type BoardCommentLayerProps = BoardCommentScene &
	BoardCommentIntents & {
		threads: readonly BoardCommentThread[]
		openThread?: BoardOpenCommentThread
		draft?: BoardCommentDraft
		isCommentMode: boolean
		onOpenThread?: (id: string) => void
	}

const BoardCommentLayer = ({
	threads,
	openThread,
	draft,
	isCommentMode,
	onOpenThread,
	nodeIdUnder,
	onStartCommentAt,
	onLeaveCommentMode,
	...scene
}: BoardCommentLayerProps) => {
	const { t } = useTranslation("common")

	const anchorLineOf = (node?: BoardItem) =>
		node
			? t("board.comments.anchor.node", {
					title: node.text || t(`board.object.kind.${node.kind}`),
				})
			: t("board.comments.anchor.board")

	const pins = threads.flatMap((thread) => {
		const placed = placedOf(scene, thread)
		return placed ? [{ ...placed, thread }] : []
	})
	const open = pins.find(({ thread }) => thread.id === openThread?.id)
	const drafted = draft ? placedOf(scene, draft) : null
	const ringedNodes = [
		...new Set(
			[open?.node, drafted?.node].filter((node) => node !== undefined),
		),
	]

	return (
		<>
			{isCommentMode ? (
				<BoardCommentSurface
					{...scene}
					nodeIdUnder={nodeIdUnder}
					onLeaveCommentMode={onLeaveCommentMode}
					onStartCommentAt={onStartCommentAt}
					ringedNodes={ringedNodes}
				/>
			) : null}
			{ringedNodes.map((node) => (
				<BoardCommentRing {...scene} key={node.id} node={node} />
			))}
			{pins.map(({ thread, pinTail }) => (
				<BoardCommentMark
					key={thread.id}
					pinTail={pinTail}
					slot="board-comment-mark"
					threadId={thread.id}
				>
					<LibraryCommentPin
						author={thread.author}
						onClick={() => onOpenThread?.(thread.id)}
						state={thread.id === openThread?.id ? "selected" : "rest"}
					/>
				</BoardCommentMark>
			))}
			{draft && drafted ? (
				<BoardCommentMark
					pinTail={drafted.pinTail}
					slot="board-comment-draft-mark"
				>
					<LibraryCommentPin author={draft.author} state="selected" />
				</BoardCommentMark>
			) : null}
			{open && openThread ? (
				<BoardCommentCorner
					at={
						open.node
							? threadCornerUnderRing(
									commentRingRectOf(scene.boundsOf(open.node), scene.viewport),
								)
							: threadCornerBesidePin(open.pinTail)
					}
				>
					<LibraryCommentThread
						{...openThread}
						anchor={open.isGone ? { gone: "shape" } : anchorLineOf(open.node)}
						className="absolute top-0 right-0 max-w-none"
					/>
				</BoardCommentCorner>
			) : null}
			{draft && drafted ? (
				<BoardCommentCorner at={composerCornerOf(drafted.pinTail)}>
					<LibraryCommentComposer
						anchor={anchorLineOf(drafted.node)}
						className="absolute top-0 left-0 w-80 max-w-none"
						onSubmit={draft.onSubmit}
						onValueChange={draft.onValueChange}
						participants={draft.participants}
						value={draft.value}
					/>
				</BoardCommentCorner>
			) : null}
			{isCommentMode ? (
				<LibraryCommentModeHint
					className="pointer-events-none absolute inset-x-0 bottom-34 mx-auto"
					surface="board"
				/>
			) : null}
		</>
	)
}

export {
	type BoardCommentDraft,
	BoardCommentLayer,
	type BoardCommentThread,
	type BoardOpenCommentThread,
}
