import {
	ListSkeleton,
	SkeletonRow,
	type SkeletonRowProps,
} from "@workspace/ui/components/list-skeleton"

type SidebarRowWidths = Omit<SkeletonRowProps, "hexagonClassName">

const SIDEBAR_ROW_CYCLE: SidebarRowWidths[] = [
	{
		titleClassName: "w-16.5",
		stampClassName: "w-7.5",
		previewClassName: "w-43",
	},
	{
		titleClassName: "w-12",
		stampClassName: "w-6.5",
		previewClassName: "w-34.5",
	},
	{
		titleClassName: "w-18.5",
		stampClassName: "w-8.5",
		previewClassName: "w-46",
	},
	{
		titleClassName: "w-13.5",
		stampClassName: "w-6.5",
		previewClassName: "w-31.5",
	},
	{
		titleClassName: "w-15.5",
		stampClassName: "w-7.5",
		previewClassName: "w-40",
	},
	{ titleClassName: "w-11", stampClassName: "w-6", previewClassName: "w-36.5" },
]

const sidebarRowAt = (index: number) => (
	<SkeletonRow
		hexagonClassName="size-10"
		{...SIDEBAR_ROW_CYCLE[index % SIDEBAR_ROW_CYCLE.length]}
	/>
)

const SidebarListSkeleton = () => <ListSkeleton row={sidebarRowAt} />

export { SidebarListSkeleton }
