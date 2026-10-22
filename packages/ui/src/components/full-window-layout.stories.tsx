import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { expectCentredInWindow, slotIn } from "@workspace/storybook/story-utils"
import {
	FullWindowContent,
	FullWindowLayout,
} from "@workspace/ui/components/full-window-layout"

const TALL_ROWS = Array.from({ length: 12 }, (_, row) => `row-${row}`)

const meta = preview.meta({
	title: "Layout/FullWindowLayout",
	component: FullWindowLayout,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The surface every full-window account screen renders through: the boot screen, the boot notice and the new device screen. It sizes itself to the window height, so its content block stays centred in both axes whatever element mounts it, even an unsized root. Put one `FullWindowContent` inside it: the screen sets the gap and padding of that block. Reach for it only for a screen that takes the whole window with no shell around it.",
			},
		},
	},
})

export const Default = meta.story({
	render: () => (
		<FullWindowLayout>
			<FullWindowContent className="gap-6 p-6">
				<div className="size-24 rounded-xl bg-muted" />
				<div className="h-32 w-full max-w-sm rounded-xl bg-muted" />
			</FullWindowContent>
		</FullWindowLayout>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A content block shorter than the window. Check that the surface is exactly the window tall and that the block sits with as much space above it as below it, centred across the width too. Pick `TallerThanTheWindow` for a block that cannot fit.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const layout = slotIn(canvasElement, "full-window-layout")

		await expect(layout.clientHeight).toBe(window.innerHeight)
		await expectCentredInWindow(canvasElement)
	},
})

export const TallerThanTheWindow = meta.story({
	render: () => (
		<FullWindowLayout>
			<FullWindowContent className="gap-6 p-6">
				{TALL_ROWS.map((row) => (
					<div className="h-32 w-full max-w-sm rounded-xl bg-muted" key={row} />
				))}
			</FullWindowContent>
		</FullWindowLayout>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A content block taller than the window, the new device screen on a short laptop at 200 percent zoom. Check that the block starts at the top edge of the window rather than above it, and that the surface scrolls to its last row. Pick `Default` for a block that fits.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const layout = slotIn(canvasElement, "full-window-layout")
		const block = slotIn(canvasElement, "full-window-content")

		await expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight)
		await expect(block.getBoundingClientRect().top).toBe(
			layout.getBoundingClientRect().top,
		)

		layout.scrollTop = layout.scrollHeight

		await expect(block.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			window.innerHeight,
		)
	},
})
