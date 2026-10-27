import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	BLANK_BOT_PERMISSIONS,
	type BotSettingsValue,
} from "@workspace/ui/components/bot-settings"
import { BotInstructionsFields } from "@workspace/ui/components/bot-settings-dialog/instructions-fields"
import { BOT_MEMORY } from "@workspace/ui/components/bot-settings-dialog/memory.fixtures"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"

const COMPANION: BotSettingsValue = {
	identity: { blot: BLOT_HUES.blue },
	name: "Nest Keeper",
	title: "",
	instructions: "You are the Nest Keeper.",
	model: "",
	effort: null,
	permissions: BLANK_BOT_PERMISSIONS,
}

const meta = preview.meta({
	title: "Settings/Bot/BotInstructionsFields",
	component: BotInstructionsFields,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"A companion's Instructions section: the prompt, then the memory when the host hands one. The settings dialog lets the prompt fill its tab; the settings screen gives it a tall box of its own.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex h-[36rem] w-[36rem] flex-col gap-4 p-5">
				<Story />
			</div>
		),
	],
	args: {
		value: COMPANION,
		onValueChange: fn(),
		memory: BOT_MEMORY,
		onMemoryChange: fn(),
		isTall: true,
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Check that the prompt reports the whole value on each keystroke while the memory waits for Save memory.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Instructions"), ".")
		await expect(args.onValueChange).toHaveBeenCalledWith({
			...args.value,
			instructions: "You are the Nest Keeper..",
		})
		await expect(args.onMemoryChange).not.toHaveBeenCalled()
	},
})
