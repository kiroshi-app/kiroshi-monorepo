import { Fragment } from "react"

import { ListSkeleton } from "@workspace/ui/components/list-skeleton"
import { cn } from "@workspace/ui/lib/utils"

type SidebarRowWidths = {
	title: string
	preview: string
}

const SIDEBAR_ROW_CYCLE: SidebarRowWidths[] = [
	{ title: "w-34", preview: "w-47.5" },
	{ title: "w-28", preview: "w-40" },
	{ title: "w-38", preview: "w-44" },
	{ title: "w-32", preview: "w-46" },
	{ title: "w-30", preview: "w-36" },
	{ title: "w-36", preview: "w-42" },
]

const ROWS = "flex flex-col gap-0.5"

const BAR = "block max-w-full rounded"

const SkeletonSectionHeader = () => (
	<div className="shrink-0 p-1.5" data-slot="sidebar-list-skeleton-header">
		<span className={cn(BAR, "h-3 w-13 bg-foreground/7")} />
	</div>
)

const sidebarRowAt = (index: number) => {
	const { title, preview } = SIDEBAR_ROW_CYCLE[index % SIDEBAR_ROW_CYCLE.length]

	return (
		<div
			className="flex items-center gap-2.5 p-1.5"
			data-slot="sidebar-list-skeleton-row"
		>
			<span className="size-10 shrink-0 rounded-control bg-foreground/7" />
			<span className="flex min-w-0 flex-1 flex-col gap-2">
				<span className={cn(BAR, "h-3 bg-foreground/7", title)} />
				<span className={cn(BAR, "h-2.5 bg-foreground/4", preview)} />
			</span>
		</div>
	)
}

const PINNED_ROW_COUNT = 2

const PINNED_ROW_KEYS = Array.from(
	{ length: PINNED_ROW_COUNT },
	(_, index) => `pinned-${index}`,
)

const recentRowAt = (index: number) => sidebarRowAt(PINNED_ROW_COUNT + index)

const SidebarListSkeleton = () => (
	<div
		aria-hidden="true"
		className="flex size-full animate-pulse flex-col gap-3 overflow-hidden motion-reduce:animate-none"
		data-slot="sidebar-list-skeleton"
	>
		<div className={cn("shrink-0", ROWS)}>
			<SkeletonSectionHeader />
			{PINNED_ROW_KEYS.map((rowKey, index) => (
				<Fragment key={rowKey}>{sidebarRowAt(index)}</Fragment>
			))}
		</div>
		<div className={cn("min-h-0 flex-1", ROWS)}>
			<SkeletonSectionHeader />
			<ListSkeleton
				className={cn("min-h-0 flex-1 animate-none", ROWS)}
				row={recentRowAt}
			/>
		</div>
	</div>
)

const SIDEBAR_LIST_END_ROWS = (
	<div className={ROWS} data-slot="sidebar-list-end-rows">
		{sidebarRowAt(0)}
		{sidebarRowAt(1)}
	</div>
)

export { SIDEBAR_LIST_END_ROWS, SidebarListSkeleton }
