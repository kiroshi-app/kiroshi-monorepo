import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { DangerZone } from "@workspace/ui/components/bot-settings-dialog/danger-zone"

const confirmation = async () => {
	const popup = await screen.findByRole("alertdialog")
	await waitFor(() => expect(popup).toBeVisible())
	return popup
}

const meta = preview.meta({
	title: "Settings/Bot/DangerZone",
	component: DangerZone,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The one action a settings panel cannot undo, kept behind a question — the same group a companion, a conversation and a space all end on. It states what leaves before the reader presses anything, then names the thing again in the confirmation, so a reader who opened the wrong settings finds out there rather than after. The destructive tone is carried by a hairline border rather than a fill, so the group reads as serious without shouting over the panel above it. It carries no copy of its own: the heading, the sentence and the confirmation title all arrive as props, which is what lets one group serve every panel. The question is its own — the group opens and closes it, and `onConfirm` fires only on the second press.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="w-full max-w-md">
				<Story />
			</div>
		),
	],
	args: {
		actionLabel: "Delete companion",
		description:
			"Its avatar, instructions and working directory go with it. This cannot be undone.",
		confirmTitle: "Delete Nest Keeper?",
		onConfirm: fn(),
	},
	argTypes: {
		defaultConfirming: { control: false },
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Knob story for the group. Change `actionLabel` and check that it reaches the heading, the trigger and the confirmation's own button at once — they are one word by design, so the reader agrees to exactly what they pressed. `confirmTitle` is separate because only the question names the thing. Pick `Confirming` for the group mounted with the question already up: `defaultConfirming` is read once, as the group mounts, so it is not a knob to flip here.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Delete companion" })

		await userEvent.tab()
		await expect(trigger).toHaveFocus()
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The resting state: a heading, the sentence naming everything that goes, and a single destructive button. Nothing here deletes anything — the press only asks. Check that the group takes the full width of the panel but the button does not, so the action never reads as the panel's primary one. Pick `Inert` for the panel whose thing refuses to go.",
			},
		},
	},
})

export const Confirming = meta.story({
	args: { defaultConfirming: true },
	parameters: {
		docs: {
			description: {
				story:
					"The confirmation, mounted already open. It names the thing in the title, repeats the consequence in full rather than shortening it to `Are you sure?`, and puts Cancel first so the safe way out is the one the hand reaches. The whole screen dims behind it and focus is trapped inside — this is a question, not a notification. Check that Escape and the backdrop both cancel, and that neither reports a deletion.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await confirmation()

		await expect(popup).toHaveTextContent("Delete Nest Keeper?")

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onConfirm).not.toHaveBeenCalled()
	},
})

export const Cancelled = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The path most readers take: they open the question and back out of it. Cancel closes the confirmation and touches nothing else — nothing is reported, because a question nobody answered is not news — so the group returns exactly as it was and the thing is still there. Check that the trigger is still reachable afterwards — a cancelled question must not leave the group inert.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Delete companion" }),
		)

		const popup = await confirmation()
		await userEvent.click(within(popup).getByRole("button", { name: "Cancel" }))

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onConfirm).not.toHaveBeenCalled()
		await expect(
			canvas.getByRole("button", { name: "Delete companion" }),
		).toBeVisible()
	},
})

export const Deleted = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The accepted path, and the only one that reports anything. The second press closes the question and fires `onConfirm` once — the group deletes nothing itself, it only says the reader agreed, which leaves the screen free to close the settings, undo, or fail loudly. Check that the count is exactly one however fast the button is pressed.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Delete companion" }),
		)

		const popup = await confirmation()
		await userEvent.click(
			within(popup).getByRole("button", { name: "Delete companion" }),
		)

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onConfirm).toHaveBeenCalledTimes(1)
	},
})

export const Inert = meta.story({
	args: {
		actionLabel: "Delete space",
		confirmTitle: "Delete Release desk?",
		disabledReason: "You can’t delete your last space.",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The thing that refuses to go — the last space its panel has. The control stays where it was and goes inert rather than disappearing, so the group does not change shape between one space and two, and the host swaps the sentence for the reason in place of the consequence. Check that the button reports nothing to a pointer or to a keyboard, and that it is skipped rather than focused on the way through.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		await expect(
			canvas.getByRole("button", { name: "Delete space" }),
		).toBeDisabled()
		await expect(args.onConfirm).not.toHaveBeenCalled()
	},
})
