import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	BLANK_BOT_PERMISSIONS,
	type BotSettingsValue,
} from "@workspace/ui/components/bot-settings"
import { BotGeneralFields } from "@workspace/ui/components/bot-settings-dialog/general-fields"

const COMPANION: BotSettingsValue = {
	identity: { blot: "blue" },
	name: "Nest Keeper",
	title: "Repository archivist",
	instructions: "",
	model: "",
	effort: null,
	permissions: BLANK_BOT_PERMISSIONS,
}

const meta = preview.meta({
	title: "Settings/Bot/BotGeneralFields",
	component: BotGeneralFields,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"A companion's General section: its name, then its title. The settings dialog and the settings screen both draw it, and it saves as you type with the whole value.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex w-[36rem] flex-col gap-4 p-5">
				<Story />
			</div>
		),
	],
	args: {
		value: COMPANION,
		onValueChange: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Check that Name comes before Title and that a keystroke in the title reports the whole value with the new title.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByLabelText("Name")).toHaveValue("Nest Keeper")
		await userEvent.type(canvas.getByLabelText("Title"), "!")
		await expect(args.onValueChange).toHaveBeenCalledWith({
			...args.value,
			title: "Repository archivist!",
		})
	},
})
