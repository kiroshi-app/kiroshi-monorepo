import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	isInBrowserRunner,
	slotIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import {
	ToggleSwitch,
	type ToggleSwitchProps,
} from "@workspace/ui/components/toggle-switch"

const ToggleSwitchHost = (props: ToggleSwitchProps) => {
	const [checked, setChecked] = useState(props.checked)

	return (
		<ToggleSwitch
			{...props}
			checked={checked}
			onCheckedChange={(next) => {
				setChecked(next)
				props.onCheckedChange(next)
			}}
		/>
	)
}

const meta = preview.meta({
	title: "Forms/ToggleSwitch",
	component: ToggleSwitch,
	render: (args) => <ToggleSwitchHost {...args} />,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The registry `Switch` behind a narrowed prop surface: `checked` and `onCheckedChange` are required, and the only other props are an `id`, `disabled`, a `className` and the four aria labelling attributes. One binary setting, written the moment it is pressed. Reach for it over a checkbox whenever there is no save button to wait for: the track has to read as the state itself rather than as a choice pending a submit. It renders a button, so a visible `label` owns it through `htmlFor` and the words beside it are part of the same target, and `aria-describedby` is where a consequence goes — the sentence that says what turning it on costs. It holds no value: the surface owns the state and this only reports the press.",
			},
		},
	},
	args: {
		checked: false,
		onCheckedChange: fn(),
		"aria-label": "Preload this skill",
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The resting, off state and the press that turns it on. Check that the thumb slides rather than jumps between the two ends when motion is allowed, and that the track fills with the primary at once rather than only outlining — an off switch and an on one must be distinguishable without reading the label beside them.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const control = canvas.getByRole("switch")

		await expect(control).toHaveAttribute("aria-checked", "false")
		await userEvent.click(control)
		await expect(args.onCheckedChange).toHaveBeenCalledWith(true)
		await expect(control).toHaveAttribute("aria-checked", "true")

		if (!isInBrowserRunner()) return
		await withMotionAllowed(() =>
			expect(getComputedStyle(control).transitionProperty).toBe("none"),
		)
	},
})

export const States = meta.story({
	tags: ["test-only"],
	parameters: {
		pseudo: { focusVisible: "#toggle-switch-focus" },
		docs: {
			description: {
				story:
					"The matrix: off, on, focused and both disabled ends. Check that focus draws a ring around the whole track rather than around the thumb, and that a disabled switch still reads its state — dimming it must not make on and off look alike.",
			},
		},
	},
	render: () => (
		<div className="flex items-center gap-4">
			<ToggleSwitch aria-label="Off" checked={false} onCheckedChange={fn()} />
			<ToggleSwitch aria-label="On" checked onCheckedChange={fn()} />
			<ToggleSwitch
				aria-label="Focused"
				checked
				id="toggle-switch-focus"
				onCheckedChange={fn()}
			/>
			<ToggleSwitch
				aria-label="Disabled off"
				checked={false}
				disabled
				onCheckedChange={fn()}
			/>
			<ToggleSwitch
				aria-label="Disabled on"
				checked
				disabled
				onCheckedChange={fn()}
			/>
		</div>
	),
})

export const WithLabel = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this over `Default` whenever the switch carries a consequence: the label names it, the sentence under it says what it costs, and `aria-describedby` reads that sentence after the name instead of in place of it. Check that clicking the words toggles the switch — the label owns the control through `htmlFor`, which is the whole reason it renders a button.",
			},
		},
	},
	render: (args) => (
		<div className="flex w-80 items-start justify-between gap-4">
			<div className="flex flex-col gap-1">
				<label
					className="font-medium text-foreground text-xs"
					htmlFor="toggle-switch-preload"
				>
					Preload this skill
				</label>
				<p
					className="text-muted-foreground text-xs"
					id="toggle-switch-preload-hint"
				>
					A preloaded skill is in this agent's prompt on every turn.
				</p>
			</div>
			<ToggleSwitchHost
				{...args}
				aria-describedby="toggle-switch-preload-hint"
				aria-label={undefined}
				id="toggle-switch-preload"
			/>
		</div>
	),
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByText("Preload this skill"))

		await expect(args.onCheckedChange).toHaveBeenCalledWith(true)
	},
})

export const ReducedMotion = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The same press for a reader who asked the system to stop moving things. The track switches its colour at once whatever the preference and the registry switch slides its thumb; the composed one drops that slide under `prefers-reduced-motion`, so the value changes by colour and position alone with nothing travelling between the two ends. Check the track and the thumb both report no transition property at all, and that the thumb is already at the far end on the frame after the press - a switch is a report, so nothing waits on a transition end and dropping the motion outright costs nothing.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const track = canvas.getByRole("switch")
		const thumb = slotIn(canvasElement, "switch-thumb")

		await expect(getComputedStyle(track).transitionProperty).toBe("none")
		await expect(getComputedStyle(thumb).transitionProperty).toBe("none")

		const restingThumb = thumb.getBoundingClientRect().left

		await userEvent.click(track)

		await expect(track).toHaveAttribute("aria-checked", "true")
		await expect(thumb.getBoundingClientRect().left).toBeGreaterThan(
			restingThumb,
		)
		await expect(getComputedStyle(track).transitionProperty).toBe("none")
		await expect(getComputedStyle(thumb).transitionProperty).toBe("none")
	},
})
