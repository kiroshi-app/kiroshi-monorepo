import { useState } from "react"
import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { PromptAttachButton } from "@workspace/ui/components/prompt-attach-button"
import { PromptAttachments } from "@workspace/ui/components/prompt-attachments"
import {
	LONG_PROMPT_ATTACHMENTS,
	PROMPT_ATTACHMENTS,
} from "@workspace/ui/components/prompt-attachments.fixtures"
import { PromptInput } from "@workspace/ui/components/prompt-input"

const attach = fn()

const StagedComposer = () => {
	const [items, setItems] = useState(PROMPT_ATTACHMENTS)

	const remove = (id: string) =>
		setItems((staged) => staged.filter((item) => item.id !== id))

	return (
		<PromptInput
			aria-label="Message"
			defaultValue="Compare these two against the spec"
			leading={<PromptAttachButton onAttach={attach} />}
			attachments={<PromptAttachments items={items} onRemove={remove} />}
		/>
	)
}

const meta = preview.meta({
	title: "Conversation/Prompt/PromptAttachments",
	component: PromptAttachments,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The files staged for the next prompt, one chip each, sitting inside the composer above the text. A chip shows what the file is — its own picture when the host could preview it, a file glyph otherwise — its name and its size, and carries the one control that takes it back. It draws only: the host owns the list, and reading or sending a file is never this row's business. An empty list renders nothing at all, so the composer keeps its resting pill.",
			},
		},
	},
	args: { items: PROMPT_ATTACHMENTS, onRemove: fn() },
	decorators: [
		(Story) => (
			<div className="w-[34rem] max-w-full">
				<Story />
			</div>
		),
	],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal row: a document and a picture, the two kinds a chip ever renders. Check that the picture is its own thumbnail while the document falls back to the file glyph, that both chips keep the same height and that pressing a remove control reports that chip's id rather than its index — the host removes by id, so a stale index would drop the wrong file. `LongContent` covers a row long enough to wrap. `apps/app/src/components/thread-composer.tsx:119` fills the row with the files staged for the next prompt.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(
			canvas.getByRole("list", { name: "Attachments" }),
		).toBeVisible()
		await expect(canvas.getByText("4.1 KB")).toBeVisible()
		await expect(canvas.getByText("180 KB")).toBeVisible()

		await userEvent.click(
			canvas.getByRole("button", { name: "Remove composer-empty.png" }),
		)
		await expect(args.onRemove).toHaveBeenCalledWith("screenshot")
	},
})

export const LongContent = meta.story({
	args: { items: LONG_PROMPT_ATTACHMENTS },
	parameters: {
		docs: {
			description: {
				story:
					"More files than fit on one line, one of them named far past the width of a chip. Check that the row wraps into a second line instead of scrolling or squeezing, that a long name truncates while its size and remove control stay put, and that the chips keep their reading order. Reach for it when changing chip padding or the row gap — this is where the composer runs out of width first. `apps/app/src/components/thread-composer.tsx:119` fills the row with the files staged for the next prompt.",
			},
		},
	},
	play: async ({ canvas }) => {
		const chips = canvas.getAllByRole("listitem")
		const [first] = chips

		await expect(chips).toHaveLength(LONG_PROMPT_ATTACHMENTS.length)
		await expect(
			chips[chips.length - 1].getBoundingClientRect().top,
		).toBeGreaterThan(first.getBoundingClientRect().bottom)
	},
})

export const Empty = meta.story({
	args: { items: [] },
	parameters: {
		docs: {
			description: {
				story:
					"Nothing staged — the state the composer sits in for most of a session. Check that the row renders no element at all rather than an empty box: the composer measures this row to decide whether it stays a pill, so a zero-height list would still cost it a gap. `Default` covers the first file landing in it. `apps/app/src/components/thread-composer.tsx:119` fills the row with the files staged for the next prompt.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("list")).not.toBeInTheDocument()
	},
})

export const InComposer = meta.story({
	render: () => <StagedComposer />,
	parameters: {
		docs: {
			description: {
				story:
					"The row in its only host, with the attach button in the composer's `leading` slot. Check that the chips sit inside the composer above the text rather than over or under it, that the text keeps one row beside the add and send buttons while a chip is staged, and that removing the last chip leaves the pill as it was. Removal is live here, so the row can be emptied by hand. `apps/app/src/components/thread-composer.tsx:117` is the composer this row sits in, with the attach button of `apps/app/src/components/thread-composer.tsx:127` beside it.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const composer = canvas.getByRole("textbox", { name: "Message" })
		const form = composer.closest("form")

		await expect(form?.dataset.expanded).toBe("false")
		await expect(
			canvas.getByRole("button", { name: "Attach files" }),
		).toBeEnabled()

		for (const item of PROMPT_ATTACHMENTS) {
			await userEvent.click(
				canvas.getByRole("button", { name: `Remove ${item.name}` }),
			)
		}

		await expect(canvas.queryByRole("list")).not.toBeInTheDocument()
		await waitFor(() => expect(form?.dataset.expanded).toBe("false"))
	},
})
