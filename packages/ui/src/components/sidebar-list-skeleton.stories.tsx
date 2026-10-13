import type { CSSProperties } from "react"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectSkeletonFilledTo,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { SidebarListSkeleton } from "@workspace/ui/components/sidebar-list-skeleton"
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
	title: "Feedback/SidebarListSkeleton",
	component: SidebarListSkeleton,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The stand-in for the sidebar conversation list while it is on its way: one row shape, a companion hexagon beside a title, a time and a preview, whose bar widths turn over a cycle of six rows. It reads from the top and runs to the bottom of the list region, the last row cut by its edge. Only the list region waits: the panel header and the rail stay the loaded components.",
			},
		},
	},
	render: () => (
		<SidebarProvider className="h-svh" style={PANEL_STYLE}>
			<Sidebar collapsible="none">
				<SidebarContent className="px-2 py-0">
					<SidebarListSkeleton />
				</SidebarContent>
			</Sidebar>
		</SidebarProvider>
	),
	play: async ({ canvasElement }) => {
		await expectSkeletonFilledTo(canvasElement, "bottom")
		const [first, second] = slotsIn(canvasElement, "list-skeleton-row")
		const [hexagon, title, stamp, snippet] = slotsIn(first, "skeleton")

		await expect(slotIn(canvasElement, "list-skeleton")).toHaveAttribute(
			"aria-hidden",
			"true",
		)
		await expect(first.getBoundingClientRect().height).toBe(52)
		await expect(hexagon.getBoundingClientRect().width).toBe(40)
		await expect(title.getBoundingClientRect().width).toBe(66)
		await expect(stamp.getBoundingClientRect().width).toBe(30)
		await expect(snippet.getBoundingClientRect().width).toBe(172)
		await expect(
			slotsIn(second, "skeleton")[1].getBoundingClientRect().width,
		).toBe(48)
	},
})

export const Light = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The list in the sidebar at its default width, light theme. Check that rows start at the top, that no two neighbours share their bar widths, and that the last row is cut by the bottom edge. Pick `Dark` for the dark theme.",
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
					"The same list in the dark theme. Check that the solid title bar and hexagon stay apart from the faint time and preview bars against the dark sidebar. Pick `Light` for the light theme.",
			},
		},
	},
})
