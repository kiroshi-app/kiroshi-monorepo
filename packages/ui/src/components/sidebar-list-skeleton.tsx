import { ROW_ICON_SIDE } from "@workspace/ui/components/app-sidebar-conversation-row"
import { ListSkeleton } from "@workspace/ui/components/list-skeleton"
import { cn } from "@workspace/ui/lib/utils"

type SidebarRowWidths = {
	title: string
	preview: string
}

const SIDEBAR_ROW_CYCLE: SidebarRowWidths[] = [
	{ title: "w-35", preview: "w-45" },
	{ title: "w-27.5", preview: "w-40" },
	{ title: "w-37.5", preview: "w-47.5" },
	{ title: "w-30", preview: "w-42.5" },
	{ title: "w-34", preview: "w-37.5" },
	{ title: "w-25", preview: "w-44" },
	{ title: "w-36", preview: "w-41" },
	{ title: "w-31.5", preview: "w-46" },
	{ title: "w-28", preview: "w-39.5" },
	{ title: "w-34.5", preview: "w-43" },
]

const LIST_END_ROW_WIDTHS: SidebarRowWidths[] = [
	{ title: "w-35", preview: "w-45" },
	{ title: "w-28", preview: "w-41" },
]

const ROW_GAP = "gap-0.5"

const BAR = "block max-w-full rounded"

type SkeletonSectionHeaderProps = {
	padding: string
	width: string
}

const SkeletonSectionHeader = ({
	padding,
	width,
}: SkeletonSectionHeaderProps) => (
	<div
		className={cn("shrink-0", padding)}
		data-slot="sidebar-list-skeleton-header"
	>
		<span className={cn(BAR, "h-3 bg-foreground/7", width)} />
	</div>
)

const SidebarSkeletonRow = ({ title, preview }: SidebarRowWidths) => (
	<div
		className="flex shrink-0 items-center gap-2.5 p-1.5"
		data-slot="sidebar-list-skeleton-row"
	>
		<span
			className="shrink-0 rounded-control bg-foreground/7"
			style={{ width: ROW_ICON_SIDE, height: ROW_ICON_SIDE }}
		/>
		<span className="flex min-w-0 flex-1 flex-col gap-2">
			<span className={cn(BAR, "h-3 bg-foreground/7", title)} />
			<span className={cn(BAR, "h-2.5 bg-foreground/4", preview)} />
		</span>
	</div>
)

const sidebarRowAt = (index: number) => (
	<SidebarSkeletonRow
		{...SIDEBAR_ROW_CYCLE[index % SIDEBAR_ROW_CYCLE.length]}
	/>
)

const ROWS_BEFORE_SECOND_HEADER = 2

const rowAfterSecondHeaderAt = (index: number) =>
	sidebarRowAt(ROWS_BEFORE_SECOND_HEADER + index)

const SidebarListSkeleton = () => (
	<div
		aria-hidden="true"
		className={cn(
			"flex size-full animate-pulse flex-col overflow-hidden pt-1 motion-reduce:animate-none",
			ROW_GAP,
		)}
		data-slot="sidebar-list-skeleton"
	>
		<SkeletonSectionHeader padding="p-1.5" width="w-13" />
		{sidebarRowAt(0)}
		{sidebarRowAt(1)}
		<SkeletonSectionHeader padding="px-1.5 pt-3 pb-1.5" width="w-22" />
		<ListSkeleton
			className={cn("min-h-0 flex-1 animate-none", ROW_GAP)}
			row={rowAfterSecondHeaderAt}
		/>
	</div>
)

const SIDEBAR_LIST_END_ROWS = (
	<div
		className={cn("flex flex-col", ROW_GAP)}
		data-slot="sidebar-list-end-rows"
	>
		{LIST_END_ROW_WIDTHS.map((widths) => (
			<SidebarSkeletonRow key={widths.title} {...widths} />
		))}
	</div>
)

export { SIDEBAR_LIST_END_ROWS, SidebarListSkeleton }
