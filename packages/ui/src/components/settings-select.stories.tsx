import { useState } from "react"
import { expect, fn, screen, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectControlFrame,
	expectFocusRing,
	expectInvalidOutline,
	FRAME_POLL,
	isInBrowserRunner,
	realPointer,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import {
	SettingsSelect,
	type SettingsSelectProps,
} from "@workspace/ui/components/settings-select"

const MODELS = [
	{ label: "Claude Sonnet", value: "claude-sonnet" },
	{ label: "Claude Opus", value: "claude-opus" },
	{ label: "Claude Haiku", value: "claude-haiku" },
]

const SelectHost = (props: SettingsSelectProps) => {
	const [value, setValue] = useState(props.value)

	return (
		<SettingsSelect
			{...props}
			onValueChange={(next) => {
				setValue(next)
				props.onValueChange(next)
			}}
			value={value}
		/>
	)
}

const meta = preview.meta({
	title: "Forms/SettingsSelect",
	component: SettingsSelect,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One setting picked from a closed set: the label, the trigger reading the current answer, and the list hanging off it. The same control wherever a settings surface asks a question whose answers are known — a model, an effort, a context — so they cannot drift apart. It keeps no state: the surface holds the answer and this reports the pick.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="w-72">
				<Story />
			</div>
		),
	],
	render: (args) => <SelectHost {...args} />,
	args: {
		label: "Model",
		options: MODELS,
		value: "claude-sonnet",
		onValueChange: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A question already answered. Check that the trigger reads the answer rather than the value behind it, that the open list marks the current one with a tick in its own column so the names stay aligned, and that Escape closes the list without changing the answer.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("combobox"))
		await screen.findByRole("listbox", { name: "Model" })
		await userEvent.click(
			await screen.findByRole("option", { name: "Claude Opus" }),
		)

		await waitFor(async () => {
			await expect(screen.queryByRole("listbox")).toBeNull()
		}, FRAME_POLL)

		await expect(args.onValueChange).toHaveBeenLastCalledWith("claude-opus")
	},
})

export const Disabled = meta.story({
	args: { isDisabled: true },
	parameters: {
		docs: {
			description: {
				story:
					"A question with nothing to choose from right now. The trigger stays in place and keeps its answer, dimmed, and it neither opens nor takes focus. Check that assistive technology hears it as disabled rather than merely grey.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const trigger = canvas.getByRole("combobox", { name: /Model/ })

		await expect(trigger).toBeDisabled()
		await expect(trigger).toHaveTextContent("Claude Sonnet")

		await userEvent.tab()
		await userEvent.keyboard("{ArrowDown}")

		await expect(trigger).not.toHaveFocus()
		await expect(screen.queryByRole("listbox")).toBeNull()
		await expect(args.onValueChange).not.toHaveBeenCalled()
	},
})

export const Empty = meta.story({
	args: { value: "", placeholder: "Choose a model" },
	parameters: {
		docs: {
			description: {
				story:
					"A question nobody has answered. Reach for this over `Default` to check that the placeholder reads as unanswered rather than as an answer — it is muted, and no option is ticked when the list opens.",
			},
		},
	},
})

export const Error = meta.story({
	args: {
		error: "This model is not available on the plan this agent runs on.",
		value: "claude-opus",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The answer a write came back refusing. Reach for this over `Default` to check that the trigger reads invalid rather than only turning red, that the message is tied to it by `aria-describedby` so a screen reader hears it on the control, and that the answer the reader picked is still the one on screen. A hint and a refusal can be read together; the refusal never replaces the hint.",
			},
		},
	},
	play: async ({ canvas }) => {
		const trigger = canvas.getByRole("combobox")
		const message = canvas.getByText(
			"This model is not available on the plan this agent runs on.",
		)

		await expect(trigger).toHaveAttribute("aria-invalid", "true")
		await expect(trigger.getAttribute("aria-describedby")).toContain(message.id)
	},
})

export const WithHint = meta.story({
	args: {
		hint: "Leave empty to use the agent’s model.",
		placeholder: "The agent’s own",
		value: "",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The rule under the control, in the same place a text field's is read. Reach for this whenever what the field decides is not obvious from its name — the sentence is announced after the label rather than in place of it, so a screen reader lands on the name first.",
			},
		},
	},
})

const ARTBOARD_TRIGGER =
	"The trigger on the frame of the artboard V1e text field, light and dark side by side: a `muted` fill, a 1px `input` outline and the `radius-control` corner. "

const triggersIn = (canvasElement: HTMLElement) => [
	...canvasElement.querySelectorAll<HTMLElement>('[role="combobox"]'),
]

export const ThemesAtRest = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { placeholder: "Pick a model", value: "" },
	parameters: {
		docs: { description: { story: `${ARTBOARD_TRIGGER}No answer yet.` } },
	},
	play: async ({ canvasElement }) => {
		const triggers = triggersIn(canvasElement)
		await expect(triggers.length).toBe(2)
		for (const trigger of triggers) await expectControlFrame(trigger)
	},
})

export const ThemesFilled = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		docs: { description: { story: `${ARTBOARD_TRIGGER}Reading an answer.` } },
	},
	play: async ({ canvasElement }) => {
		for (const trigger of triggersIn(canvasElement))
			await expectControlFrame(trigger)
	},
})

export const ThemesFocusVisible = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		pseudo: { focusVisible: '[role="combobox"]' },
		docs: {
			description: {
				story: `${ARTBOARD_TRIGGER}Keyboard focus keeps the existing \`ring\` outline and halo.`,
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		await userEvent.tab()
		await expectFocusRing(triggersIn(canvasElement)[0])
	},
})

export const ThemesInvalid = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { error: "This model is not available on this plan." },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD_TRIGGER}Refused, the trigger keeps the existing \`destructive\` outline.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const trigger of triggersIn(canvasElement))
			await expectInvalidOutline(trigger)
		if (!isInBrowserRunner()) return
		const pointer = await realPointer()
		for (const trigger of triggersIn(canvasElement)) {
			await pointer.hover(trigger)
			await waitFor(() => expect(trigger.matches(":hover")).toBe(true))
			await expectInvalidOutline(trigger)
			await pointer.unhover(trigger)
		}
	},
})

const hoverOutlineOf = (trigger: HTMLElement) =>
	tokenStyleIn(trigger, "border-muted-foreground", "borderTopColor")

export const ThemesHover = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		pseudo: { hover: '[role="combobox"]' },
		docs: {
			description: {
				story: `${ARTBOARD_TRIGGER}Under the pointer, which the play drives only in the Vitest browser runner, the outline darkens to the \`muted-foreground\` token while the fill stays \`muted\`; keyboard focus still draws the \`ring\` outline over it.`,
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		if (!isInBrowserRunner()) return
		const pointer = await realPointer()
		const triggers = triggersIn(canvasElement)
		for (const trigger of triggers) {
			const rest = getComputedStyle(trigger).borderTopColor
			await pointer.hover(trigger)
			await waitFor(() =>
				expect(getComputedStyle(trigger).borderTopColor).toBe(
					hoverOutlineOf(trigger),
				),
			)
			await expect(hoverOutlineOf(trigger)).not.toBe(rest)
			await pointer.unhover(trigger)
		}
		const [first] = triggers
		await userEvent.tab()
		await pointer.hover(first)
		await waitFor(() => expect(first.matches(":hover")).toBe(true))
		await expectFocusRing(first)
	},
})
