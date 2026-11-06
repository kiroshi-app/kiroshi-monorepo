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
	rowInlineStart: 6,
	rowInlineEnd: 12,
	avatar: 40,
	avatarGap: 10,
	nameCentre: 18,
	previewCentre: 36,
	previewLineTop: 28,
	badgeGap: 6,
	badgeHeight: 14,
	pileGap: 8,
	pileOfTwo: [24, 16],
	pileAvatar: 14,
	separatorHeight: 1,
	separatorInset: 6,
	separatorClearance: 8,
}

const boxOf = (element: Element) => element.getBoundingClientRect()

const centreOf = (element: Element) =>
	boxOf(element).top + boxOf(element).height / 2

const rowPartsOf = (row: Element) => {
	const [hexagon, title] = slotsIn(row, "skeleton")
	const nameLine = title.parentElement?.parentElement as HTMLElement
	const previewLine = nameLine.nextElementSibling as HTMLElement
	return {
		hexagon,
		title,
		badge: title.nextElementSibling,
		stamp: nameLine.lastElementChild as HTMLElement,
		preview: previewLine.firstElementChild as HTMLElement,
	}
}

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
					"The stand-in for the sidebar roster while it is on its way, drawn on the loaded roster: two pinned rows, the zone separator, then recent rows. Every row is a 40px hexagon beside a title, a time and a preview; agent rows add a title badge after the name, conversation rows an agent pile at the end of the preview. Rows sit 2px apart, the separator 8px from each zone, and bar widths turn over a cycle of six rows. It reads from the top and runs to the bottom of the list region, the last row cut by its edge. Only the list region waits: the panel header and the rail stay the loaded components.",
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
		const pinnedRows = Array.from(
			slotIn(skeleton, "sidebar-list-skeleton-pinned").children,
		)
		const separator = slotIn(skeleton, "roster-zone-separator")
		const recentRows = slotsIn(skeleton, "list-skeleton-row")
		const [agentRow, conversationRow] = recentRows

		await expect(skeleton).toHaveAttribute("aria-hidden", "true")
		await expect(pinnedRows).toHaveLength(2)
		await expect(boxOf(pinnedRows[1]).top - boxOf(pinnedRows[0]).bottom).toBe(
			LOADED.rowGap,
		)
		await expect(boxOf(separator).height).toBe(LOADED.separatorHeight)
		await expect(boxOf(separator).top - boxOf(pinnedRows[1]).bottom).toBe(
			LOADED.separatorClearance,
		)
		await expect(boxOf(recentRows[0]).top - boxOf(separator).bottom).toBe(
			LOADED.separatorClearance,
		)
		await expect(boxOf(separator).left - boxOf(skeleton).left).toBe(
			LOADED.separatorInset,
		)
		await expect(boxOf(skeleton).right - boxOf(separator).right).toBe(
			LOADED.separatorInset,
		)
		await expect(boxOf(recentRows[1]).top - boxOf(recentRows[0]).bottom).toBe(
			LOADED.rowGap,
		)

		for (const row of [...pinnedRows, ...recentRows.slice(0, 2)]) {
			const { hexagon, title, stamp, preview } = rowPartsOf(row)
			await expect(boxOf(row).height).toBe(LOADED.rowHeight)
			await expect(boxOf(hexagon).width).toBe(LOADED.avatar)
			await expect(boxOf(hexagon).left - boxOf(row).left).toBe(
				LOADED.rowInlineStart,
			)
			await expect(boxOf(title).left - boxOf(hexagon).right).toBe(
				LOADED.avatarGap,
			)
			await expect(centreOf(title) - boxOf(row).top).toBe(LOADED.nameCentre)
			await expect(centreOf(stamp) - boxOf(row).top).toBe(LOADED.nameCentre)
			await expect(boxOf(row).right - boxOf(stamp).right).toBe(
				LOADED.rowInlineEnd,
			)
			await expect(boxOf(preview).left).toBe(boxOf(title).left)
			await expect(centreOf(preview) - boxOf(row).top).toBe(
				LOADED.previewCentre,
			)
		}

		const { title: agentTitle, badge } = rowPartsOf(agentRow)
		await expect(boxOf(badge as Element).left - boxOf(agentTitle).right).toBe(
			LOADED.badgeGap,
		)
		await expect(boxOf(badge as Element).height).toBe(LOADED.badgeHeight)
		await expect(getComputedStyle(badge as Element).borderRadius).not.toBe(
			"0px",
		)
		await expect(rowPartsOf(conversationRow).badge).toBeNull()
		await expect(slotsIn(agentRow, "skeleton-agent-pile")).toHaveLength(0)

		const pile = slotIn(conversationRow, "skeleton-agent-pile")
		const { preview } = rowPartsOf(conversationRow)
		await expect([boxOf(pile).width, boxOf(pile).height]).toEqual(
			LOADED.pileOfTwo,
		)
		await expect(boxOf(conversationRow).right - boxOf(pile).right).toBe(
			LOADED.rowInlineEnd,
		)
		await expect(boxOf(pile).top - boxOf(conversationRow).top).toBe(
			LOADED.previewLineTop,
		)
		await expect(
			boxOf(pile).left - boxOf(preview).right,
		).toBeGreaterThanOrEqual(LOADED.pileGap)
		await expect(
			slotsIn(pile, "skeleton").map((hexagon) => boxOf(hexagon).width),
		).toEqual([LOADED.pileAvatar, LOADED.pileAvatar])

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
					"The list in the sidebar at its default width, light theme. Check that two pinned rows sit above the separator, that badges follow agent names and piles end conversation previews, that no two neighbours share their bar widths, and that the last row is cut by the bottom edge. Pick `Dark` for the dark theme.",
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
					"The same list in the dark theme. Check that the solid title bar and hexagons stay apart from the faint time, preview and badge bars, and that the separator stays visible against the dark sidebar. Pick `Light` for the light theme.",
			},
		},
	},
})
