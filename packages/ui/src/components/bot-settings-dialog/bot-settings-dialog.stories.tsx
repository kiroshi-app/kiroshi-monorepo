import { useState } from "react"
import {
	expect,
	fn,
	screen,
	type userEvent,
	waitFor,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	pictureOf,
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
	widthInRems,
} from "@workspace/storybook/story-utils"
import {
	BLANK_BOT_PERMISSIONS,
	DEFAULT_BOT_OUTPUT_STYLE,
} from "@workspace/ui/components/bot-settings"
import {
	type BotModelOption,
	BotSettingsDialog,
	type BotSettingsDialogProps,
	type BotSettingsValue,
} from "@workspace/ui/components/bot-settings-dialog"
import { BOT_MCP_SERVERS } from "@workspace/ui/components/bot-settings-dialog/mcp-servers.fixtures"
import { BOT_MEMORY } from "@workspace/ui/components/bot-settings-dialog/memory.fixtures"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { BOT_ENVIRONMENT } from "@workspace/ui/components/environment.fixtures"
import {
	HISTORY_DAYS,
	HISTORY_OLDEST_DATE,
	MANY_CHANGE_FILES,
} from "@workspace/ui/components/plugin-settings/history.fixtures"
import {
	BOT_SKILLS,
	LONG_SKILL,
} from "@workspace/ui/components/plugin-settings/skills.fixtures"

const BOT_ID = "bot-7"

const DIALOG_WIDTH_REMS = 52

const MODELS: BotModelOption[] = [
	{
		label: "Claude Sonnet 4.5",
		value: "sonnet-4-5",
		supportedEfforts: ["low", "medium", "high"],
	},
	{
		label: "Claude Opus 4.1",
		value: "opus-4-1",
		supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
	},
	{ label: "Claude Haiku 4.5", value: "haiku-4-5", supportedEfforts: [] },
]

const FILLED_BOT: BotSettingsValue = {
	identity: { blot: BLOT_HUES.blue },
	name: "Nest Keeper",
	title: "Repository archivist",
	instructions:
		"You are the Nest Keeper.\n\nEvery visual belongs to packages/ui. The app composes, it never draws.\n\nBefore proposing a component, search the package for one that already does the job. Answer with the file you would touch, then the change.",
	model: "sonnet-4-5",
	effort: "high",
	permissions: {
		...BLANK_BOT_PERMISSIONS,
		deny: ["Bash", "Edit", "Write", "NotebookEdit"],
	},
}

const NEW_BOT: BotSettingsValue = {
	identity: {},
	name: "",
	title: "",
	instructions: "",
	model: "",
	effort: null,
	permissions: BLANK_BOT_PERMISSIONS,
}

const UPLOADED_BOT: BotSettingsValue = {
	...FILLED_BOT,
	identity: { ...FILLED_BOT.identity, image: UPLOADED_AVATAR_IMAGE },
}

const DialogHost = (props: BotSettingsDialogProps) => {
	const [value, setValue] = useState(props.value)
	const [outputStyle, setOutputStyle] = useState(props.outputStyle)
	const [open, setOpen] = useState(props.open)

	return (
		<BotSettingsDialog
			{...props}
			onClose={() => {
				setOpen(false)
				props.onClose()
			}}
			onOutputStyleChange={(next) => {
				setOutputStyle(next)
				props.onOutputStyleChange?.(next)
			}}
			outputStyle={outputStyle}
			onValueChange={(next) => {
				setValue(next)
				props.onValueChange(next)
			}}
			open={open}
			value={value}
		/>
	)
}

const dialogIn = async () => {
	const dialog = await screen.findByRole("dialog")
	await waitFor(() => expect(dialog).toBeVisible())
	return dialog
}

const railIn = (dialog: HTMLElement) => {
	const [rail] = slotsIn(dialog, "settings-rail")
	if (!rail) throw new Error("The dialog is missing its rail")
	return rail
}

const avatarIn = (dialog: HTMLElement) => {
	const [avatar] = slotsIn(dialog, "bot-identity-avatar")
	if (!avatar) throw new Error("The breadcrumb is missing its avatar")
	return avatar
}

const TOOLTIP_SETTLES_MS = 300

const settle = () =>
	new Promise((resolve) => setTimeout(resolve, TOOLTIP_SETTLES_MS))

const openTab = async (
	dialog: HTMLElement,
	name: string,
	user: ReturnType<typeof userEvent.setup>,
) => {
	await user.click(within(dialog).getByRole("tab", { name }))
	return await within(dialog).findByRole("tabpanel", { name })
}

const meta = preview.meta({
	title: "Settings/Bot/BotSettingsDialog",
	component: BotSettingsDialog,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"Everything a companion is, in one overlay. A breadcrumb heads it with the companion's avatar, its name and the word Settings, so a reader who opened it from a roster of twelve knows which one they are editing on every tab. Down the left is a rail of groups — General, Appearance, Instructions, Runtime, then a separator and Danger zone in destructive tone, last because it is the one action that cannot be undone. It opens on General, unless the host set `showDanger` to say a row's own delete is what opened it. It is fully controlled and saves as you type: every keystroke emits `onValueChange` with the whole value, and the dialog owns no draft, no debounce and no persistence. A skill is the exception: it is written on a press, so closing over one with something unsaved asks first. The breadcrumb and the rail hold still and only the open group scrolls, so the rail is where a reader left it after a long scroll. Below 42rem of content the rail drops to its icons, each one still named to a screen reader and named on hover and focus with a tooltip.",
			},
		},
	},
	args: {
		open: true,
		value: FILLED_BOT,
		models: MODELS,
		outputStyle: DEFAULT_BOT_OUTPUT_STYLE,
		seed: BOT_ID,
		onClose: fn(),
		onOutputStyleChange: fn(),
		onValueChange: fn(),
		onAvatarUpload: fn(),
		onDelete: fn(),
		skills: BOT_SKILLS,
		mcpServers: BOT_MCP_SERVERS,
		onMcpServerCreate: fn(),
		onMcpServerChange: fn(),
		onMcpServerDelete: fn(),
		environment: BOT_ENVIRONMENT,
		onEnvironmentSet: fn(),
		onEnvironmentDelete: fn(),
		onSkillCreate: fn(),
		onSkillChange: fn(),
		onSkillPreloadedChange: fn(),
		onSkillDelete: fn(),
		history: {
			days: HISTORY_DAYS,
			oldestDate: HISTORY_OLDEST_DATE,
			onUndo: fn(),
		},
	},
	argTypes: {
		working: { control: "boolean" },
		showDanger: { control: false },
	},
	render: (args) => <DialogHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The dialog as it opens on a companion that has been filled in and used. Check that it lands on General with the name and the title in reach, that the breadcrumb names the companion beside its avatar, and that the dialog announces itself as that companion's settings rather than as `Settings`. Typing emits a change immediately; nothing here batches or waits. Pick `Rail` for the way between the groups.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		await expect(dialog).toHaveAccessibleName("Nest Keeper Settings")

		const general = within(dialog).getByRole("tab", { name: "General" })
		await expect(general).toHaveAttribute("aria-selected", "true")

		const name = within(dialog).getByLabelText("Name")
		await userEvent.type(name, "!")
		await expect(args.onValueChange).toHaveBeenCalledTimes(1)
		await expect(name).toHaveValue("Nest Keeper!")
	},
})

export const Rail = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The groups and the way between them. Check the order — General, Appearance, Instructions, Skills, Applications, Secrets, History, Approvals, Runtime, then a rule and Danger zone alone below it, the only item in destructive tone. One tab stop reaches the rail and the arrow keys walk it, so a keyboard reader crosses the whole dialog in two stops rather than five. Walking is not opening: focus moves with the arrows and the group opens on Enter, so nobody drags a long group or a model list past on their way to the one they wanted. No item carries a tooltip: its name is already on the screen. Pick `ScrollsOneTab` for the rail beside a group taller than the dialog. The breadcrumb is unchanged whichever group is open: it names the companion, not the group.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		const rail = railIn(dialog)
		const names = within(rail)
			.getAllByRole("tab")
			.map((tab) => tab.textContent)
		await expect(names).toEqual([
			"General",
			"Appearance",
			"Instructions",
			"Skills",
			"Applications",
			"Secrets",
			"History",
			"Approvals",
			"Runtime",
			"Danger zone",
		])

		const appearance = within(rail).getByRole("tab", { name: "Appearance" })
		within(rail).getByRole("tab", { name: "General" }).focus()
		await userEvent.keyboard("{ArrowDown}")
		await expect(appearance).toHaveFocus()
		await expect(appearance).toHaveAttribute("aria-selected", "false")

		await userEvent.keyboard("{Enter}")
		await waitFor(() =>
			expect(appearance).toHaveAttribute("aria-selected", "true"),
		)
		await expect(
			within(dialog).getByText("Nest Keeper", { selector: "span" }),
		).toBeVisible()

		await userEvent.hover(appearance)
		await settle()
		await expect(document.body.querySelector('[role="tooltip"]')).toBe(null)
		await expect(appearance).not.toHaveAttribute("aria-describedby")
	},
})

export const Appearance = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The whole of a companion's face, flat: the preview, the nine colour choices and the zone that takes a picture. Nothing is folded away behind a popover: the tab is the picker. Check that choosing a colour writes the whole value back through `onValueChange` and that the preview follows it immediately.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const panel = await openTab(dialog, "Appearance", userEvent)

		await expect(slotsIn(panel, "bot-identity-fields")).toHaveLength(1)

		await userEvent.click(within(panel).getByRole("radio", { name: "Red" }))
		await expect(args.onValueChange).toHaveBeenCalledWith(
			expect.objectContaining({
				identity: expect.objectContaining({ blot: BLOT_HUES.red }),
			}),
		)
	},
})

export const FreeHue = meta.story({
	args: { value: { ...FILLED_BOT, identity: { blot: 210 } } },
	parameters: {
		docs: {
			description: {
				story:
					"A companion stored at a hue outside the eight presets, 210. Check that Appearance opens with `Your hue` selected at 210 rather than the nearest preset, and that moving the slider writes the new hue back untouched. Pick `Appearance` for a preset.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const panel = await openTab(dialog, "Appearance", userEvent)

		await expect(
			within(panel).getByRole("radio", { name: "Your hue" }),
		).toBeChecked()
		const slider = within(panel).getByRole("slider", { name: "Your hue" })
		await expect(slider).toHaveValue("210")

		slider.focus()
		await userEvent.keyboard("{ArrowRight}")
		await waitFor(() =>
			expect(args.onValueChange).toHaveBeenLastCalledWith(
				expect.objectContaining({
					identity: expect.objectContaining({ blot: 211 }),
				}),
			),
		)
	},
})

export const Instructions = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The system prompt, in one control that takes the whole tab. Check that it grows to the dialog's height rather than sitting as an eight-row box with dead space under it, that it does not resize by hand, and that a prompt longer than the box scrolls inside the control while the rail and the breadcrumb hold still.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const panel = await openTab(dialog, "Instructions", userEvent)
		const field = within(panel).getByLabelText("Instructions")

		await expect(
			panel.getBoundingClientRect().height -
				field.getBoundingClientRect().height,
		).toBeLessThan(80)

		await userEvent.type(field, ".")
		await expect(args.onValueChange).toHaveBeenCalledTimes(1)
	},
})

export const WithMemory = meta.story({
	args: {
		memory: BOT_MEMORY,
		onMemoryChange: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The same tab for a host that hands the dialog what the companion wrote down for itself. The memory sits under the instructions with its own label, so the two are never mistaken for one field: above is what the user asks of the companion, below is what the companion noticed. It is the one place in the dialog that does not save as you type — the memory is reported on its own control and never through `onValueChange`, because it does not live in the companion's settings.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const panel = await openTab(dialog, "Instructions", userEvent)
		const memory = within(panel).getByLabelText("Memory")

		await userEvent.type(memory, "!")
		await expect(args.onValueChange).not.toHaveBeenCalled()

		await userEvent.click(
			within(panel).getByRole("button", { name: "Save memory" }),
		)
		await expect(args.onMemoryChange).toHaveBeenCalledWith(`${BOT_MEMORY}!`)
	},
})

export const Runtime = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"What the companion runs on: the model out of the list the host supplies, and the answer style it writes in. Both are pickers: neither is something a reader can type correctly. Check that the model list marks the one in use.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const panel = await openTab(dialog, "Runtime", userEvent)

		await userEvent.click(
			within(panel).getByRole("combobox", { name: /Model/ }),
		)
		await userEvent.click(
			await screen.findByRole("option", { name: "Claude Opus 4.1" }),
		)
		await expect(args.onValueChange).toHaveBeenCalledWith(
			expect.objectContaining({ model: "opus-4-1" }),
		)

		await expect(
			within(panel).queryByRole("button", { name: /Folder/ }),
		).toBeNull()
	},
})

export const DangerZone = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The last group, and the only one that cannot be undone. Check that the destructive action is never one press away: it opens a confirmation naming the companion and saying what leaves with it, that Cancel closes that confirmation and changes nothing, and that only the second press reports the deletion. The group carries its tone in the rail as well as in the panel, so a reader never lands here by accident.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const panel = await openTab(dialog, "Danger zone", userEvent)

		await userEvent.click(
			within(panel).getByRole("button", { name: "Delete companion" }),
		)
		const confirmation = await screen.findByRole("alertdialog")
		await expect(confirmation).toHaveTextContent("Delete Nest Keeper?")

		await userEvent.click(
			within(confirmation).getByRole("button", { name: "Cancel" }),
		)
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onDelete).not.toHaveBeenCalled()

		await userEvent.click(
			within(panel).getByRole("button", { name: "Delete companion" }),
		)
		const reopened = await screen.findByRole("alertdialog")
		await userEvent.click(
			within(reopened).getByRole("button", { name: "Delete companion" }),
		)
		await expect(args.onDelete).toHaveBeenCalledTimes(1)
	},
})

export const OpenedOnDanger = meta.story({
	args: { showDanger: true },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The dialog as a row's own delete opens it: `showDanger` lands it on Danger zone instead of General. Check that it only picks the group — no confirmation stands, so a reader who meant another companion can leave without answering anything. Pick `DangerZone` for the confirmation itself.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const danger = within(dialog).getByRole("tab", { name: "Danger zone" })
		await expect(danger).toHaveAttribute("aria-selected", "true")
		await expect(screen.queryByRole("alertdialog")).toBe(null)

		await userEvent.keyboard("{Escape}")
		await expect(args.onClose).toHaveBeenCalled()
		await expect(args.onDelete).not.toHaveBeenCalled()
	},
})

export const ClosingOverAnUnsavedSkill = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Every way out taken over a skill with something typed into it. A skill is written on a press, so the dialog asks the question its editor asks rather than dropping the draft. Check that Escape raises the question, that refusing it leaves the skill open with what was typed still there, and that accepting the next one closes the dialog once.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(within(dialog).getByRole("tab", { name: "Skills" }))
		await userEvent.click(
			within(dialog).getByRole("button", { name: /release-notes/ }),
		)
		const body = within(dialog).getByLabelText("Body")
		await userEvent.type(body, "!")

		await userEvent.keyboard("{Escape}")

		const asked = await screen.findByRole("alertdialog")
		await waitFor(() => expect(asked).toBeVisible())
		await expect(args.onClose).not.toHaveBeenCalled()

		await userEvent.click(within(asked).getByRole("button", { name: "Cancel" }))

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(body).toHaveValue(`${BOT_SKILLS[0]?.body}!`)

		await userEvent.keyboard("{Escape}")

		const popup = await screen.findByRole("alertdialog")
		await userEvent.click(within(popup).getByRole("button", { name: "Leave" }))

		await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null))
		await expect(args.onClose).toHaveBeenCalledTimes(1)
	},
})

export const ScrollsOneTab = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A group taller than the dialog: every approval a companion can be asked for. Check that the panel is the one thing that moves: the breadcrumb stays on the companion's name and the rail stays where the reader left it, so the way out of a long group is never a scroll back up. The dialog itself never scrolls.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		const rail = railIn(dialog)
		const panel = await openTab(dialog, "Approvals", userEvent)
		const railTop = rail.getBoundingClientRect().top

		await expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight)
		await expect(dialog.scrollHeight).toBe(dialog.clientHeight)

		panel.scrollTop = panel.scrollHeight
		await waitFor(() => expect(rail.getBoundingClientRect().top).toBe(railTop))
		await expect(
			within(dialog).getByRole("tab", { name: "Approvals" }),
		).toBeVisible()
	},
})

export const Empty = meta.story({
	args: { value: NEW_BOT },
	parameters: {
		docs: {
			description: {
				story:
					"A companion that has just been created and holds nothing yet. Check that the breadcrumb still names something rather than opening on a blank, that every field falls back to a placeholder saying what belongs there, and that the model reads `Choose a model` rather than an empty box.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		await expect(dialog).toHaveAccessibleName("Untitled companion Settings")
		await expect(within(dialog).getByLabelText("Name")).toHaveValue("")

		const panel = await openTab(dialog, "Runtime", userEvent)
		await expect(
			within(panel).getByRole("combobox", { name: /Model/ }),
		).toHaveTextContent("Choose a model")
		await expect(
			within(panel).queryByRole("button", { name: /Folder/ }),
		).toBeNull()
	},
})

export const History = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Everything that has ever changed in this companion's bundle, on the tab between Applications and Runtime. Reach for this to check that the group reads as a list of changes rather than a log: the title leads each row, who and when sit under it, and the diff is folded away until somebody asks for it. The tab exists only for a host that passed the `history` group — a host with no bundle to read gets no tab rather than an empty one. Pick `AI/HistoryPanel` for the states the list itself takes.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		const panel = await openTab(dialog, "History", userEvent)

		const [newest] = within(panel).getAllByRole("listitem")
		await expect(newest).toHaveTextContent(
			"Switched the model to Claude Sonnet 4.5",
		)

		await expect(
			within(panel).getByRole("heading", { level: 3, name: "Today" }),
		).toBeVisible()
	},
})

export const HistoryChange = meta.story({
	args: {
		history: {
			days: HISTORY_DAYS,
			oldestDate: HISTORY_OLDEST_DATE,
			files: MANY_CHANGE_FILES,
			onUndo: fn(),
			onOpen: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"One change of that history, opened from the list. Reach for this to check the push rather than the page: the dialog stays open and swaps its whole body for the change, the rail becomes that change's files, and Back returns to the list still on History rather than dropping the reader back on General. Pick `Settings/Plugins/HistoryChangePage` for the states the page itself takes.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const panel = await openTab(dialog, "History", userEvent)

		await userEvent.click(
			within(panel).getByRole("button", {
				name: "Switched the model to Claude Sonnet 4.5",
			}),
		)

		await expect(args.history?.onOpen).toHaveBeenCalledTimes(1)
		await expect(
			within(dialog).getByRole("tab", { name: "AGENTS.md" }),
		).toBeVisible()

		await userEvent.click(
			within(dialog).getByRole("button", { name: "History" }),
		)

		await expect(
			within(railIn(dialog)).getByRole("tab", { name: "History" }),
		).toHaveAttribute("aria-selected", "true")
		await expect(
			within(dialog).getByRole("heading", { level: 3, name: "Today" }),
		).toBeVisible()
	},
})

export const PushedPages = meta.story({
	args: {
		history: {
			days: HISTORY_DAYS,
			oldestDate: HISTORY_OLDEST_DATE,
			files: MANY_CHANGE_FILES,
			onUndo: fn(),
			onOpen: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"Two pushed pages, one after the other, in one opening of the dialog. Reach for this when a push changes where the dialog lands on the way back: returning from a history change must leave the reader on History, and the skill push that follows must leave them on Skills rather than inheriting History from the push before it. The dialog holds one tab selection for the whole opening, so every push reads it and every return restores it.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		const history = await openTab(dialog, "History", userEvent)

		await userEvent.click(
			within(history).getByRole("button", {
				name: "Switched the model to Claude Sonnet 4.5",
			}),
		)
		await userEvent.click(
			within(dialog).getByRole("button", { name: "History" }),
		)

		await expect(
			within(railIn(dialog)).getByRole("tab", { name: "History" }),
		).toHaveAttribute("aria-selected", "true")

		const skills = await openTab(dialog, "Skills", userEvent)

		await userEvent.click(
			within(skills).getByRole("button", { name: /release-notes/ }),
		)
		await userEvent.click(
			within(dialog).getByRole("button", { name: "All skills" }),
		)

		await expect(
			within(railIn(dialog)).getByRole("tab", { name: "Skills" }),
		).toHaveAttribute("aria-selected", "true")
	},
})

export const WithoutHistory = meta.story({
	args: { history: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"The same dialog on a host that has not wired the bundle's history. Check that the rail simply has one item fewer — no tab, no empty group behind one — and that every other group is where it was.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()

		await expect(
			within(railIn(dialog)).queryByRole("tab", { name: "History" }),
		).toBe(null)
	},
})

export const Working = meta.story({
	args: { value: UPLOADED_BOT, working: true, workingKind: "writing" },
	parameters: {
		docs: {
			description: {
				story:
					"The companion is mid-run while its settings are open. Check that the breadcrumb avatar is the same face the roster row is showing, doing the same thing — and that it carries no dot, because a run is not a badge. Editing a companion never stops it.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()
		const avatar = avatarIn(dialog)

		await expect(await pictureOf(avatar)).toHaveAttribute(
			"src",
			UPLOADED_AVATAR_IMAGE,
		)
		await expect(
			avatar.querySelector('[data-slot="bot-activity-dot"]'),
		).toBeNull()
	},
})

export const WithALongSkill = meta.story({
	args: { skills: [...BOT_SKILLS, LONG_SKILL] },
	parameters: {
		docs: {
			description: {
				story:
					"A skill whose name and description are both wider than the panel that lists them. Check that the dialog stays the width it declares rather than growing to the longest row, and that the row clips its two lines instead of pushing its tag and chevron out of reach. Pick `WithSkillOpen` for that skill taken out of the list.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		const panel = await openTab(dialog, "Skills", userEvent)

		await waitFor(() =>
			expect(widthInRems(dialog)).toBeCloseTo(DIALOG_WIDTH_REMS, 1),
		)

		const row = within(panel).getByRole("button", {
			name: new RegExp(LONG_SKILL.name),
		})
		await expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(
			dialog.getBoundingClientRect().right,
		)
	},
})

export const WithSkillOpen = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A skill taken out of the list. Reach for this to check the one place the dialog gives up its own rail: the skill takes the whole surface, and the rail becomes that skill's summary — a way back to the list, then Instructions, Triggering, Execution, Tools and Advanced. Nothing in it is written as it is typed, so the save is a press and the way back asks before it drops anything. Pick `Rail` for the companion's own groups.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(within(dialog).getByRole("tab", { name: "Skills" }))
		await userEvent.click(
			within(dialog).getByRole("button", { name: /release-notes/ }),
		)

		const sections = within(railIn(dialog))
			.getAllByRole("tab")
			.map((tab) => tab.textContent)
		await expect(sections).toEqual([
			"Instructions",
			"Triggering",
			"Execution",
			"Tools",
			"Advanced",
		])
		await expect(
			within(dialog).getByRole("button", { name: "All skills" }),
		).toBeVisible()
	},
})

export const WithServerOpen = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"An application taken out of the list. The dialog gives up its own rail the same way it does for a skill: the application takes the whole surface, and the rail becomes that application's summary — a way back to the list, then Connection, Secrets and Advanced. Nothing in it is written as it is typed, so the save is a press and the way back asks before it drops anything. Pick `WithSkillOpen` for the other surface that does this.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(
			within(dialog).getByRole("tab", { name: "Applications" }),
		)
		await userEvent.click(within(dialog).getByRole("button", { name: /atlas/ }))

		const sections = within(railIn(dialog))
			.getAllByRole("tab")
			.map((tab) => tab.textContent)
		await expect(sections).toEqual(["Connection", "Secrets", "Advanced"])
		await expect(
			within(dialog).getByRole("button", { name: "All applications" }),
		).toBeVisible()
	},
})

export const Closing = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The three ways out — Escape, the backdrop and the corner affordance — and none of them asks a question while no skill is open. Every keystroke of the companion's own fields was already reported, so there is nothing unsaved to warn about. Check that Escape closes the dialog and reports it once, and that nothing is confirmed on the way. Pick `ClosingOverAnUnsavedSkill` for the one way out that does ask.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		await dialogIn()

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null))
		await expect(args.onClose).toHaveBeenCalledTimes(1)
		await expect(screen.queryByRole("alertdialog")).toBe(null)
	},
})
