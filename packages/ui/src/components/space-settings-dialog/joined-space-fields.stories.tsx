import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	JoinedSpaceFields,
	type JoinedSpaceFieldsProps,
} from "@workspace/ui/components/space-settings-dialog/joined-space-fields"

const FieldsHost = (props: JoinedSpaceFieldsProps) => {
	const [value, setValue] = useState(props.value)

	return (
		<JoinedSpaceFields
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
	title: "Settings/Space/JoinedSpaceFields",
	component: JoinedSpaceFields,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The Space entry of a space joined from another Kiroshi: its name, editable and reported on every keystroke as on a local space, and the host it lives on, read-only with a hint saying the space lives there. No colour, no share link, nothing to move between machines. Pick `SpaceFields` for a space this machine owns.",
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
		value: { name: "Northwind" },
		onValueChange: fn(),
		host: "http://192.168.1.24:45367",
	},
	render: (args) => <FieldsHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Name and Host on a joined space. Check that typing in Name reports the edited name through `onValueChange`, that Host takes no edit but still takes focus so it can be selected and copied, and that the hint under Host is read as its description.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const name = canvas.getByLabelText("Name")
		const host = canvas.getByLabelText("Host")

		await userEvent.type(name, "!")
		await expect(name).toHaveValue("Northwind!")
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Northwind!",
		})

		await userEvent.type(host, "!")
		await expect(host).toHaveValue("http://192.168.1.24:45367")
		await expect(host).toHaveFocus()
		await expect(host).toHaveAttribute("readonly")
		await expect(host).toHaveAccessibleDescription(
			"This space lives on another Kiroshi.",
		)
	},
})
