import type { ComponentProps } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	probedStyleOf,
	slotIn,
	tokenLengthOf,
} from "@workspace/storybook/story-utils"
import { AppHeader } from "@workspace/ui/components/app-header"
import { ContentCard } from "@workspace/ui/components/content-card"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"
import { Button } from "@workspace/ui/components/ui/button"
import { SidebarProvider } from "@workspace/ui/components/ui/sidebar"

const WIDE_CARD = 1100

const COLUMN_CAP = 800

const CONTENT = (
	<p>
		Every screen of the app sits in this frame: the header bar on top, a column
		that scrolls under it, and an optional footer docked to the bottom of the
		card.
	</p>
)

const layoutIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "screen-layout")

const meta = preview.meta({
	title: "Layout/ScreenLayout",
	component: ScreenLayout,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The page frame every screen shares: a header slot rendered as given, a content column carrying the transcript padding, and a footer slot inset like the composer. The column is a plain scroll column by default; a screen that brings its own scroll container, as ThreadLayout does with Transcript, passes `scroller` and receives the column classes to put on its scrolled content. `width` picks the column: `full`, the default, spans the card; `column` caps it at 800px and centres it in a wider card.",
			},
		},
	},
	args: {
		header: <AppHeader leading="Settings" />,
	},
})

export const HeaderOnly = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a screen that has nothing to show under its header yet. Check that the header keeps its own height and border, that no wrapper sits between it and the frame, and that no footer is rendered.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const layout = layoutIn(canvasElement)
		const header = canvas.getByRole("banner")

		await expect(header.parentElement).toBe(layout)
		await expect(header.getBoundingClientRect().height).toBe(48)
		await expect(layout.children).toHaveLength(2)
		await expect(layout.lastElementChild).toBe(
			slotIn(canvasElement, "screen-layout-scroller"),
		)
	},
})

export const HeaderAndContent = meta.story({
	args: { children: CONTENT },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a screen whose content runs the full width of the card. Check that the column carries the transcript padding and spans the whole scroller.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const column = slotIn(canvasElement, "screen-layout-column")
		const scroller = slotIn(canvasElement, "screen-layout-scroller")
		const spacing = getComputedStyle(column)

		await expect(canvas.getByText(/Every screen of the app/)).toBeVisible()
		await expect(spacing.paddingInlineStart).toBe("24px")
		await expect(spacing.paddingInlineEnd).toBe("24px")
		await expect(spacing.paddingTop).toBe("32px")
		await expect(spacing.paddingBottom).toBe("16px")
		await expect(Math.round(column.getBoundingClientRect().width)).toBe(
			scroller.clientWidth,
		)
	},
})

export const HeaderContentAndFooter = meta.story({
	args: {
		children: CONTENT,
		footer: <Button onClick={fn()}>Save</Button>,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a screen with an action docked under its content. Check that the footer is the last region of the frame and sits one shell inset off the sides and the bottom, as the composer does.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const layout = layoutIn(canvasElement)
		const footer = canvas.getByRole("button", { name: "Save" }).parentElement
		const inset = tokenLengthOf("--shell-inset")

		await expect(footer).toBe(layout.lastElementChild)
		if (!footer) throw new globalThis.Error("The footer holds no button")
		const spacing = getComputedStyle(footer)
		await expect(spacing.paddingInlineStart).toBe(inset)
		await expect(spacing.paddingInlineEnd).toBe(inset)
		await expect(spacing.paddingBottom).toBe(inset)
	},
})

const inWideCard = (args: ComponentProps<typeof ScreenLayout>) => (
	<div style={{ inlineSize: WIDE_CARD }}>
		<SidebarProvider>
			<ContentCard isLandmark={false}>
				<ScreenLayout {...args} />
			</ContentCard>
		</SidebarProvider>
	</div>
)

const boxesIn = (canvasElement: HTMLElement) => {
	const card = canvasElement.querySelector<HTMLElement>("[data-content-card]")
	if (!card) throw new globalThis.Error("The layout sits in no card")

	return {
		card: card.getBoundingClientRect(),
		column: slotIn(
			canvasElement,
			"screen-layout-column",
		).getBoundingClientRect(),
		scroller: slotIn(canvasElement, "screen-layout-scroller"),
	}
}

export const ColumnWidthInWideCard = meta.story({
	args: { width: "column", children: CONTENT },
	render: inWideCard,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a form or reading page in a card wider than the column cap. Check that the column stops at 800px with equal room on both sides, and that the frame wears the card surface.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { card, column } = boxesIn(canvasElement)
		const leftGap = column.left - card.left
		const rightGap = card.right - column.right

		await expect(column.width).toBe(COLUMN_CAP)
		await expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(1)
		await expect(
			getComputedStyle(layoutIn(canvasElement)).backgroundColor,
		).toBe(probedStyleOf("bg-card", "backgroundColor"))
	},
})

export const FullWidthInWideCard = meta.story({
	args: { width: "full", children: CONTENT },
	render: inWideCard,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a list or grid page in a card wider than the column cap. Check that the column takes the whole width of the card, past the 800px cap of the column width.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { column, scroller } = boxesIn(canvasElement)

		await expect(Math.round(column.width)).toBe(scroller.clientWidth)
		await expect(column.width).toBeGreaterThan(COLUMN_CAP)
	},
})
