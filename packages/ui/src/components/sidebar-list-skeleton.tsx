import { Fragment } from "react"

import { NAVIGATION_ROW_GAP } from "@workspace/ui/components/app-rail"
import { RosterZoneSeparator } from "@workspace/ui/components/app-sidebar-roster-parts"
import {
	ListSkeleton,
	SkeletonBar,
	SkeletonHexagon,
	SkeletonRow,
	type SkeletonRowProps,
} from "@workspace/ui/components/list-skeleton"
import { cn } from "@workspace/ui/lib/utils"

type SidebarRowKind = "agent" | "conversation"

type SidebarRowShape = Pick<
	SkeletonRowProps,
	"titleClassName" | "stampClassName" | "previewClassName"
> & { kind: SidebarRowKind }

const AGENT_TITLE_BADGE = (
	<SkeletonBar className="h-3.5 w-14 shrink-0" isFaint />
)

const AGENT_PILE = (
	<span
		className="relative block h-4 w-6 shrink-0"
		data-slot="skeleton-agent-pile"
	>
		<SkeletonHexagon className="absolute start-0 top-px size-3.5" />
		<SkeletonHexagon className="absolute start-2.5 top-px size-3.5" />
	</span>
)

const SIDEBAR_ROW_CYCLE: SidebarRowShape[] = [
	{
		kind: "conversation",
		titleClassName: "w-16.5",
		stampClassName: "w-7.5",
		previewClassName: "w-43",
	},
	{
		kind: "agent",
		titleClassName: "w-12",
		stampClassName: "w-6.5",
		previewClassName: "w-34.5",
	},
	{
		kind: "agent",
		titleClassName: "w-18.5",
		stampClassName: "w-8.5",
		previewClassName: "w-46",
	},
	{
		kind: "conversation",
		titleClassName: "w-13.5",
		stampClassName: "w-6.5",
		previewClassName: "w-31.5",
	},
	{
		kind: "agent",
		titleClassName: "w-15.5",
		stampClassName: "w-7.5",
		previewClassName: "w-40",
	},
	{
		kind: "conversation",
		titleClassName: "w-11",
		stampClassName: "w-6",
		previewClassName: "w-36.5",
	},
]

const PINNED_ROW_COUNT = 2

const sidebarRowAt = (index: number) => {
	const { kind, ...widths } =
		SIDEBAR_ROW_CYCLE[index % SIDEBAR_ROW_CYCLE.length]

	return (
		<SkeletonRow
			hexagonClassName="size-10"
			previewTrailing={kind === "conversation" ? AGENT_PILE : undefined}
			titleTrailing={kind === "agent" ? AGENT_TITLE_BADGE : undefined}
			{...widths}
		/>
	)
}

const recentRowAt = (index: number) => sidebarRowAt(PINNED_ROW_COUNT + index)

const PINNED_ROW_KEYS = Array.from(
	{ length: PINNED_ROW_COUNT },
	(_, index) => `pinned-${index}`,
)

const SidebarListSkeleton = () => (
	<div
		aria-hidden="true"
		className="flex size-full animate-pulse flex-col gap-1 overflow-hidden motion-reduce:animate-none"
		data-slot="sidebar-list-skeleton"
	>
		<div
			className={cn("flex shrink-0 flex-col", NAVIGATION_ROW_GAP)}
			data-slot="sidebar-list-skeleton-pinned"
		>
			{PINNED_ROW_KEYS.map((rowKey, index) => (
				<Fragment key={rowKey}>{sidebarRowAt(index)}</Fragment>
			))}
		</div>
		<RosterZoneSeparator />
		<ListSkeleton
			className={cn("min-h-0 flex-1 animate-none", NAVIGATION_ROW_GAP)}
			row={recentRowAt}
		/>
	</div>
)

export { SidebarListSkeleton, sidebarRowAt }
