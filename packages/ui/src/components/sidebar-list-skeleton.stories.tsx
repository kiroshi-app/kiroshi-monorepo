import type { CSSProperties } from "react"
import { expect, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectSkeletonFilledTo,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { ROW_ICON_SIDE } from "@workspace/ui/components/app-sidebar-conversation-row"
import { SidebarListSkeleton } from "@workspace/ui/components/sidebar-list-skeleton"
import { SIDEBAR_DEFAULT_WIDTH } from "@workspace/ui/components/sidebar-resize"
import {
	Sidebar,
	SidebarContent,
	SidebarProvider,
} from "@workspace/ui/components/ui/sidebar"

const ROW_PADDING = 8

const LOADED = {
	rowHeight: 52,
	rowGap: 2,
	rowPadding: ROW_PADDING,
	tile: ROW_ICON_SIDE,
	tileRadius: 12,
	tileGap: 10,
	titleHeight: 12,
	previewHeight: 10,
	barGap: 8,
	headerHeight: 32,
	headerBar: [52, 12],
	secondHeaderBar: [88, 12],
	headerBarTop: 10,
	headerRadius: 4,
	sectionGap: 12,
}

const BAR_WIDTHS = [
	[140, 180],
	[110, 160],
	[150, 190],
	[120, 170],
	[136, 150],
	[100, 176],
	[144, 164],
	[126, 184],
	[112, 158],
	[138, 172],
]

const ROWS_FOR_A_FULL_CYCLE = BAR_WIDTHS.length + 2

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
					"The stand-in for the sidebar list while it is on its way, drawn flat: a 52px header bar over two rows, then an 88px header bar over the remaining rows, 12px under the first two. Each header bar sits in a 32px header padded 8 on all four sides, the box of a loaded section header. Every row is 52px, the height of a loaded conversation row without missions, and holds a 28px rounded tile, the size of the conversation icon, beside a title bar and a fainter preview bar 8px under it. A header and its rows sit 2px apart, and bar widths turn over a cycle of ten rows. It reads from the top and runs to the bottom of the list region, the last row cut by its edge. Only the list region waits: the panel header and the rail stay the loaded components.",
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
		const barsOf = (row: Element) =>
			Array.from((row.lastElementChild as Element).children)

		await expect(skeleton).toHaveAttribute("aria-hidden", "true")
		await expect(headers).toHaveLength(2)
		const [headerBar, secondHeaderBar] = headers.map(
			(header) => header.querySelector("span > span") as Element,
		)
		await expect([boxOf(headerBar).width, boxOf(headerBar).height]).toEqual(
			LOADED.headerBar,
		)
		await expect(getComputedStyle(headerBar).borderTopLeftRadius).toBe(
			`${LOADED.headerRadius}px`,
		)
		await expect([
			boxOf(secondHeaderBar).width,
			boxOf(secondHeaderBar).height,
		]).toEqual(LOADED.secondHeaderBar)
		for (const header of headers) {
			const bar = boxOf(header.querySelector("span > span") as Element)
			await expect(boxOf(header).height).toBe(LOADED.headerHeight)
			await expect(bar.left - boxOf(header).left).toBe(LOADED.rowPadding)
			await expect(bar.top - boxOf(header).top).toBe(LOADED.headerBarTop)
		}
		await expect(boxOf(headers[0]).top).toBe(boxOf(skeleton).top)
		await expect(boxOf(rows[1]).top - boxOf(rows[0]).bottom).toBe(LOADED.rowGap)
		await expect(boxOf(headers[1]).top - boxOf(rows[1]).bottom).toBe(
			LOADED.sectionGap,
		)
		await expect(boxOf(rows[2]).top - boxOf(headers[1]).bottom).toBe(
			LOADED.rowGap,
		)
		await expect(boxOf(recentRows[0]).top).toBeGreaterThan(
			boxOf(headers[1]).bottom,
		)

		for (const row of rows.slice(0, 4)) {
			const [tile, column] = Array.from(row.children)
			const [title, preview] = Array.from(column.children)
			await expect(boxOf(row).height).toBe(LOADED.rowHeight)
			await expect([boxOf(tile).width, boxOf(tile).height]).toEqual([
				LOADED.tile,
				LOADED.tile,
			])
			await expect(getComputedStyle(tile).borderTopLeftRadius).toBe(
				`${LOADED.tileRadius}px`,
			)
			await expect(boxOf(tile).left - boxOf(row).left).toBe(LOADED.rowPadding)
			await expect(boxOf(title).left - boxOf(tile).right).toBe(LOADED.tileGap)
			await expect(boxOf(title).height).toBe(LOADED.titleHeight)
			await expect(boxOf(preview).height).toBe(LOADED.previewHeight)
			await expect(boxOf(preview).top - boxOf(title).bottom).toBe(LOADED.barGap)
		}

		const panel = canvasElement.querySelector<HTMLElement>(
			'[data-slot="sidebar-wrapper"]',
		) as HTMLElement
		panel.style.height = "1000px"
		await waitFor(() =>
			expect(
				slotsIn(skeleton, "sidebar-list-skeleton-row").length,
			).toBeGreaterThanOrEqual(ROWS_FOR_A_FULL_CYCLE),
		)
		const rowsPastACycle = slotsIn(skeleton, "sidebar-list-skeleton-row")
		await expect(
			rowsPastACycle
				.slice(0, BAR_WIDTHS.length)
				.map((row) => barsOf(row).map((bar) => boxOf(bar).width)),
		).toEqual(BAR_WIDTHS)
		await expect(
			barsOf(rowsPastACycle[BAR_WIDTHS.length]).map((bar) => boxOf(bar).width),
		).toEqual(BAR_WIDTHS[0])
		panel.style.removeProperty("height")
		await waitFor(() =>
			expect(slotsIn(skeleton, "list-skeleton-row")).toHaveLength(
				recentRows.length,
			),
		)

		const rowsAtFullHeight = recentRows.length
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
					"The list in the sidebar at its default width, light theme. Check that the second header bar sits after two rows with no group gap, that no two neighbours share their bar widths, and that the last row is cut by the bottom edge. Pick `Dark` for the dark theme.",
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
