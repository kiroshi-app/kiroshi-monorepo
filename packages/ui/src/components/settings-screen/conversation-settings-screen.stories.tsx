import { useState } from "react"
import { expect, fn, screen, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	expectSettingsPage,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { TITLE_BAR } from "@workspace/ui/components/app-title-bar.fixtures"
import { CONVERSATION_BOTS } from "@workspace/ui/components/bots.fixtures"
import {
	ConversationSettingsScreen,
	type ConversationSettingsScreenProps,
} from "@workspace/ui/components/settings-screen"

const BACK_TO_CONVERSATIONS = "Back to conversations"

const CONVERSATION_MENU = [
	"General",
	"Participants",
	"Instructions",
	"Danger zone",
]

const INSTRUCTIONS =
	"Ship notes are written for the people running the update, not for us."

const INSTRUCTIONS_BOX_HEIGHT = 220

const SEATED = CONVERSATION_BOTS.slice(0, 3)

const RAIL: ConversationSettingsScreenProps["rail"] = {
	selected: "conversations",
	user: { name: "Ada Martin" },
}

const ScreenHost = (props: ConversationSettingsScreenProps) => {
	const [entry, setEntry] = useState(props.entry)
	const [value, setValue] = useState(props.value)
	const [leadId, setLeadId] = useState(props.leadId)

	return (
		<ConversationSettingsScreen
			{...props}
			entry={entry}
			leadId={leadId}
			onEntryChange={(next, modifiers) => {
				setEntry(next)
				props.onEntryChange(next, modifiers)
			}}
			onLeadChange={(id) => {
				setLeadId(id)
				props.onLeadChange(id)
			}}
			onValueChange={(next) => {
				setValue(next)
				props.onValueChange(next)
			}}
			value={value}
		/>
	)
}

const menuIn = () => screen.findByRole("navigation", { name: "Settings" })

const entryIn = (menu: HTMLElement, name: string) =>
	within(menu).getByRole("button", { name })

const expectPageShown = (label: string) =>
	expectSettingsPage(screen.getByRole("main"), label, "column")

const meta = preview.meta({
	title: "Settings/Conversation/ConversationSettingsScreen",
	component: ConversationSettingsScreen,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"A conversation's settings as a whole window instead of the dialog, laid out like the companion's. The settings menu takes the place of the conversations panel: the Back link the caller names, the conversation's icon in its colour, its name and Conversation settings, then the dialog's four sections with Danger zone pinned at the foot. Each page draws the panel the dialog draws, in a column centred and capped at 800px.",
			},
		},
	},
	args: {
		entry: "general",
		onEntryChange: fn(),
		onBack: fn(),
		backLabel: BACK_TO_CONVERSATIONS,
		rail: RAIL,
		titleBar: TITLE_BAR,
		value: { name: "Release desk", instructions: INSTRUCTIONS },
		onValueChange: fn(),
		icon: "Rocket" as const,
		hue: 150,
		onIconChange: fn(),
		onHueChange: fn(),
		participants: SEATED,
		leadId: SEATED[0]?.id ?? "",
		onLeadChange: fn(),
		onDismiss: fn(),
		onDelete: fn(),
	},
	render: (args) => <ScreenHost {...args} />,
})

export const General = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The screen as it opens, on General. Check the menu order with Danger zone pinned last, the 36px conversation icon beside the name and Conversation settings, then the name field, the icon picker and the colour field in the page column. Typing in the name renames the menu header as you type.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		await expect(
			within(menu)
				.getAllByRole("button")
				.map((button) => button.textContent),
		).toEqual([BACK_TO_CONVERSATIONS, ...CONVERSATION_MENU])
		await expect(entryIn(menu, "General")).toHaveAttribute(
			"aria-current",
			"page",
		)
		await expect(within(menu).getByText("Conversation settings")).toBeVisible()
		await expect(
			slotIn(menu, "conversation-subject-icon").getBoundingClientRect().width,
		).toBe(36)

		await expectPageShown("General")
		const main = screen.getByRole("main")
		await userEvent.type(within(main).getByLabelText("Name"), "!")
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk!",
			instructions: INSTRUCTIONS,
		})
		await expect(within(menu).getByText("Release desk!")).toBeVisible()
	},
})

export const Participants = meta.story({
	args: { entry: "participants" },
	parameters: {
		docs: {
			description: {
				story:
					"The seating page. Check that the three companions are listed with one crown on the lead, that moving the crown reports that companion, and that dismissing one reports it.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		await menuIn()
		await expectPageShown("Participants")
		const main = screen.getByRole("main")
		await expect(slotsIn(main, "participant")).toHaveLength(3)

		await userEvent.click(
			within(main).getByRole("button", { name: "Give the lead to Clémence" }),
		)
		await expect(args.onLeadChange).toHaveBeenCalledWith("bot-clemence")
		await expect(slotsIn(main, "participant-lead")).toHaveLength(1)

		await userEvent.click(
			within(main).getByRole("button", { name: "Dismiss Clémence" }),
		)
		await expect(args.onDismiss).toHaveBeenCalledWith("bot-clemence")
	},
})

export const Instructions = meta.story({
	args: { entry: "instructions" },
	parameters: {
		docs: {
			description: {
				story:
					"The brief every companion in the conversation reads, in the companion's 220px box. Check the box height and that editing reports the whole value alongside the untouched name.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		await menuIn()
		await expectPageShown("Instructions")
		const brief = within(screen.getByRole("main")).getByLabelText(
			"Instructions",
		)
		await expect(brief).toHaveValue(INSTRUCTIONS)
		await expect(brief.getBoundingClientRect().height).toBe(
			INSTRUCTIONS_BOX_HEIGHT,
		)
		await userEvent.type(brief, "!")
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk",
			instructions: `${INSTRUCTIONS}!`,
		})
	},
})

export const DangerZone = meta.story({
	args: { entry: "danger" },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The delete card. Check that Danger zone is the current page and that deleting asks first, then reports.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		await expect(entryIn(menu, "Danger zone")).toHaveAttribute(
			"aria-current",
			"page",
		)
		await expectPageShown("Danger zone")
		await userEvent.click(
			within(screen.getByRole("main")).getByRole("button", {
				name: "Delete conversation",
			}),
		)
		const question = await screen.findByRole("alertdialog")
		await userEvent.click(
			within(question).getByRole("button", { name: "Delete conversation" }),
		)
		await expect(args.onDelete).toHaveBeenCalledOnce()
	},
})

export const Dark = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"General in the dark theme. Check that the menu, the conversation icon in its colour and the General page draw on the dark tokens.",
			},
		},
	},
	play: async () => {
		await menuIn()
		await expectPageShown("General")
	},
})
