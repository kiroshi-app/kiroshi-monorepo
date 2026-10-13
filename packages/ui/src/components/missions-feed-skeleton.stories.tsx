import type { CSSProperties } from "react"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectSkeletonFilledTo,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { MissionsFeedSkeleton } from "@workspace/ui/components/missions-feed-skeleton"
import { SIDEBAR_DEFAULT_WIDTH } from "@workspace/ui/components/sidebar-resize"
import {
	Sidebar,
	SidebarContent,
	SidebarProvider,
} from "@workspace/ui/components/ui/sidebar"

const PANEL_STYLE = {
	"--sidebar-width": `${SIDEBAR_DEFAULT_WIDTH}px`,
} as CSSProperties

const meta = preview.meta({
	title: "Feedback/MissionsFeedSkeleton",
	component: MissionsFeedSkeleton,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The stand-in for the Missions feed while it is on its way: groups of two then three mission rows, each under a one-bar group header, the rows a 32 pixel hexagon beside a title, a time and a preview. It reads from the top and runs to the bottom of the list region, the last group cut by its edge. Only the list region waits: the panel header and the rail stay the loaded components.",
			},
		},
	},
	render: () => (
		<SidebarProvider className="h-svh" style={PANEL_STYLE}>
			<Sidebar collapsible="none">
				<SidebarContent className="px-2 py-0">
					<MissionsFeedSkeleton />
				</SidebarContent>
			</Sidebar>
		</SidebarProvider>
	),
	play: async ({ canvasElement }) => {
		await expectSkeletonFilledTo(canvasElement, "bottom")
		const [pairGroup, trioGroup] = slotsIn(canvasElement, "list-skeleton-row")
		const [header, hexagon, title, stamp] = slotsIn(pairGroup, "skeleton")

		await expect(slotIn(canvasElement, "list-skeleton")).toHaveAttribute(
			"aria-hidden",
			"true",
		)
		await expect(slotsIn(pairGroup, "skeleton")).toHaveLength(1 + 2 * 4)
		await expect(slotsIn(trioGroup, "skeleton")).toHaveLength(1 + 3 * 4)
		await expect(header.getBoundingClientRect().width).toBe(92)
		await expect(header.getBoundingClientRect().height).toBe(9)
		await expect(hexagon.getBoundingClientRect().width).toBe(32)
		await expect(title.getBoundingClientRect().width).toBe(150)
		await expect(stamp.getBoundingClientRect().width).toBe(28)
		await expect(
			trioGroup.getBoundingClientRect().top -
				pairGroup.getBoundingClientRect().bottom,
		).toBe(12)
	},
})

export const Light = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The feed in the sidebar at its default width, light theme. Check that groups alternate two then three rows, that their headers alternate a long then a short bar, and that the last group is cut by the bottom edge. Pick `Dark` for the dark theme.",
			},
		},
	},
})

export const Dark = meta.story({
	globals: { theme: "dark", theme_layout: "single" },
	parameters: {
		docs: {
			description: {
				story:
					"The same feed in the dark theme. Check that the solid header, title and hexagon stay apart from the faint time and preview bars against the dark sidebar. Pick `Light` for the light theme.",
			},
		},
	},
})
