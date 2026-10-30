import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Row } from "@workspace/storybook/story-utils"
import { Switch } from "@workspace/ui/components/ui/switch"

const LONG_LABEL =
	"Preload every skill this agent owns into the prompt on every single turn"

const meta = preview.meta({
	title: "Forms/Switch",
	component: Switch,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The switch as the shadcn registry ships it: the full Base UI prop surface plus a `sm` and a `default` size. Reach for `ToggleSwitch` when the call site should only be able to pass a value, a handler and a label.",
			},
		},
	},
	args: { "aria-label": "Preload this skill", onCheckedChange: fn() },
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The resting, off state and the press that turns it on. Check the thumb slides rather than jumps, and that the track fills rather than only outlining - an off switch and an on one must be distinguishable without reading the label beside them.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const control = canvas.getByRole("switch")

		await expect(control).toHaveAttribute("aria-checked", "false")
		await userEvent.click(control)
		await expect(args.onCheckedChange).toHaveBeenCalledWith(
			true,
			expect.anything(),
		)
	},
})

export const States = meta.story({
	tags: ["test-only"],
	parameters: {
		pseudo: { focusVisible: "#switch-focus" },
		docs: {
			description: {
				story:
					"The matrix: off, on, focused and both disabled ends. Check that focus draws a ring around the whole track rather than around the thumb, and that a disabled switch still reads its state - dimming it must not make on and off look alike.",
			},
		},
	},
	render: () => (
		<Row>
			<Switch aria-label="Off" />
			<Switch aria-label="On" defaultChecked />
			<Switch aria-label="Focused" defaultChecked id="switch-focus" />
			<Switch aria-label="Disabled off" disabled />
			<Switch aria-label="Disabled on" defaultChecked disabled />
		</Row>
	),
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("switch", { name: "Disabled off" }),
		).toHaveAttribute("aria-disabled", "true")
	},
})

export const LongContent = meta.story({
	tags: ["test-only"],
	render: () => (
		<div className="flex w-80 items-start justify-between gap-4">
			<label
				className="font-medium text-foreground text-xs"
				htmlFor="switch-long"
			>
				{LONG_LABEL}
			</label>
			<Switch aria-label={undefined} id="switch-long" />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A label long enough to wrap over three lines, the shape a translated setting takes. Check the switch keeps its width and stays anchored to the first line instead of stretching or centring itself against the paragraph.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const control = canvas.getByRole("switch")

		await userEvent.click(canvas.getByText(LONG_LABEL))
		await expect(control).toHaveAttribute("aria-checked", "true")
	},
})
