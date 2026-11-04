import { expect, fireEvent, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	colourTransitionsOf,
	MarkdownProse,
	slotIn,
} from "@workspace/storybook/story-utils"
import {
	FileReferenceChip,
	type FileReferenceChipProps,
} from "@workspace/ui/components/file-reference-chip"

const TITLE = "Spring launch brief"

const LONG_TITLE =
	"Spring launch brief for every team shipping on the 14th, final copy"

const InSentence = (props: FileReferenceChipProps) => (
	<MarkdownProse>
		<p>
			I put the plan in <FileReferenceChip {...props} /> with the three messages
			every page repeats, then listed what still needs a sign-off.
		</p>
	</MarkdownProse>
)

const WHITE = "rgb(255, 255, 255)"

const chipIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "file-reference-chip")

const meta = preview.meta({
	title: "Conversation/Message/FileReferenceChip",
	component: FileReferenceChip,
	parameters: {
		docs: {
			description: {
				component:
					"A Library file the agent wrote, named inline in its message. A 24 tall pill with a 16 mark holding the document glyph and the title on one line, truncated at 220. `state` draws the three states the app sets: `rest`, `writing` while the agent still writes the file, `open` while its panel is open beside the thread. A click, Enter or Space calls `onOpen`; a middle click calls `onOpenInNewTab` alone. No colour transition.",
			},
		},
	},
	args: {
		title: TITLE,
		onOpen: fn(),
		onOpenInNewTab: fn(),
	},
	render: (args) => <InSentence {...args} />,
})

export const Rest = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The chip at rest inside a sentence of a message. Check that it sits in the line of text, the fill at foreground 6 percent, the mark circle on the card surface.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const chip = chipIn(canvasElement)
		const box = chip.getBoundingClientRect()

		await expect(getComputedStyle(chip).display).toBe("inline-flex")
		await expect(box.height).toBe(24)
		await expect(chip).toHaveAttribute("aria-pressed", "false")
		await expect(colourTransitionsOf(chip)).toEqual([])

		await userEvent.click(canvas.getByRole("button", { name: TITLE }))
		await expect(args.onOpen).toHaveBeenCalledOnce()
		await expect(args.onOpenInNewTab).not.toHaveBeenCalled()
	},
})

export const Hover = meta.story({
	parameters: {
		pseudo: { hover: '[data-slot="file-reference-chip"]' },
		docs: {
			description: {
				story:
					"The chip under the pointer, drawn by the pseudo-state addon. Check that the fill deepens to foreground 10 percent in a single frame.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(chipIn(canvasElement)).toHaveClass("hover:bg-foreground/10")
	},
})

export const Writing = meta.story({
	args: { state: "writing", title: LONG_TITLE },
	parameters: {
		docs: {
			description: {
				story:
					"The agent still writes the file. Check that the title truncates at 140 and that Writing… follows it in the muted regular weight.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const chip = chipIn(canvasElement)
		const title = slotIn(chip, "file-reference-chip-title")

		await expect(chip).toHaveAttribute("aria-busy", "true")
		await expect(canvas.getByText("Writing…")).toBeVisible()
		await expect(title.getBoundingClientRect().width).toBeLessThanOrEqual(140)
	},
})

export const Open = meta.story({
	args: { state: "open" },
	parameters: {
		docs: {
			description: {
				story:
					"The file open in the panel beside the thread. Check that the pill takes the Space colour, the title its foreground, and that the mark circle stays light with the glyph in the Space colour.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const chip = chipIn(canvasElement)
		const mark = chip.firstElementChild
		if (!mark) throw new Error("The chip draws no mark circle")

		await expect(
			canvas.getByRole("button", { name: TITLE, pressed: true }),
		).toBeVisible()
		await expect(getComputedStyle(mark).backgroundColor).toBe(WHITE)
		await expect(getComputedStyle(mark).color).toBe(
			getComputedStyle(chip).backgroundColor,
		)
	},
})

export const OpenDark = meta.story({
	globals: { theme: "dark" },
	args: Open.input.args,
	parameters: {
		docs: {
			description: {
				story:
					"The open chip in the dark theme. Check that the mark circle stays white on the Space colour fill with the glyph in the Space colour, as in light, and that the title keeps the dark theme foreground of the Space colour.",
			},
		},
	},
	play: Open.input.play,
})

export const OpensFromTheKeyboard = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The chip reached with Tab. Check that it draws the focus ring, and that Enter and Space each call `onOpen`.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const chip = chipIn(canvasElement)

		await userEvent.tab()
		await expect(chip).toHaveFocus()
		await expect(getComputedStyle(chip).outlineStyle).not.toBe("none")

		await userEvent.keyboard("{Enter}")
		await userEvent.keyboard(" ")
		await expect(args.onOpen).toHaveBeenCalledTimes(2)
	},
})

export const MiddleClickOpensANewTab = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"A middle click on the chip. Check that it calls `onOpenInNewTab` and never `onOpen`.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const chip = chipIn(canvasElement)

		fireEvent.mouseDown(chip, { button: 1 })
		fireEvent(
			chip,
			new MouseEvent("auxclick", { bubbles: true, button: 1, detail: 1 }),
		)

		await expect(args.onOpenInNewTab).toHaveBeenCalledOnce()
		await expect(args.onOpen).not.toHaveBeenCalled()
	},
})

export const WrapsWithTheSentence = meta.story({
	tags: ["test-only"],
	args: { title: LONG_TITLE },
	parameters: {
		docs: {
			description: {
				story:
					"The chip in a 320 column. Check that the sentence wraps around it as around a word and that the chip never overflows the column.",
			},
		},
	},
	render: (args) => (
		<div className="w-80">
			<InSentence {...args} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const chip = chipIn(canvasElement)
		const paragraph = chip.closest("p")
		if (!paragraph) throw new Error("The chip sits in no paragraph")

		await expect(chip.getBoundingClientRect().right).toBeLessThanOrEqual(
			paragraph.getBoundingClientRect().right,
		)
		await expect(paragraph.getBoundingClientRect().height).toBeGreaterThan(
			chip.getBoundingClientRect().height * 2,
		)
	},
})
