import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { BLANK_SKILL_DRAFT } from "@workspace/ui/components/bot-settings"
import {
	SkillEditor,
	type SkillEditorProps,
} from "@workspace/ui/components/plugin-settings/skill-editor"
import {
	BOT_SKILLS,
	DETAILED_SKILL,
	LONG_SKILL,
	OVER_BUDGET_SKILL,
	SKILL_FILE_PATHS,
	SKILL_FILES,
	SYSTEM_SKILL,
} from "@workspace/ui/components/plugin-settings/skills.fixtures"

const [CARRIED] = BOT_SKILLS

const EditorHost = (props: SkillEditorProps) => {
	const [draft, setDraft] = useState(props.draft)

	return (
		<SkillEditor
			{...props}
			draft={draft}
			onDraftChange={(next) => {
				setDraft(next)
				props.onDraftChange(next)
			}}
		/>
	)
}

const meta = preview.meta({
	title: "Settings/Plugins/SkillEditor",
	component: SkillEditor,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"One skill of a companion's, whole, on the whole dialog: a rail of sections down the left and one section at a time on the right. The rail replaces the companion's own while a skill is open and is the summary — Instructions, Triggering, Execution, Tools, Advanced — so a reader sees at once everything a skill can carry rather than three fields and a format they have to know about. Nothing is written as it is typed: every keystroke reports the draft, the editor says when it differs from the skill it was opened on, the save is a press and the way out asks before it drops anything. The description and when to use are budgeted as one paragraph against 1536 characters, because that is how the companion reads them.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex h-[34rem] w-[52rem] overflow-hidden rounded-2xl border border-border">
				<Story />
			</div>
		),
	],
	render: (args) => <EditorHost {...args} />,
	args: {
		draft: DETAILED_SKILL,
		saved: DETAILED_SKILL,
		onDraftChange: fn(),
		onBack: fn(),
		onSave: fn(),
		onDelete: fn(),
	},
	argTypes: {
		defaultSection: { control: false },
		defaultConfirming: { control: false },
		defaultLeaving: { control: false },
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A skill that already exists, opened on what it tells the companion to do. Check that the body takes the height the two fields under it leave, that the save stays enabled and still saves while nothing has been typed, and that typing raises the unsaved mark beside the name. Reach for a section story below to review one group of fields on its own.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const save = canvas.getByRole("button", { name: "Save skill" })

		await expect(save).toBeEnabled()
		await userEvent.click(save)
		await expect(args.onSave).toHaveBeenCalledTimes(1)
		await userEvent.type(canvas.getByLabelText("Body"), " Nothing else.")

		await expect(args.onDraftChange).toHaveBeenCalled()
		await expect(save).toBeEnabled()
		await expect(canvas.getByText("Unsaved changes")).toBeVisible()

		await userEvent.click(save)
		await expect(args.onSave).toHaveBeenCalledTimes(2)
	},
})

export const Triggering = meta.story({
	args: { defaultSection: "triggering" },
	parameters: {
		docs: {
			description: {
				story:
					"Everything that decides whether the companion reaches for the skill at all: its name, the description, when to use it, who may invoke it, the paths that make it worth reading and whether it travels in every prompt. Check that the description and when to use are counted together under the second field — the companion reads them as one paragraph, so they share one budget. Pick `OverBudget` for the state where that budget is spent.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const name = canvas.getByLabelText("Name")

		await userEvent.clear(name)
		await userEvent.type(name, "Release Notes!")
		await expect(name).toHaveValue("release-notes-")
		await expect(canvas.getByText(/of 1536 characters/)).toBeVisible()
	},
})

export const OverBudget = meta.story({
	args: {
		defaultSection: "triggering",
		draft: OVER_BUDGET_SKILL,
		saved: OVER_BUDGET_SKILL,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A description and a when to use that together run past the 1536 characters they share. Check that the field is marked invalid and says by how much rather than truncating anything, and that pressing save sends nothing and puts focus in that field until one of the two is shortened, because the file would be refused as it stands. Pick `Triggering` for the same section inside its budget.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(
			canvas.getByText(/characters over\. Shorten either field to save\./),
		).toBeVisible()
		await userEvent.click(canvas.getByRole("button", { name: "Save skill" }))
		await expect(args.onSave).not.toHaveBeenCalled()
		await expect(canvas.getByLabelText("When to use")).toHaveFocus()
	},
})

export const Execution = meta.story({
	args: {
		defaultSection: "execution",
		draft: { ...DETAILED_SKILL, context: undefined },
		saved: { ...DETAILED_SKILL, context: undefined },
	},
	parameters: {
		docs: {
			description: {
				story:
					"What the skill's turn runs on, in the conversation it was reached from: a model, an effort, a context and a shell. Check that no agent and no background switch stand here — a run sharing the conversation has no runner of its own to hand anything to. Pick `ForkedExecution` for the context where both appear.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByLabelText("Agent")).toBe(null)
		await expect(canvas.queryByText("Run in the background")).toBe(null)
	},
})

export const ForkedExecution = meta.story({
	args: { defaultSection: "execution" },
	parameters: {
		docs: {
			description: {
				story:
					"The same section once the context is a fork. Check that the agent and the background switch appear under the context that gives them a meaning, and that they leave again the moment it goes back to the shared conversation — with their answers, not just their fields: a value saved from behind a section that no longer shows it is worse than no value at all.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByLabelText("Agent")).toBeVisible()
		await expect(canvas.getByText("Run in the background")).toBeVisible()

		await userEvent.click(canvas.getByRole("combobox", { name: "Context" }))
		await userEvent.click(await screen.findByRole("option", { name: "Shared" }))

		await expect(canvas.queryByLabelText("Agent")).toBe(null)
		await expect(args.onDraftChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ agent: undefined, isBackground: undefined }),
		)
	},
})

export const Tools = meta.story({
	args: { defaultSection: "tools" },
	parameters: {
		docs: {
			description: {
				story:
					"What the skill's turn may reach for, and what runs around it. Check that the two tool lists read as lists — one name a line — and that the hooks field is tall enough to hold a real object without scrolling on the first line.",
			},
		},
	},
})

export const Advanced = meta.story({
	args: { defaultSection: "advanced" },
	parameters: {
		docs: {
			description: {
				story:
					"What the bundle carries around the skill rather than in it: a license, what it needs of the runtime, and the metadata nothing here reads. Reach for this to check that metadata is presented as kept-as-is rather than as something the editor understands.",
			},
		},
	},
})

export const System = meta.story({
	args: { draft: SYSTEM_SKILL, isSystem: true, saved: SYSTEM_SKILL },
	parameters: {
		docs: {
			description: {
				story:
					"A skill the host wrote, opened. Check that the rail of sections is gone — there is no frontmatter for a reader to answer — that the name, the description and the body are readable and selectable but refuse a keystroke, and that no save, no delete and no preload switch stand anywhere on the surface. The sentence above the fields is the whole explanation: what it says is decided where it is generated. The way back is the only control left.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const body = canvas.getByLabelText("Body")

		await expect(body).toHaveAttribute("readonly")
		await userEvent.type(body, "!")
		await expect(args.onDraftChange).not.toHaveBeenCalled()

		await expect(
			canvas.queryByRole("button", { name: "Save skill" }),
		).toBeNull()
		await expect(
			canvas.queryByRole("button", { name: "Delete skill" }),
		).toBeNull()
		await expect(canvas.queryByText("Preload this skill")).toBeNull()

		await userEvent.click(canvas.getByRole("button", { name: "All skills" }))
		await expect(args.onBack).toHaveBeenCalledTimes(1)
	},
})

export const Empty = meta.story({
	args: {
		draft: BLANK_SKILL_DRAFT,
		saved: undefined,
		onDelete: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A skill nobody has written yet. Reach for this over `Default` to review what a reader is asked for before anything exists: the same rail and the same sections, a save named as a creation, and no delete — there is nothing kept to take away. The marks stand where a file that says nothing about them stands, so a skill is invocable by hand from the moment it is created. Pressing the action before the skill is named opens Triggering, marks the name invalid with its error and puts focus in it, and leaving reports nothing.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const create = canvas.getByRole("button", { name: "Add skill" })

		await userEvent.click(create)
		await expect(args.onSave).not.toHaveBeenCalled()
		const name = await canvas.findByLabelText("Name")
		await expect(name).toHaveAttribute("aria-invalid", "true")
		await expect(name).toHaveAccessibleDescription(/A skill needs a name\./)
		await expect(name).toHaveFocus()
		await expect(canvas.getByRole("alert")).toHaveTextContent(
			"A skill needs a name.",
		)
		await expect(canvas.queryByRole("button", { name: "Delete skill" })).toBe(
			null,
		)

		await userEvent.click(canvas.getByRole("tab", { name: "Triggering" }))
		await expect(
			canvas.getByRole("switch", { name: "Let you invoke it" }),
		).toBeChecked()
		await expect(
			canvas.getByRole("switch", {
				name: "Keep the agent from reaching for it",
			}),
		).not.toBeChecked()

		await userEvent.type(canvas.getByLabelText("Name"), "release-notes")
		await expect(create).toBeEnabled()

		await userEvent.click(create)
		await expect(args.onSave).toHaveBeenCalledTimes(1)
	},
})

export const ZeroValue = meta.story({
	args: { draft: CARRIED, saved: CARRIED },
	parameters: {
		docs: {
			description: {
				story:
					"A skill that exists and answers only the three fields a skill must answer — every frontmatter field left unset. Not the same as `Empty`, which is a skill that was never written. Check that each section still reads as a set of questions with placeholders rather than as a broken form, and that the save stays disabled: nothing has moved.",
			},
		},
	},
})

export const LongContent = meta.story({
	args: { draft: LONG_SKILL, saved: LONG_SKILL },
	parameters: {
		docs: {
			description: {
				story:
					"A runbook long enough to overflow its field several times over, under a name that wraps. Check that only the body scrolls, that the rail and the header hold still, and that the name in the header truncates rather than pushing the save off the row.",
			},
		},
	},
})

export const WithLeaving = meta.story({
	args: { defaultLeaving: true },
	parameters: {
		docs: {
			description: {
				story:
					"The way out taken while something is unsaved, mounted with its question already up. It says what goes and what is left as it was before anything is dropped. Check that cancelling leaves the draft exactly as it was and reports nothing, and that accepting fires `onBack` once. A draft with nothing in it goes straight back without asking.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await screen.findByRole("alertdialog")
		await waitFor(() => expect(popup).toBeVisible())

		await userEvent.click(within(popup).getByRole("button", { name: "Leave" }))

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onBack).toHaveBeenCalledTimes(1)
	},
})

export const WithConfirmation = meta.story({
	args: { defaultConfirming: true },
	parameters: {
		docs: {
			description: {
				story:
					"The delete, mounted with its question already up. It names the skill and states what goes with it before anything is reported. Check that cancelling leaves the editor exactly as it was, and that accepting fires `onDelete` once.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await screen.findByRole("alertdialog")
		await waitFor(() => expect(popup).toBeVisible())

		await expect(popup).toHaveTextContent(`Delete ${DETAILED_SKILL.name}?`)
		await userEvent.click(
			within(popup).getByRole("button", { name: "Delete skill" }),
		)

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onDelete).toHaveBeenCalledTimes(1)
	},
})

export const Files = meta.story({
	args: {
		defaultSection: "files",
		files: {
			paths: SKILL_FILE_PATHS,
			opened: null,
			onOpen: fn(),
			onClose: fn(),
			onAdd: fn(),
			onSave: fn(),
			onDelete: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A skill that holds more than its own instructions, opened on its directory. The section only exists for a host that passed the files group — a skill kept nowhere but in this dialog gets one rail entry fewer rather than an empty one. Check that the skill's own header, name and save stay exactly where they are while a file is picked underneath them: opening a file is a move inside the skill, not out of it. Pick `SkillFilesPanel` for the states the section itself takes.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const [example] = SKILL_FILE_PATHS

		await userEvent.click(canvas.getByRole("button", { name: example }))

		await expect(args.files?.onOpen).toHaveBeenCalledWith(example)
		await expect(
			canvas.getByRole("button", { name: "Save skill" }),
		).toBeVisible()
	},
})

export const FileOpened = meta.story({
	args: {
		defaultSection: "files",
		files: {
			paths: SKILL_FILE_PATHS,
			opened: {
				path: SKILL_FILE_PATHS[1],
				text: SKILL_FILES[SKILL_FILE_PATHS[1]],
			},
			onOpen: fn(),
			onClose: fn(),
			onAdd: fn(),
			onSave: fn(),
			onDelete: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"One of those files open, on the whole width the sections have. Check that the file's own header sits under the skill's rather than replacing it, that the contents take the height the section leaves, and that the two saves are told apart by name — one writes the skill, the other writes the file.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByLabelText("Contents")).toHaveValue(
			SKILL_FILES[SKILL_FILE_PATHS[1]],
		)
		await expect(
			canvas.getByRole("button", { name: "Save file" }),
		).toBeVisible()
	},
})
