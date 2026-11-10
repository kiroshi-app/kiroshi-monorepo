import type { CSSProperties } from "react"
import { expect, waitFor } from "storybook/test"

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

const LOADED = {
	rowHeight: 52,
	rowGap: 2,
	rowPadding: 6,
	tile: 40,
	tileRadius: 12,
	tileGap: 10,
	titleHeight: 12,
	previewHeight: 10,
	barGap: 8,
	headerBar: [52, 12],
	zoneGap: 12,
}

const boxOf = (element: Element) => element.getBoundingClientRect()

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
					"The stand-in for the sidebar roster while it is on its way, drawn on the loaded roster: a section header bar over two pinned rows, then a second header over recent rows. Every row is a 40px rounded tile beside a title bar and a fainter preview bar 8px under it. Rows sit 2px apart, the two sections 12px apart, and bar widths turn over a cycle of six rows. It reads from the top and runs to the bottom of the list region, the last row cut by its edge. Only the list region waits: the panel header and the rail stay the loaded components.",
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
		const skeleton = slotIn(canvasElement, "sidebar-list-skeleton")
		const headers = slotsIn(skeleton, "sidebar-list-skeleton-header")
		const rows = slotsIn(skeleton, "sidebar-list-skeleton-row")
		const recentRows = slotsIn(skeleton, "list-skeleton-row")

		await expect(skeleton).toHaveAttribute("aria-hidden", "true")
		await expect(headers).toHaveLength(2)
		const headerBar = headers[0].firstElementChild as Element
		await expect([boxOf(headerBar).width, boxOf(headerBar).height]).toEqual(
			LOADED.headerBar,
		)
		await expect(boxOf(rows[1]).top - boxOf(rows[0]).bottom).toBe(LOADED.rowGap)
		await expect(boxOf(headers[1]).top - boxOf(rows[1]).bottom).toBe(
			LOADED.zoneGap,
		)
		await expect(boxOf(recentRows[0]).top).toBeGreaterThan(
			boxOf(headers[1]).bottom,
		)

		for (const row of rows.slice(0, 4)) {
			const [tile, column] = Array.from(row.children)
			const [title, preview] = Array.from(column.children)
			await expect(boxOf(row).height).toBe(LOADED.rowHeight)
			await expect(boxOf(tile).width).toBe(LOADED.tile)
			await expect(getComputedStyle(tile).borderTopLeftRadius).toBe(
				`${LOADED.tileRadius}px`,
			)
			await expect(boxOf(tile).left - boxOf(row).left).toBe(LOADED.rowPadding)
			await expect(boxOf(title).left - boxOf(tile).right).toBe(LOADED.tileGap)
			await expect(boxOf(title).height).toBe(LOADED.titleHeight)
			await expect(boxOf(preview).height).toBe(LOADED.previewHeight)
			await expect(boxOf(preview).top - boxOf(title).bottom).toBe(LOADED.barGap)
		}

		const rowsAtFullHeight = recentRows.length
		const panel = canvasElement.querySelector<HTMLElement>(
			'[data-slot="sidebar-wrapper"]',
		) as HTMLElement
		panel.style.minHeight = "0"
		panel.style.height = "50vh"
		await waitFor(() =>
			expect(slotsIn(skeleton, "list-skeleton-row").length).toBeLessThan(
				rowsAtFullHeight,
			),
		)
		await expectSkeletonFilledTo(canvasElement, "bottom")
		panel.style.removeProperty("height")
		panel.style.removeProperty("min-height")
		await waitFor(() =>
			expect(slotsIn(skeleton, "list-skeleton-row")).toHaveLength(
				rowsAtFullHeight,
			),
		)
	},
})

export const Light = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The list in the sidebar at its default width, light theme. Check that each section header bar sits above its rows, that no two neighbours share their bar widths, and that the last row is cut by the bottom edge. Pick `Dark` for the dark theme.",
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
					"The same list in the dark theme. Check that the title bars and tiles stay apart from the fainter preview bars against the dark sidebar. Pick `Light` for the light theme.",
			},
		},
	},
})
