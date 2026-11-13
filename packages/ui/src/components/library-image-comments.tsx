"use client"

import { type PointerEvent, type ReactNode, useRef, useState } from "react"

import type { LibraryCommentAuthor } from "@workspace/ui/components/library-comment-author"
import { LibraryCommentPin } from "@workspace/ui/components/library-comment-pin"
import { cn } from "@workspace/ui/lib/utils"

type LibraryImagePoint = { x: number; y: number }

type LibraryImageZone = LibraryImagePoint & { width: number; height: number }

type LibraryImageAnchor = LibraryImagePoint | LibraryImageZone

type LibraryImageThread = {
	id: string
	author: LibraryCommentAuthor
	anchor: LibraryImageAnchor
}

type LibraryImageOpenThread = { id: string; card: ReactNode }

type LibraryImageDraft = {
	author: LibraryCommentAuthor
	anchor: LibraryImageAnchor
	composer: ReactNode
}

type LibraryImageCommentsProps = {
	threads: LibraryImageThread[]
	openThread?: LibraryImageOpenThread
	draft?: LibraryImageDraft
	isCommentMode: boolean
	onOpenThread: (threadId: string) => void
	onStartComment: (anchor: LibraryImageAnchor) => void
}

const DRAG_THRESHOLD = 4

const PIN_ON_SPOT = "absolute bottom-0 left-0"

const ZONE_FRAME = {
	written: "rounded-sm border-2 border-primary bg-primary/14",
	anchored: "rounded-[0.25rem] bg-primary/8 inset-ring-2 inset-ring-primary",
}

const isZone = (anchor: LibraryImageAnchor): anchor is LibraryImageZone =>
	"width" in anchor

const percentOf = (fraction: number) => `${fraction * 100}%`

const clampToImage = (fraction: number) => Math.min(Math.max(fraction, 0), 1)

const zoneBetween = (
	from: LibraryImagePoint,
	to: LibraryImagePoint,
): LibraryImageZone => {
	const x = clampToImage(to.x)
	const y = clampToImage(to.y)

	return {
		x: Math.min(from.x, x),
		y: Math.min(from.y, y),
		width: Math.abs(x - from.x),
		height: Math.abs(y - from.y),
	}
}

const spotOf = (event: PointerEvent<HTMLElement>): LibraryImagePoint => {
	const box = event.currentTarget.getBoundingClientRect()

	return {
		x: (event.clientX - box.left) / box.width,
		y: (event.clientY - box.top) / box.height,
	}
}

type ZoneFrameProps = {
	zone: LibraryImageZone
	state: keyof typeof ZONE_FRAME
}

const ZoneFrame = ({ zone, state }: ZoneFrameProps) => (
	<span
		aria-hidden="true"
		className={cn("pointer-events-none absolute", ZONE_FRAME[state])}
		data-slot="library-image-zone"
		data-state={state}
		style={{
			left: percentOf(zone.x),
			top: percentOf(zone.y),
			width: percentOf(zone.width),
			height: percentOf(zone.height),
		}}
	/>
)

type MarkerProps = {
	anchor: LibraryImageAnchor
	beside?: ReactNode
	children: ReactNode
}

const Marker = ({ anchor, beside, children }: MarkerProps) => (
	<div
		className={cn("absolute size-0", beside !== undefined && "z-10")}
		data-slot="library-image-marker"
		style={{
			left: percentOf(isZone(anchor) ? anchor.x + anchor.width : anchor.x),
			top: percentOf(anchor.y),
		}}
	>
		{children}
		{beside === undefined ? null : (
			<div className="pointer-events-auto absolute -top-8 left-10 w-max">
				{beside}
			</div>
		)}
	</div>
)

const zoneDraggedTo = (
	from: LibraryImagePoint,
	event: PointerEvent<HTMLElement>,
) => {
	const surface = event.currentTarget.getBoundingClientRect()
	const zone = zoneBetween(from, spotOf(event))
	const hasArea =
		zone.width * surface.width >= DRAG_THRESHOLD &&
		zone.height * surface.height >= DRAG_THRESHOLD

	return hasArea ? zone : null
}

type CommentSurfaceProps = Pick<LibraryImageCommentsProps, "onStartComment">

const CommentSurface = ({ onStartComment }: CommentSurfaceProps) => {
	const pressRef = useRef<LibraryImagePoint | null>(null)
	const [pointer, setPointer] = useState<LibraryImagePoint | null>(null)
	const [drawn, setDrawn] = useState<LibraryImageZone | null>(null)

	const dropPress = () => {
		pressRef.current = null
		setDrawn(null)
	}

	return (
		<div
			className="pointer-events-auto absolute inset-0 cursor-none"
			data-slot="library-image-comment-surface"
			onPointerCancel={dropPress}
			onPointerDown={(event) => {
				if (event.button !== 0) return
				event.currentTarget.setPointerCapture(event.pointerId)
				pressRef.current = spotOf(event)
			}}
			onPointerLeave={() => setPointer(null)}
			onPointerMove={(event) => {
				const press = pressRef.current
				setPointer(spotOf(event))
				if (press) setDrawn(zoneDraggedTo(press, event))
			}}
			onPointerUp={(event) => {
				const press = pressRef.current
				if (!press) return
				dropPress()
				onStartComment(zoneDraggedTo(press, event) ?? press)
			}}
		>
			{drawn ? <ZoneFrame state="written" zone={drawn} /> : null}
			{pointer ? (
				<span
					aria-hidden="true"
					className="pointer-events-none absolute size-5 -translate-y-full rounded-full rounded-bl-xs bg-primary ring-2 ring-lightbox-stage"
					data-slot="library-image-comment-cursor"
					style={{ left: percentOf(pointer.x), top: percentOf(pointer.y) }}
				/>
			) : null}
		</div>
	)
}

const LibraryImageComments = ({
	threads,
	openThread,
	draft,
	isCommentMode,
	onOpenThread,
	onStartComment,
}: LibraryImageCommentsProps) => {
	const opened = threads.find((thread) => thread.id === openThread?.id)

	return (
		<div
			className="pointer-events-none absolute inset-0"
			data-slot="library-image-comments"
		>
			{opened && isZone(opened.anchor) ? (
				<ZoneFrame state="anchored" zone={opened.anchor} />
			) : null}
			{draft && isZone(draft.anchor) ? (
				<ZoneFrame state="written" zone={draft.anchor} />
			) : null}
			{isCommentMode ? (
				<CommentSurface onStartComment={onStartComment} />
			) : null}
			{threads.map((thread) => {
				const isOpen = thread === opened

				return (
					<Marker
						anchor={thread.anchor}
						beside={isOpen ? openThread?.card : undefined}
						key={thread.id}
					>
						<LibraryCommentPin
							author={thread.author}
							className={cn(PIN_ON_SPOT, "pointer-events-auto")}
							onClick={() => onOpenThread(thread.id)}
							state={isOpen ? "selected" : "rest"}
							surface="stage"
						/>
					</Marker>
				)
			})}
			{draft ? (
				<Marker anchor={draft.anchor} beside={draft.composer}>
					<LibraryCommentPin
						aria-hidden="true"
						author={draft.author}
						className={PIN_ON_SPOT}
						state="selected"
						surface="stage"
						tabIndex={-1}
					/>
				</Marker>
			) : null}
		</div>
	)
}

export {
	type LibraryImageAnchor,
	LibraryImageComments,
	type LibraryImageCommentsProps,
	type LibraryImageDraft,
	type LibraryImageOpenThread,
	type LibraryImagePoint,
	type LibraryImageThread,
	type LibraryImageZone,
}
