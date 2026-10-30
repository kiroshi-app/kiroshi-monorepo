import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import {
	CONVERSATION_BOTS,
	LONG_NAMED_BOTS,
} from "@workspace/ui/components/bots.fixtures"
import {
	ParticipantsPanel,
	type ParticipantsPanelProps,
} from "@workspace/ui/components/conversation-settings-dialog/participants-panel"

const SEATED = CONVERSATION_BOTS.slice(0, 3)

const PanelHost = (props: ParticipantsPanelProps) => {
	const [participants, setParticipants] = useState(props.participants)
	const [leadId, setLeadId] = useState(props.leadId)

	const dismiss = (id: string) => {
		const left = participants.filter((bot) => bot.id !== id)
		setParticipants(left)
		if (id === leadId && left[0]) {
			setLeadId(left[0].id)
		}
		props.onDismiss(id)
	}

	return (
		<ParticipantsPanel
			{...props}
			leadId={leadId}
			onDismiss={dismiss}
			onLeadChange={(id) => {
				setLeadId(id)
				props.onLeadChange(id)
			}}
			participants={participants}
		/>
	)
}

const meta = preview.meta({
	title: "Settings/Conversation/ParticipantsPanel",
	component: ParticipantsPanel,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"Who takes part in a conversation, and who leads it. The seated companions are listed in the order they joined — the list never reorders itself, because that order is the conversation's history — and exactly one of them wears the crown. Moving the crown is a press on another row's crown; dismissing is the cross beside it. The panel holds no state of its own: every press is reported up, so the screen decides what a dismissal or a handover means. One rule is enforced here rather than upstream: the last companion seated cannot be dismissed, because a conversation with nobody in it cannot answer. Joining happens in the composer, by mention, never here. Reach for `ConversationSettingsScreen` for the panel under its Participants entry.",
			},
		},
	},
	args: {
		participants: SEATED,
		leadId: SEATED[0]?.id ?? "",
		onLeadChange: fn(),
		onDismiss: fn(),
	},
	render: (args) => <PanelHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Three companions seated, the first leading. Check that the crown sits on exactly one row, that pressing another row's crown reports that companion and leaves a single crown behind, and that the leading row offers no crown button of its own — it is already the lead, there is nothing to press. Pick `LastParticipant` for the row that cannot be dismissed.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(slotsIn(canvasElement, "participant")).toHaveLength(3)
		await expect(slotsIn(canvasElement, "participant-lead")).toHaveLength(1)

		await userEvent.click(
			canvas.getByRole("button", { name: "Give the lead to Basile" }),
		)

		await expect(args.onLeadChange).toHaveBeenCalledWith("bot-basile")
		await expect(slotsIn(canvasElement, "participant-lead")).toHaveLength(1)
		await expect(slotsIn(canvasElement, "participant")[1]).toHaveTextContent(
			"Lead",
		)
	},
})

export const Dismissed = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A companion is sent out of the conversation. Check that the dismissed companion is the one reported and the one that leaves the list, and that the rows left keep their joining order — dismissing returns that companion to the space, it does not delete it.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Dismiss Basile" }),
		)

		await expect(args.onDismiss).toHaveBeenCalledWith("bot-basile")

		const rows = slotsIn(canvasElement, "participant")
		await expect(rows).toHaveLength(2)
		await expect(rows[0]).toHaveTextContent("Atlas")
		await expect(rows[1]).toHaveTextContent("Clémence")
	},
})

export const LastParticipant = meta.story({
	args: {
		participants: CONVERSATION_BOTS.slice(0, 1),
		leadId: "bot-atlas",
	},
	parameters: {
		docs: {
			description: {
				story:
					"One companion left. A conversation with nobody in it cannot answer, so the last seat is held: the dismiss control is disabled and a line under the list says why, rather than letting the press fail silently. Check that the crown stays on that row.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("button", { name: "Dismiss Atlas" }),
		).toBeDisabled()
		await expect(slotsIn(canvasElement, "participants-last")).toHaveLength(1)
		await expect(slotsIn(canvasElement, "participant-lead")).toHaveLength(1)
		await expect(args.onDismiss).not.toHaveBeenCalled()
	},
})

export const LongContent = meta.story({
	args: {
		participants: LONG_NAMED_BOTS,
		leadId: "bot-release",
	},
	parameters: {
		docs: {
			description: {
				story:
					"Companions named at length. Check that a name truncates on one line instead of wrapping or pushing the crown and the cross off the row — the two controls stay reachable at any name length, which is what makes the row operable rather than pretty.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("button", {
				name: "Dismiss Incident triage and on-call handover agent",
			}),
		).toBeVisible()
	},
})
