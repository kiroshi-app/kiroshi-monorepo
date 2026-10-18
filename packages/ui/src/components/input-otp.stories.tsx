import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@workspace/ui/components/ui/input-otp"

const CODE_LABEL = "6-digit code"

const SLOTS = [0, 1, 2, 3, 4, 5]

const changed = fn()

const meta = preview.meta({
	title: "Forms/InputOTP",
	tags: ["test-only"],
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The one-time code field as the shadcn registry ships it on `input-otp`: one hidden input that owns the value, the keyboard and paste, drawn as a row of slots that read their character, their active state and the fake caret from its context. It holds no label: the caller names it. The app reaches it only through `NewDeviceScreen`, which draws six separate boxes over it; this story keeps the registry's own look.",
			},
		},
	},
	render: () => (
		<InputOTP
			aria-label={CODE_LABEL}
			maxLength={SLOTS.length}
			onChange={changed}
		>
			<InputOTPGroup>
				{SLOTS.map((slot) => (
					<InputOTPSlot index={slot} key={slot} />
				))}
			</InputOTPGroup>
		</InputOTP>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A code typed into the registry field. Check every digit lands in its own slot, the slot after the last digit reads active, and the change reaches the caller. Pick `NewDeviceScreen` › `Code` for the boxes the app draws.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await userEvent.click(canvas.getByRole("textbox", { name: CODE_LABEL }))
		await userEvent.keyboard("123")

		const slots = slotsIn(canvasElement, "input-otp-slot")
		await expect(slots.map((slot) => slot.textContent)).toEqual([
			"1",
			"2",
			"3",
			"",
			"",
			"",
		])
		await expect(slots[3]).toHaveAttribute("data-active", "true")
		await expect(changed).toHaveBeenLastCalledWith("123")
	},
})
