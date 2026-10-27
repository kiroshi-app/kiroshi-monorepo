import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import conversationIcons from "@workspace/shared/conversation-icons.json"
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
import { chat } from "@workspace/ui/lib/i18n-en/chat"

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

const ICONS_PER_ROW = 6

const ICON_LABELS: Record<string, string> =
	chat.conversationSettings.icon.option

const RAIL: ConversationSettingsScreenProps["rail"] = {
	selected: "conversations",
	user: { name: "Ada Martin" },
}

const ScreenHost = (props: ConversationSettingsScreenProps) => {
	const [entry, setEntry] = useState(props.entry)
	const [value, setValue] = useState(props.value)
	const [leadId, setLeadId] = useState(props.leadId)
	const [icon, setIcon] = useState(props.icon)
	const [hue, setHue] = useState(props.hue)

	return (
		<ConversationSettingsScreen
			{...props}
			entry={entry}
			hue={hue}
			icon={icon}
			leadId={leadId}
			onEntryChange={(next, modifiers) => {
				setEntry(next)
				props.onEntryChange(next, modifiers)
			}}
			onHueChange={(next) => {
				setHue(next)
				props.onHueChange?.(next)
			}}
			onIconChange={(next) => {
				setIcon(next)
				props.onIconChange?.(next)
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

const pictogramIn = (scope: Element) =>
	scope.querySelector('[data-slot="conversation-subject-icon-pictogram"]')
		?.innerHTML

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

export const IconPopoverOpen = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The icon popover over the General page. Check that the Icon field opens it by keyboard with the icons in the shared order and the rocket pressed and focused, that the arrow keys move between icons without choosing one, that Escape closes it and hands focus back to the field, and that choosing an icon reports it, closes the popover and redraws both the field and the menu header icon.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		const main = screen.getByRole("main")
		const trigger = within(main).getByRole("button", { name: "Icon Rocket" })

		trigger.focus()
		await userEvent.keyboard("{Enter}")
		await expect(trigger).toHaveAttribute("aria-expanded", "true")
		const current = await screen.findByRole("button", {
			name: "Rocket",
			pressed: true,
		})
		const group = current.parentElement as HTMLElement
		await expect(group).toBeVisible()
		const icons = within(group).getAllByRole("button")
		await expect(icons.map((icon) => icon.getAttribute("aria-label"))).toEqual(
			conversationIcons.map((id) => ICON_LABELS[id]),
		)
		await waitFor(() => expect(current).toHaveFocus())

		const currentIndex = conversationIcons.indexOf("Rocket")
		const nextIndex = currentIndex + 1
		await userEvent.keyboard("{ArrowRight}")
		await expect(icons[nextIndex]).toHaveFocus()
		await userEvent.keyboard("{ArrowDown}")
		await expect(icons[nextIndex + ICONS_PER_ROW]).toHaveFocus()
		await expect(args.onIconChange).not.toHaveBeenCalled()

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(group).not.toBeInTheDocument())
		await expect(trigger).toHaveFocus()

		await userEvent.click(trigger)
		const message = await screen.findByRole("button", { name: "Message" })
		const messagePictogram = pictogramIn(message)
		await userEvent.click(message)

		await expect(args.onIconChange).toHaveBeenCalledWith("MessageSquare")
		await waitFor(() => expect(message).not.toBeInTheDocument())
		const chosen = within(main).getByRole("button", { name: "Icon Message" })
		await expect(pictogramIn(chosen)).toBe(messagePictogram)
		await expect(pictogramIn(slotIn(menu, "conversation-subject-icon"))).toBe(
			messagePictogram,
		)
	},
})

export const OwnHueSet = meta.story({
	args: { hue: 320 },
	parameters: {
		docs: {
			description: {
				story:
					"A conversation wearing a hue of its own, outside the eight presets. Check that Your hue is the checked colour cell, that its slider stands on 320 degrees rather than snapping to the nearest preset, and that one step to the right reports 321.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		await menuIn()
		const main = within(screen.getByRole("main"))

		await expect(main.getByRole("radio", { name: "Your hue" })).toBeChecked()
		const slider = main.getByRole("slider", { name: "Your hue" })
		await expect(slider).toHaveValue("320")

		slider.focus()
		await userEvent.keyboard("{ArrowRight}")
		await expect(args.onHueChange).toHaveBeenLastCalledWith(321)
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
