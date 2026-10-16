import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
import { DiagnosticsFields } from "@workspace/ui/components/user-settings-dialog/diagnostics-fields"

const CLEAR_LABEL = "Clear log"

const confirmation = async () => {
	const dialog = await screen.findByRole("alertdialog")
	await waitFor(() => expect(dialog).toBeVisible())
	return dialog
}

const meta = preview.meta({
	title: "Settings/User/DiagnosticsFields",
	component: DiagnosticsFields,
	render: (args) => (
		<div className="w-[26rem]">
			<DiagnosticsFields {...args} />
		</div>
	),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"What a reader hands over when something went wrong: Copy diagnostics puts the details of the computer where Kiroshi runs and of the agent on the clipboard, Reveal log shows the log file where it lies, Clear log empties it after a confirmation, since a cleared log cannot be read back. It performs nothing itself: each action is a prop of the host, which formats the copy with `formatFailureSpecs`.",
			},
		},
	},
	args: {
		onDiagnosticsCopy: fn(),
		onLogReveal: fn(),
		onLogClear: fn(),
	},
})

export const Idle = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The three actions at rest, in the order a reader reaches for them. Check that each is a button named by its label, that Copy diagnostics and Reveal log each run their own prop once, and that nothing is cleared without a confirmation. Pick `ClearLogConfirming` for the confirmation Clear log opens.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const actions = canvas.getAllByRole("button")
		await expect(actions.map((action) => action.textContent)).toEqual([
			"Copy diagnostics",
			"Reveal log",
			CLEAR_LABEL,
		])

		await userEvent.click(
			canvas.getByRole("button", { name: "Copy diagnostics" }),
		)
		await expect(args.onDiagnosticsCopy).toHaveBeenCalledOnce()

		await userEvent.click(canvas.getByRole("button", { name: "Reveal log" }))
		await expect(args.onLogReveal).toHaveBeenCalledOnce()
		await expect(args.onLogClear).not.toHaveBeenCalled()
	},
})

export const ClearLogConfirming = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Clear log asks before it empties the log, because nothing brings a cleared line back. Check that the confirmation says so in its last sentence, that cancelling leaves the log as it was, and that confirming clears it once. The play leaves the confirmation open on screen. Pick `Idle` for the actions at rest.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: CLEAR_LABEL }))
		const cancelled = await confirmation()
		await expect(cancelled).toHaveAccessibleDescription(
			expect.stringMatching(/This can’t be undone\.$/),
		)
		await userEvent.click(
			within(cancelled).getByRole("button", { name: "Cancel" }),
		)
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onLogClear).not.toHaveBeenCalled()

		await userEvent.click(canvas.getByRole("button", { name: CLEAR_LABEL }))
		const confirmed = await confirmation()
		await expect(args.onLogClear).not.toHaveBeenCalled()
		await userEvent.click(
			within(confirmed).getByRole("button", { name: CLEAR_LABEL }),
		)
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onLogClear).toHaveBeenCalledOnce()

		await userEvent.click(canvas.getByRole("button", { name: CLEAR_LABEL }))
		await confirmation()
	},
})
