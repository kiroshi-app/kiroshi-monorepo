import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	type SkillFile,
	SkillFilesPanel,
	type SkillFilesPanelProps,
} from "@workspace/ui/components/plugin-settings/skill-files-panel"
import {
	SKILL_FILE_PATHS,
	SKILL_FILES,
} from "@workspace/ui/components/plugin-settings/skills.fixtures"

const [EXAMPLE, REFERENCE] = SKILL_FILE_PATHS

const FilesHost = (props: SkillFilesPanelProps) => {
	const [paths, setPaths] = useState(props.paths)
	const [opened, setOpened] = useState<SkillFile | null>(props.opened)

	const held = (path: string) => SKILL_FILES[path] ?? ""

	return (
		<SkillFilesPanel
			{...props}
			onAdd={(path) => {
				props.onAdd(path)
				setPaths([...paths, path].sort())
				setOpened({ path, text: "" })
			}}
			onClose={() => {
				props.onClose()
				setOpened(null)
			}}
			onDelete={(path) => {
				props.onDelete(path)
				setPaths(paths.filter((kept) => kept !== path))
				setOpened(null)
			}}
			onOpen={(path) => {
				props.onOpen(path)
				setOpened({ path, text: held(path) })
			}}
			onSave={(path, text) => {
				props.onSave(path, text)
				setOpened({ path, text })
			}}
			opened={opened}
			paths={paths}
		/>
	)
}

const meta = preview.meta({
	title: "Settings/Plugins/SkillFilesPanel",
	component: SkillFilesPanel,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"Everything a skill holds beside its own instructions — the reference, the examples and the scripts sitting in its directory — listed by the path each one is read from. It is one section of the skill editor and it takes two shapes: the list, with a field to name a new file, and one file open in an editor of its own. Nothing is written as it is typed: the file editor says when it differs from what is on the disk, the save is a press, and a read, a save or a delete that fails leaves what the reader typed exactly where it was and says so above it.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex h-[28rem] w-[36rem] flex-col gap-4 p-5">
				<Story />
			</div>
		),
	],
	render: (args) => <FilesHost {...args} />,
	args: {
		paths: SKILL_FILE_PATHS,
		opened: null,
		onOpen: fn(),
		onClose: fn(),
		onAdd: fn(),
		onSave: fn(),
		onDelete: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The files a written skill already holds. Check that each row reads as the path it is written at rather than a bare filename — two files named `index.md` in different folders are told apart only by what precedes them — and that taking a row opens that file rather than reporting it somewhere else.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: EXAMPLE }))

		await expect(args.onOpen).toHaveBeenCalledWith(EXAMPLE)
		await expect(canvas.getByLabelText("Contents")).toHaveValue(
			SKILL_FILES[EXAMPLE],
		)
	},
})

export const Empty = meta.story({
	args: { paths: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A skill that is only its own instructions. Check that nothing stands in for the list — no empty box, no placeholder row — and that the way to add the first file is the same field that adds the tenth. Pressing the action with no path marks the field invalid with its error and puts focus in it.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.queryByRole("list")).toBe(null)

		const add = canvas.getByRole("button", { name: "Add file" })
		const path = canvas.getByLabelText("New file")
		await userEvent.click(add)
		await expect(args.onAdd).not.toHaveBeenCalled()
		await expect(canvas.getByRole("alert")).toHaveTextContent(
			"A file needs a path.",
		)
		await expect(path).toHaveAttribute("aria-invalid", "true")
		await expect(path).toHaveAccessibleDescription(/A file needs a path\./)
		await expect(path).toHaveFocus()

		await userEvent.type(canvas.getByLabelText("New file"), "reference/api.md")
		await userEvent.click(add)

		await expect(args.onAdd).toHaveBeenCalledWith("reference/api.md")
		await expect(canvas.getByLabelText("Contents")).toHaveValue("")
	},
})

export const Opened = meta.story({
	args: { opened: { path: REFERENCE, text: SKILL_FILES[REFERENCE] } },
	parameters: {
		docs: {
			description: {
				story:
					"One file open, on the text it holds on the disk. Check that the save sends nothing until something is typed, that the unsaved mark comes up beside the path at the same moment, and that the way back is a press away without a question — the file's text is only ever written by the save.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const save = canvas.getByRole("button", { name: "Save file" })

		await userEvent.click(save)
		await expect(args.onSave).not.toHaveBeenCalled()
		await userEvent.type(canvas.getByLabelText("Contents"), " Nothing else.")

		await expect(save).toBeEnabled()
		await expect(canvas.getByText("Unsaved changes")).toBeVisible()

		await userEvent.click(save)
		await expect(args.onSave).toHaveBeenCalledTimes(1)
	},
})

export const Loading = meta.story({
	args: { opened: { path: REFERENCE } },
	parameters: {
		docs: {
			description: {
				story:
					"A file taken while its text is still on its way. Check that the path is already up and the way back already works — waiting for a read never traps the reader in the file they picked.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Loading file…")).toBeVisible()
	},
})

export const UnreadableFile = meta.story({
	args: { opened: { path: REFERENCE, failure: "read" } },
	parameters: {
		docs: {
			description: {
				story:
					"A file the host would not read. Check that the failure is said in words rather than left as an empty editor, and that trying again asks for the same file rather than sending the reader back to the list.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Try again" }))

		await expect(args.onOpen).toHaveBeenCalledWith(REFERENCE)
	},
})

export const RefusedSave = meta.story({
	args: {
		opened: {
			path: REFERENCE,
			text: SKILL_FILES[REFERENCE],
			failure: "write",
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A save the host refused. Check the one thing that matters here: the text is still on screen, above it the reason, and the save is still there to be pressed again. Nothing typed is dropped to make room for the message.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("alert")).toBeVisible()
		await expect(canvas.getByLabelText("Contents")).toHaveValue(
			SKILL_FILES[REFERENCE],
		)
	},
})

export const RefusedDelete = meta.story({
	args: {
		opened: {
			path: REFERENCE,
			text: SKILL_FILES[REFERENCE],
			failure: "delete",
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A delete the host refused, which is what the controller reports when the file could not be removed. Check that the file is still open on its text rather than closed on a list it never left, that the reason is said above the editor, and that the delete is still there to be asked again. `RefusedSave` is the same surface for a write, `WithConfirmation` the delete that went through.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("alert")).toHaveTextContent(
			"Couldn’t delete this file. Retry.",
		)
		await expect(canvas.getByLabelText("Contents")).toHaveValue(
			SKILL_FILES[REFERENCE],
		)
		await expect(
			canvas.getByRole("button", { name: "Delete file" }),
		).toBeEnabled()
	},
})

export const WithConfirmation = meta.story({
	args: { opened: { path: REFERENCE, text: SKILL_FILES[REFERENCE] } },
	parameters: {
		docs: {
			description: {
				story:
					"The delete, taken from an open file. Check that the question names the path rather than saying “this file”, and that accepting takes it out of the list and puts the reader back on the list rather than on a file that no longer exists.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Delete file" }))

		const popup = await screen.findByRole("alertdialog")
		await waitFor(() => expect(popup).toBeVisible())
		await expect(popup).toHaveTextContent(`Delete ${REFERENCE}?`)

		await userEvent.click(
			within(popup).getByRole("button", { name: "Delete file" }),
		)

		await expect(args.onDelete).toHaveBeenCalledWith(REFERENCE)
		await waitFor(() =>
			expect(canvas.queryByRole("button", { name: REFERENCE })).toBe(null),
		)
	},
})
