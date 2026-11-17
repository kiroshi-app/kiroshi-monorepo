import { expect, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import {
	LibraryCommentModeHint,
	type LibraryCommentModeHintProps,
} from "@workspace/ui/components/library-comment-mode-hint"
import { cn } from "@workspace/ui/lib/utils"

const expectInverted = async (canvasElement: HTMLElement) => {
	const hint = within(canvasElement).getByRole("status")
	const page = slotIn(canvasElement, "hint-page")
	const { color, backgroundColor } = getComputedStyle(hint)

	await expect(backgroundColor).toBe(getComputedStyle(page).color)
	await expect(color).not.toBe(backgroundColor)
	await expect(hint.querySelector("kbd")).toHaveTextContent("Esc")
}

const HINT_ARGS: LibraryCommentModeHintProps = { surface: "document" }

const PAGE = "flex w-140 max-w-full justify-center p-10 text-foreground"

const meta = preview.meta({
	title: "Navigation/LibraryCommentModeHint",
	component: LibraryCommentModeHint,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The pill at the bottom of a Library viewer while comment mode is on: what a click does there, then the key that leaves the mode. `surface` picks the sentence for a document, a board or an image. The pill takes the text colour of the surface it floats on, so it reads dark on a light document and light on a dark one and on the image viewer's stage.",
			},
		},
	},
	args: HINT_ARGS,
	render: (args) => (
		<div className={cn(PAGE, "bg-card")} data-slot="hint-page">
			<LibraryCommentModeHint {...args} />
		</div>
	),
})

export const Document = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Comment mode on a document, as artboard Doc 2 draws it. Check the sentence, the Esc key after it, and that the pill wears the text colour of the page under it.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(within(canvasElement).getByRole("status")).toHaveTextContent(
			"Click a block to comment, select text for a passage",
		)
		await expectInverted(canvasElement)
	},
})

export const DocumentDark = meta.story({
	globals: { theme: "dark" },
	play: Document.input.play,
})

export const Board = meta.story({
	args: { surface: "board" },
	parameters: {
		docs: {
			description: {
				story:
					"Comment mode on a board. Check the sentence names a shape and the board.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(within(canvasElement).getByRole("status")).toHaveTextContent(
			"Click a shape or the board to comment",
		)
		await expectInverted(canvasElement)
	},
})

export const BoardDark = meta.story({
	args: Board.input.args,
	globals: { theme: "dark" },
	play: Board.input.play,
})

export const Image = meta.story({
	args: { surface: "image" },
	parameters: {
		docs: {
			description: {
				story:
					"Comment mode on the image viewer, whose stage is dark in both themes, as artboard Img 2 draws it. Check the sentence names a point and a zone and the pill is light on the stage.",
			},
		},
	},
	render: (args) => (
		<div className={cn(PAGE, "dark bg-[#080809]")} data-slot="hint-page">
			<LibraryCommentModeHint {...args} />
		</div>
	),
	play: async ({ canvasElement }) => {
		await expect(within(canvasElement).getByRole("status")).toHaveTextContent(
			"Click for a point, drag for a zone",
		)
		await expectInverted(canvasElement)
	},
})

export const Narrow = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The document sentence in a 320 px viewer. Check it wraps inside the pill, Esc keeps its place, and nothing overflows sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const page = slotIn(canvasElement, "hint-page")
		page.style.width = "320px"
		const hint = within(canvasElement).getByRole("status")

		await expect(hint.scrollWidth).toBeLessThanOrEqual(hint.clientWidth)
		await expect(hint.getBoundingClientRect().right).toBeLessThanOrEqual(
			page.getBoundingClientRect().right,
		)
	},
})
