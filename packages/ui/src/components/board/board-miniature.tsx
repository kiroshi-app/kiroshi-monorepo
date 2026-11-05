"use client"

import { useCallback, useState } from "react"

import {
	BoardImage,
	type BoardImageProps,
} from "@workspace/ui/components/board/board-image"
import {
	BoardLibraryCard,
	type BoardLibraryCardProps,
} from "@workspace/ui/components/board/board-library-card"
import {
	BoardLinkCard,
	type BoardLinkCardProps,
} from "@workspace/ui/components/board/board-link-card"
import {
	BoardSection,
	type BoardSectionProps,
} from "@workspace/ui/components/board/board-section"
import {
	BoardShape,
	type BoardShapeProps,
} from "@workspace/ui/components/board/board-shape"
import {
	BoardSticky,
	type BoardStickyProps,
} from "@workspace/ui/components/board/board-sticky"
import {
	BoardText,
	type BoardTextProps,
} from "@workspace/ui/components/board/board-text"
import { BoardDotGrid } from "@workspace/ui/components/board-canvas"
import type { BoardRect, BoardSize } from "@workspace/ui/components/board-view"
import { fitBoardBounds } from "@workspace/ui/components/board-viewport"

const MINIATURE_MARGIN = 20
const MINIATURE_GRID_PITCH = 12
const GRID_ORIGIN = { x: 0, y: 0 }

type Sized<Props> = Omit<Props, "width" | "height">

type BoardSnapshotObject = BoardRect &
	(
		| { kind: "sticky"; props: BoardStickyProps }
		| { kind: "text"; props: BoardTextProps }
		| { kind: "shape"; props: Sized<BoardShapeProps> }
		| { kind: "section"; props: Sized<BoardSectionProps> }
		| { kind: "image"; props: Sized<BoardImageProps> }
		| { kind: "link"; props: BoardLinkCardProps }
		| { kind: "library"; props: Omit<BoardLibraryCardProps, "isDragging"> }
	)

type BoardSnapshot = {
	bounds: BoardRect
	objects: readonly BoardSnapshotObject[]
}

const renderSnapshotObject = (object: BoardSnapshotObject) => {
	const size = { width: object.width, height: object.height }
	switch (object.kind) {
		case "sticky":
			return <BoardSticky {...object.props} />
		case "text":
			return <BoardText {...object.props} />
		case "shape":
			return <BoardShape {...object.props} {...size} />
		case "section":
			return <BoardSection {...object.props} {...size} />
		case "image":
			return <BoardImage {...object.props} {...size} />
		case "link":
			return <BoardLinkCard {...object.props} />
		case "library":
			return <BoardLibraryCard {...object.props} />
	}
}

type BoardMiniatureProps = {
	snapshot: BoardSnapshot
}

const BoardMiniature = ({ snapshot }: BoardMiniatureProps) => {
	const [box, setBox] = useState<BoardSize | null>(null)
	const measure = useCallback((element: HTMLDivElement | null) => {
		if (!element) return
		const observer = new ResizeObserver(() =>
			setBox({ width: element.clientWidth, height: element.clientHeight }),
		)
		observer.observe(element)
		return () => observer.disconnect()
	}, [])
	const fitted =
		box && snapshot.objects.length > 0
			? fitBoardBounds(snapshot.bounds, box, MINIATURE_MARGIN)
			: null

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 overflow-hidden"
			data-slot="board-miniature"
			ref={measure}
		>
			<BoardDotGrid offset={GRID_ORIGIN} pitch={MINIATURE_GRID_PITCH} />
			{fitted ? (
				<div
					className="absolute top-0 left-0 origin-top-left"
					style={{
						transform: `translate(${fitted.offset.x}px, ${fitted.offset.y}px) scale(${fitted.zoom})`,
					}}
				>
					{snapshot.objects.map((object, index) => (
						<div
							className="absolute"
							data-slot="board-miniature-object"
							// biome-ignore lint/suspicious/noArrayIndexKey: a snapshot object carries no id and its order is its z order
							key={index}
							style={{
								left: object.x,
								top: object.y,
								width: object.width,
								height: object.height,
							}}
						>
							{renderSnapshotObject(object)}
						</div>
					))}
				</div>
			) : null}
		</div>
	)
}

export {
	BoardMiniature,
	type BoardMiniatureProps,
	type BoardSnapshot,
	type BoardSnapshotObject,
}
