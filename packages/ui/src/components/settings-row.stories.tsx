import { useId } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Icons } from "@workspace/ui/components/icons"
import {
	SettingsLinkRow,
	SettingsRow,
	SettingsRows,
} from "@workspace/ui/components/settings-row"
import { ToggleSwitch } from "@workspace/ui/components/toggle-switch"

type SwitchRowProps = { title: string; detail: string }

const SwitchRow = ({ title, detail }: SwitchRowProps) => {
	const id = useId()

	return (
		<SettingsRow detail={detail} title={title} titleId={id}>
			<ToggleSwitch aria-labelledby={id} checked onCheckedChange={fn()} />
		</SettingsRow>
	)
}

const meta = preview.meta({
	title: "Forms/SettingsRow",
	component: SettingsRows,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A box of settings rows, each one line apart from the next. A row names a setting, says in a muted line what it does, and holds its control at the trailing edge; a link row is the whole row as a button, its trailing icon saying where it leads. The box draws the frame and the rules between rows, so a row never draws its own edge.",
			},
		},
	},
	args: { children: null },
})

export const Default = meta.story({
	render: () => (
		<div className="w-96">
			<SettingsRows>
				<SwitchRow
					detail="The first time Kiroshi opens on a new version, it shows what changed."
					title="Show what’s new after an update"
				/>
				<SwitchRow detail="Every notification rings." title="Play a sound" />
			</SettingsRows>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Two rows holding a switch each. Check the single rule between them, the title over its muted detail, and that each switch is named by its own row. Pick `LinkRows` for rows that are buttons.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("switch", { name: "Play a sound" }),
		).toBeChecked()
	},
})

const onReleaseNotes = fn()

export const LinkRows = meta.story({
	render: () => (
		<div className="w-96">
			<SettingsRows>
				<SettingsLinkRow
					icon={Icons.Next}
					label="What’s new in 0.24.0"
					onClick={fn()}
				/>
				<SettingsLinkRow
					aria-label="Release notes, opens in your browser"
					icon={Icons.ExternalLink}
					label="Release notes"
					onClick={onReleaseNotes}
				/>
			</SettingsRows>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Two link rows: a chevron for a page inside the app, an arrow out for one that opens elsewhere. Check that the whole row is the target and that the outbound one says so in its name. Pick `Default` for rows holding a control.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", {
				name: "Release notes, opens in your browser",
			}),
		)
		await expect(onReleaseNotes).toHaveBeenCalledOnce()
	},
})
