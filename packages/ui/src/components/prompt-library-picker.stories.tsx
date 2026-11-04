import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf } from "@workspace/storybook/story-utils"
import {
	type LibraryPickerDocument,
	PromptLibraryPicker,
} from "@workspace/ui/components/prompt-library-picker"

const DOCUMENTS: LibraryPickerDocument[] = [
	{
		id: "brief",
		name: "Spring launch brief",
		detail: "Edited today · 1,240 words",
	},
	{
		id: "notes",
		name: "Meeting notes, 2 November",
		detail: "Edited yesterday · 640 words",
	},
	{
		id: "research",
		name: "Onboarding research",
		detail: "Edited last week · 2,310 words",
	},
	{ id: "untitled", name: "", detail: "Created on 28 October · 0 words" },
]

const meta = preview.meta({
	title: "Conversation/Prompt/PromptLibraryPicker",
	component: PromptLibraryPicker,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The attach button of the composer, opening a picker over the Library's documents. The search field filters the rows; the arrow keys move the highlighted row, which shows a return-key hint, and Enter picks it through `onPick`. The footer opens the file chooser and hands the chosen files to `onAttach`. Built on the Base UI Combobox.",
			},
		},
	},
	args: { documents: DOCUMENTS, onPick: fn(), onAttach: fn() },
	render: (args) => (
		<div className="flex h-120 w-140 items-end p-6" {...hueScopeOf("blue")}>
			<PromptLibraryPicker {...args} />
		</div>
	),
})

export const HighlightedRow = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The picker open above the attach button, the second row highlighted by the arrow keys, as artboard 2a draws it. Check the search field, the Documents label, the return-key hint drawn only on the highlighted row, and the footer. Pick `PicksOnEnter` for the pick itself.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("combobox", { name: "Attach files" }),
		)
		const search = await screen.findByRole("combobox", {
			name: "Search documents",
		})
		await waitFor(() => expect(search).toHaveFocus())

		const options = screen.getAllByRole("option")
		await expect(options).toHaveLength(DOCUMENTS.length)
		await expect(options[0]).not.toHaveAttribute("data-highlighted")
		await userEvent.keyboard("{ArrowDown}")
		await expect(options[0]).toHaveAttribute("data-highlighted")
		await userEvent.keyboard("{ArrowDown}")
		await expect(options[1]).toHaveAttribute("data-highlighted")
		await expect(options[0]).not.toHaveAttribute("data-highlighted")

		const hintOf = (option: HTMLElement) =>
			option.querySelector<HTMLElement>(
				'[data-slot="prompt-library-picker-hint"]',
			)
		await expect(hintOf(options[1])).toBeVisible()
		await expect(hintOf(options[0])).not.toBeVisible()
		await expect(within(options[3]).getByText("Untitled")).toBeVisible()
		await expect(
			screen.getByRole("button", { name: "Attach files from this computer" }),
		).toBeVisible()
	},
})

export const PicksOnEnter = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A query typed in the search field, then Enter. Check that the rows narrow to the one document matching the query, that Enter picks it through `onPick` and that the picker closes. Pick `HighlightedRow` for the arrow keys.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("combobox", { name: "Attach files" }),
		)
		const search = await screen.findByRole("combobox", {
			name: "Search documents",
		})
		await userEvent.type(search, "notes")
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1))
		await userEvent.keyboard("{Enter}")
		await expect(args.onPick).toHaveBeenCalledWith(DOCUMENTS[1])
		await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
	},
})

export const ReachesFilesByKeyboard = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The picker opened, then Tab from the search field and Enter. Check that Tab lands on Attach files from this computer with the picker still open, and that Enter opens the file chooser and closes the picker. Pick `HighlightedRow` for the documents.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const chooser =
			canvasElement.querySelector<HTMLInputElement>('input[type="file"]')
		if (!chooser) throw new Error("No file chooser drawn")
		const chooserOpened = fn()
		chooser.addEventListener("click", (event) => {
			event.preventDefault()
			chooserOpened()
		})

		await userEvent.click(
			canvas.getByRole("combobox", { name: "Attach files" }),
		)
		const search = await screen.findByRole("combobox", {
			name: "Search documents",
		})
		await waitFor(() => expect(search).toHaveFocus())

		await userEvent.tab()
		const files = screen.getByRole("button", {
			name: "Attach files from this computer",
		})
		await expect(files).toHaveFocus()
		await expect(screen.getByRole("listbox")).toBeVisible()

		await userEvent.keyboard("{Enter}")
		await expect(chooserOpened).toHaveBeenCalledOnce()
		await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
	},
})
