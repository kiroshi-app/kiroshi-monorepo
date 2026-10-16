import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import conversationIcons from "@workspace/shared/conversation-icons.json"
import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	CONVERSATION_BOTS,
	LONG_NAMED_BOTS,
} from "@workspace/ui/components/bots.fixtures"
import {
	ConversationSettingsDialog,
	type ConversationSettingsDialogProps,
} from "@workspace/ui/components/conversation-settings-dialog"
import { chat } from "@workspace/ui/lib/i18n-en/chat"

const SEATED = CONVERSATION_BOTS.slice(0, 3)

const ICON_LABELS: Record<string, string> =
	chat.conversationSettings.icon.option

const DialogHost = (props: ConversationSettingsDialogProps) => {
	const [open, setOpen] = useState(props.open)
	const [value, setValue] = useState(props.value)
	const [participants, setParticipants] = useState(props.participants)
	const [leadId, setLeadId] = useState(props.leadId)
	const [icon, setIcon] = useState(props.icon)
	const [color, setColor] = useState(props.color)

	const dismiss = (id: string) => {
		const left = participants.filter((bot) => bot.id !== id)
		setParticipants(left)
		if (id === leadId && left[0]) {
			setLeadId(left[0].id)
		}
		props.onDismiss(id)
	}

	return (
		<ConversationSettingsDialog
			{...props}
			color={color}
			icon={icon}
			leadId={leadId}
			onClose={() => {
				setOpen(false)
				props.onClose()
			}}
			onColorChange={(next) => {
				setColor(next)
				props.onColorChange?.(next)
			}}
			onDismiss={dismiss}
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
			open={open}
			participants={participants}
			value={value}
		/>
	)
}

const dialogIn = async () => {
	const dialog = await screen.findByRole("dialog")
	await waitFor(() => expect(dialog).toBeVisible())
	return dialog
}

const openTab = async (
	name: string,
	userEvent: { click: (element: Element) => Promise<void> },
) => {
	const dialog = await dialogIn()
	await userEvent.click(within(dialog).getByRole("tab", { name }))
	return dialog
}

const pictogramIn = (scope: Element) =>
	scope.querySelector('[data-slot="conversation-subject-icon-pictogram"]')
		?.innerHTML

const headerMarkIn = (dialog: HTMLElement) => {
	const mark = dialog.querySelector(
		'header [data-slot="conversation-subject-icon"]',
	)
	if (!mark) throw new Error("The header drew no conversation icon")
	return mark
}

const meta = preview.meta({
	title: "Settings/Conversation/ConversationSettingsDialog",
	component: ConversationSettingsDialog,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"Everything a conversation is, behind one rail: its name, who takes part, the instructions every companion in it shares, and the one way to end it. The panes are split the way a reader changes their mind — renaming is a keystroke, changing who leads is a decision, deleting is a question — so the destructive pane sits below a separator and never next to the name field. The dialog holds no draft: every keystroke and every press is reported as it happens, which is what lets the screen persist a rename without a save button. The instructions pane is the conversation's own brief, shared by every companion seated — a companion's own instructions live in `BotSettingsDialog` instead. Reach for `ParticipantsPanel` for the seating on its own.",
			},
		},
	},
	args: {
		open: true,
		value: {
			name: "Release desk",
			instructions:
				"Ship notes are written for the people running the update, not for us.",
		},
		participants: SEATED,
		leadId: SEATED[0]?.id ?? "",
		onClose: fn(),
		onValueChange: fn(),
		onLeadChange: fn(),
		onDismiss: fn(),
		onDelete: fn(),
		onIconChange: fn(),
		onColorChange: fn(),
	},
	render: (args) => <DialogHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The dialog as it opens, on the general pane. Check that the header names the conversation, that typing in the name field reports the whole value rather than the keystroke, and that the four rail entries are reachable by keyboard with the danger one set apart. Pick `Participants` for the seating, `Instructions` for the shared brief, `Danger` for the deletion.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const inside = within(dialog)

		await expect(inside.getByRole("tab", { name: "General" })).toBeVisible()
		await userEvent.type(inside.getByLabelText("Name"), "!")

		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk!",
			instructions:
				"Ship notes are written for the people running the update, not for us.",
		})
	},
})

export const Participants = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The seating pane. Check that the companions are listed in joining order with one crown on the lead, that moving the crown reports that companion and leaves a single crown behind, and that nothing here offers to seat anyone — joining a conversation happens in the composer, by mention. `ParticipantsPanel` covers dismissal and the last-seat rule on its own.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await openTab("Participants", userEvent)
		const inside = within(dialog)

		await expect(slotsIn(dialog, "participant")).toHaveLength(3)
		await expect(inside.queryByRole("button", { name: "Atlas" })).toBe(null)

		await userEvent.click(
			inside.getByRole("button", { name: "Give the lead to Clémence" }),
		)

		await expect(args.onLeadChange).toHaveBeenCalledWith("bot-clemence")
		await expect(slotsIn(dialog, "participant-lead")).toHaveLength(1)
		await expect(inside.queryByRole("button", { name: "Dorian" })).toBe(null)
	},
})

export const Instructions = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The brief every companion in the conversation reads. Check that the field fills the pane rather than sitting as a two-line box — this is written in paragraphs — and that editing reports the whole value alongside the untouched name, so a screen persisting it never has to merge two sources.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await openTab("Instructions", userEvent)

		const brief = within(dialog).getByRole("textbox", { name: "Instructions" })

		await userEvent.clear(brief)
		await userEvent.type(brief, "Answer in French.")

		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk",
			instructions: "Answer in French.",
		})
	},
})

export const Danger = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The deletion pane, reached from the rail entry set below the separator. Check that the pane itself deletes nothing: the press opens a question naming the conversation, and only the answer to that question reports anything.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await openTab("Danger zone", userEvent)

		await userEvent.click(
			within(dialog).getByRole("button", { name: "Delete conversation" }),
		)

		const popup = await screen.findByRole("alertdialog")
		await expect(popup).toHaveTextContent("Delete Release desk?")
		await expect(args.onDelete).not.toHaveBeenCalled()

		await userEvent.click(
			within(popup).getByRole("button", { name: "Delete conversation" }),
		)
		await expect(args.onDelete).toHaveBeenCalledTimes(1)
	},
})

export const Empty = meta.story({
	args: {
		value: { name: "", instructions: "" },
		participants: CONVERSATION_BOTS.slice(0, 1),
		leadId: "bot-atlas",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A conversation renamed to nothing, with no brief and one companion left. Check that the header falls back to a placeholder name instead of showing an empty breadcrumb, and that the single seat cannot be given up — a conversation with nobody in it can no longer answer.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		await expect(dialog).toHaveTextContent("Untitled conversation")

		const participants = await openTab("Participants", userEvent)
		await expect(
			within(participants).getByRole("button", { name: "Dismiss Atlas" }),
		).toBeDisabled()
	},
})

export const LongContent = meta.story({
	args: {
		value: {
			name: "Release notes, incident retro and on-call handover for the desktop build",
			instructions:
				"Ship notes are written for the people running the update, not for us. Name the change, then what it breaks, then what to do about it — in that order, every time, however small the release. Never assume the reader has followed the thread.",
		},
		participants: LONG_NAMED_BOTS,
		leadId: "bot-release",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A conversation and companions named at length, with a brief that runs past the fold. Check that the header truncates the name and keeps the `Settings` breadcrumb visible, that participant rows truncate rather than pushing their controls away, and that the instructions field scrolls inside the pane instead of stretching the dialog.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await openTab("Participants", userEvent)

		await expect(
			within(dialog).getByRole("button", {
				name: "Give the lead to Incident triage and on-call handover companion",
			}),
		).toBeVisible()
	},
})

const TITLES = ["Research lead", "Release manager", "Reviewer"]

const TITLED = SEATED.map((bot, index) => ({ ...bot, title: TITLES[index] }))

export const ParticipantsWithTitles = meta.story({
	args: { participants: TITLED, leadId: TITLED[0]?.id ?? "" },
	parameters: {
		docs: {
			description: {
				story:
					"The seating pane on companions that carry titles. Check that every row shows its title pill right after the name and before the crown, whole while the row has room. Pick `Participants` for the same pane without titles.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await openTab("Participants", userEvent)
		const rows = slotsIn(dialog, "participant")

		await expect(rows).toHaveLength(TITLES.length)

		for (const [index, row] of rows.entries()) {
			const name = row.querySelector('[data-slot="participant-name"]')
			const title = row.querySelector<HTMLElement>(
				'[data-slot="bot-title-badge"]',
			)
			if (!name || !title) throw new Error("A row drew no title")

			await expect(title).toHaveTextContent(TITLES[index] ?? "")
			await expect(name.nextElementSibling).toBe(title)
			await expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth)
		}

		const lead = slotsIn(dialog, "participant-lead")[0]
		const [firstTitle] = slotsIn(rows[0] as HTMLElement, "bot-title-badge")
		await expect(firstTitle?.compareDocumentPosition(lead as Node)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		)
	},
})

export const NothingSet = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A conversation with no icon and no colour, on the general pane. Check that the header mark and the icon field both draw the neutral message cell, that the field reads `Message`, and that the fields run Name, Icon, Colour with `No colour` the current colour cell.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()
		const inside = within(dialog)

		const name = inside.getByRole("textbox", { name: "Name" })
		const trigger = inside.getByRole("button", { name: "Icon Message" })
		const none = inside.getByRole("radio", { name: "No colour" })

		await expect(trigger).toHaveTextContent("Message")
		await expect(none).toBeChecked()
		await expect(name.compareDocumentPosition(trigger)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		)
		await expect(trigger.compareDocumentPosition(none)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		)
		await expect(pictogramIn(headerMarkIn(dialog))).toBe(pictogramIn(trigger))
		await expect(headerMarkIn(dialog).getBoundingClientRect().width).toBe(24)
	},
})

export const IconPopoverOpen = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The icon popover over the general pane. Check that it opens below the field, start-aligned, with the 24 icons six to a row in the shared order and the current one marked; that the arrow keys move between icons without choosing one; that Escape closes it and hands focus back to the field; and that choosing an icon reports it, closes the popover and redraws both the header and the field.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const trigger = within(dialog).getByRole("button", { name: "Icon Message" })

		trigger.focus()
		await userEvent.keyboard("{Enter}")
		const marked = await screen.findByRole("button", {
			name: "Message",
			pressed: true,
		})
		const group = marked.parentElement as HTMLElement
		const icons = within(group).getAllByRole("button")

		await expect(icons.map((icon) => icon.getAttribute("aria-label"))).toEqual(
			conversationIcons.map((id) => ICON_LABELS[id]),
		)
		await waitFor(() => expect(marked).toHaveFocus())
		await userEvent.keyboard("{ArrowRight}")
		await expect(icons[1]).toHaveFocus()
		await userEvent.keyboard("{ArrowDown}")
		await expect(icons[7]).toHaveFocus()
		await expect(args.onIconChange).not.toHaveBeenCalled()

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(group).not.toBeInTheDocument())
		await expect(trigger).toHaveFocus()

		await userEvent.click(trigger)
		const rocket = await screen.findByRole("button", { name: "Rocket" })
		const rocketPictogram = pictogramIn(rocket)
		await userEvent.click(rocket)

		await expect(args.onIconChange).toHaveBeenCalledWith("Rocket")
		await waitFor(() => expect(rocket).not.toBeInTheDocument())
		const chosen = within(dialog).getByRole("button", { name: "Icon Rocket" })
		await expect(pictogramIn(chosen)).toBe(rocketPictogram)
		await expect(pictogramIn(headerMarkIn(dialog))).toBe(rocketPictogram)

		await userEvent.click(chosen)
		await expect(
			await screen.findByRole("button", { name: "Rocket", pressed: true }),
		).toBeVisible()
	},
})

export const IconAndColourSet = meta.story({
	args: { icon: "Rocket", color: "blue" },
	parameters: {
		docs: {
			description: {
				story:
					"A conversation with its icon and colour chosen. Check that the header and the field draw the rocket in the blue pair, that every colour cell previews the rocket in its own tint with `No colour` last in the neutral pair, and that choosing a cell reports its tint, or nothing for `No colour`.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const inside = within(dialog)

		await expect(
			inside.getByRole("button", { name: "Icon Rocket" }),
		).toBeVisible()
		await expect(inside.getByRole("radio", { name: "Blue" })).toBeChecked()

		await userEvent.click(inside.getByRole("radio", { name: "No colour" }))
		await expect(args.onColorChange).toHaveBeenLastCalledWith(undefined)

		await userEvent.click(inside.getByRole("radio", { name: "Blue" }))
		await expect(args.onColorChange).toHaveBeenLastCalledWith("blue")
		await expect(inside.getByRole("radio", { name: "Blue" })).toBeChecked()
	},
})
