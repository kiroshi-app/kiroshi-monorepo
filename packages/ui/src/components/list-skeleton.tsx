"use client"

import { type ReactNode, useLayoutEffect, useRef, useState } from "react"

import { COMPANION_SILHOUETTE } from "@workspace/ui/components/companion-picture"
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import { cn } from "@workspace/ui/lib/utils"

type ListSkeletonAnchor = "top" | "bottom"

type ListSkeletonProps = {
	row: ReactNode
	anchor?: ListSkeletonAnchor
	className?: string
}

const rowsToFill = (container: HTMLElement) => {
	const firstRow = container.firstElementChild
	if (!(firstRow instanceof HTMLElement)) return 1
	const rowHeight = firstRow.offsetHeight
	const pitch =
		rowHeight + Number.parseFloat(getComputedStyle(container).rowGap)
	if (pitch <= 0) return 1
	return Math.max(1, Math.ceil(container.clientHeight / pitch))
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
		const observer = new ResizeObserver(() =>
			setRowCount(rowsToFill(container)),
		)
		observer.observe(container)
		return () => observer.disconnect()
	}, [])

	return (
		<div
			aria-hidden="true"
			className={cn(
				"flex size-full min-h-0 animate-pulse gap-3 overflow-hidden contain-size motion-reduce:animate-none",
				anchor === "bottom" ? "flex-col-reverse" : "flex-col",
				className,
			)}
			data-slot="list-skeleton"
			ref={containerRef}
		>
			{rowKeys.map((rowKey) => (
				<div className="shrink-0" data-slot="list-skeleton-row" key={rowKey}>
					{row}
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

const GenericSkeletonRow = () => (
	<div className="flex items-center gap-2.5">
		<Skeleton
			className="size-10 shrink-0 animate-none rounded-none bg-border"
			style={COMPANION_SILHOUETTE}
		/>
		<div className="flex min-w-0 flex-1 flex-col gap-1.75">
			<div className="flex items-center justify-between">
				<SkeletonBar className="w-16.5" />
				<SkeletonBar className="w-7" isFaint />
			</div>
			<SkeletonBar className="w-35" isFaint />
		</div>
	</div>
)

export type { ListSkeletonAnchor, ListSkeletonProps }
export { GenericSkeletonRow, ListSkeleton }
