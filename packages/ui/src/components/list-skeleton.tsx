"use client"

import { type ReactNode, useLayoutEffect, useRef, useState } from "react"

import { COMPANION_SILHOUETTE } from "@workspace/ui/components/companion-picture"
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import { cn } from "@workspace/ui/lib/utils"

type ListSkeletonAnchor = "top" | "bottom"

type ListSkeletonRowAt = (index: number) => ReactNode

type ListSkeletonProps = {
	row: ReactNode | ListSkeletonRowAt
	anchor?: ListSkeletonAnchor
	className?: string
}

const rowsToFill = (container: HTMLElement, anchor: ListSkeletonAnchor) => {
	const style = getComputedStyle(container)
	const gap = Number.parseFloat(style.rowGap) || 0
	const inset =
		Number.parseFloat(
			anchor === "bottom" ? style.paddingBottom : style.paddingTop,
		) || 0
	const room = container.clientHeight - inset
	const rows = Array.from(container.children)
	let reach = -gap
	for (const [index, row] of rows.entries()) {
		reach += row.getBoundingClientRect().height + gap
		if (reach >= room) return index + 1
	}
	const pitch = (reach + gap) / rows.length
	if (pitch <= 0) return rows.length
	return rows.length + Math.ceil((room - reach) / pitch)
}

const ListSkeleton = ({
	row,
	anchor = "top",
	className,
}: ListSkeletonProps) => {
	const containerRef = useRef<HTMLDivElement>(null)
	const [rowCount, setRowCount] = useState(1)
	const rowKeys = Array.from({ length: rowCount }, (_, index) => `row-${index}`)

	useLayoutEffect(() => {
		const container = containerRef.current
		if (!container) return
		const rowsNeeded = rowsToFill(container, anchor)
		if (rowsNeeded !== rowCount) setRowCount(rowsNeeded)
	}, [rowCount, anchor])

	useLayoutEffect(() => {
		const container = containerRef.current
		if (!container) return
		const observer = new ResizeObserver(() =>
			setRowCount(rowsToFill(container, anchor)),
		)
		observer.observe(container)
		return () => observer.disconnect()
	}, [anchor])

	return (
		<div
			aria-hidden="true"
			className={cn(
				"flex size-full animate-pulse gap-1 overflow-hidden contain-size motion-reduce:animate-none",
				anchor === "bottom" ? "flex-col-reverse" : "flex-col",
				className,
			)}
			data-slot="list-skeleton"
			ref={containerRef}
		>
			{rowKeys.map((rowKey, index) => (
				<div className="shrink-0" data-slot="list-skeleton-row" key={rowKey}>
					{typeof row === "function" ? row(index) : row}
				</div>
			))}
		</div>
	)
}

type SkeletonBarProps = {
	className: string
	isFaint?: boolean
}

const SkeletonBar = ({ className, isFaint = false }: SkeletonBarProps) => (
	<Skeleton
		className={cn(
			"animate-none rounded-full",
			isFaint ? "h-2.25 bg-border/60" : "h-3 bg-border",
			className,
		)}
	/>
)

type SkeletonHexagonProps = {
	className: string
}

const SkeletonHexagon = ({ className }: SkeletonHexagonProps) => (
	<Skeleton
		className={cn("shrink-0 animate-none rounded-none bg-border", className)}
		style={COMPANION_SILHOUETTE}
	/>
)

type SkeletonRowProps = {
	hexagonClassName: string
	titleClassName: string
	stampClassName: string
	previewClassName: string
}

const SkeletonRow = ({
	hexagonClassName,
	titleClassName,
	stampClassName,
	previewClassName,
}: SkeletonRowProps) => (
	<div className="flex items-center gap-2.5 py-1.5 ps-1.5 pe-3">
		<SkeletonHexagon className={hexagonClassName} />
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="flex h-5 items-center justify-between">
				<SkeletonBar className={titleClassName} />
				<SkeletonBar className={stampClassName} isFaint />
			</div>
			<div className="flex h-4 items-center">
				<SkeletonBar className={previewClassName} isFaint />
			</div>
		</div>
	</div>
)

const GenericSkeletonRow = () => (
	<SkeletonRow
		hexagonClassName="size-10"
		previewClassName="w-43"
		stampClassName="w-7.5"
		titleClassName="w-16.5"
	/>
)

export type {
	ListSkeletonAnchor,
	ListSkeletonProps,
	ListSkeletonRowAt,
	SkeletonRowProps,
}
export {
	GenericSkeletonRow,
	ListSkeleton,
	SkeletonBar,
	SkeletonHexagon,
	SkeletonRow,
}
