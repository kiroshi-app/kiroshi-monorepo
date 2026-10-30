import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	SettingsSwitch,
	type SettingsSwitchProps,
} from "@workspace/ui/components/settings-switch"

const SwitchHost = (props: SettingsSwitchProps) => {
	const [checked, setChecked] = useState(props.checked)

	return (
		<SettingsSwitch
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
	title: "Forms/SettingsSwitch",
	component: SettingsSwitch,
	render: (args) => (
		<div className="w-96">
			<SwitchHost {...args} />
		</div>
	),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One setting turned on or off, with the sentence that says what it costs. The panel is what keeps the sentence attached to the switch it explains, and the label owns the control, so pressing the words is pressing the switch. Reach for this wherever a `SettingsField` would be the wrong shape: nothing is typed, so there is nothing to label — only a state to read. The sentence is not optional, because a switch whose consequence is obvious does not need a row this size.",
			},
		},
	},
	args: {
		label: "Cannot change anything itself",
		description:
			"This agent is refused the tools that edit files and run commands, so it cannot do either itself. It can still read, and anything else it carries — an MCP server, another companion it asks — is not held back by this.",
		checked: false,
		onCheckedChange: fn(),
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Knob story. Check that the switch keeps its size while the sentence wraps beside it, and that the two sit against the panel's top edge rather than centred on a paragraph that may be three lines tall.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const setting = canvas.getByRole("switch", {
			name: /Cannot change anything itself/,
		})

		await expect(setting).not.toBeChecked()

		await userEvent.click(setting)
		await expect(args.onCheckedChange).toHaveBeenCalledWith(true)
		await expect(setting).toBeChecked()
	},
})

export const On = meta.story({
	args: { checked: true },
	parameters: {
		docs: {
			description: {
				story:
					"The setting in force. Nothing but the track moves — the sentence says the same thing whichever way the switch is thrown, since it describes the setting rather than the state.",
			},
		},
	},
})

export const PressingTheLabel = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The label owns the control, so the words are part of the target. Check that pressing them throws the switch, and that the sentence under them is announced after the label rather than in place of it.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByText("Cannot change anything itself"))

		await expect(args.onCheckedChange).toHaveBeenCalledWith(true)
	},
})
