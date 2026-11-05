import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { AttachmentChip } from "@workspace/ui/components/attachment-chip"

const meta = preview.meta({
	title: "Conversation/Message/AttachmentChip",
	component: AttachmentChip,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The file chip a stored file wears: a glyph, its name and its extension. The attachments row lays it out as a block in its wrapping list; a Markdown answer citing a file sets it `isInline`, inside the sentence. Activating it calls `onOpen`: opening the file is never the chip's business.",
			},
		},
	},
	args: { name: "release-notes.md", extension: "MD", onOpen: fn() },
})

export const Default = meta.story({
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Open release-notes.md" }),
		)
		await expect(args.onOpen).toHaveBeenCalledOnce()
	},
})

export const LongName = meta.story({
	args: {
		name: "release-notes-for-the-desktop-shell-and-the-chat-surface.md",
	},
	play: async ({ canvas }) => {
		const chip = canvas.getByRole("button")
		await expect(chip.getBoundingClientRect().width).toBeLessThanOrEqual(224)
	},
})

export const Inline = meta.story({
	args: { name: "the Q3 report", extension: "PDF", isInline: true },
	render: (args) => (
		<p className="w-96 text-sm leading-6">
			I went through <AttachmentChip {...args} /> and the revenue line matches
			the ledger.
		</p>
	),
	play: async ({ canvas }) => {
		const chip = canvas.getByRole("button", { name: "Open the Q3 report" })
		await expect(getComputedStyle(chip).display).toBe("inline-flex")
	},
})
