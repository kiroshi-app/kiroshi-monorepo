import type { ReactNode } from "react"
import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { resolvedRootColor, slotIn } from "@workspace/storybook/story-utils"
import { MARKED_APPLICATIONS } from "@workspace/ui/components/plugin-settings/applications.fixtures"
import {
	SettingsMenu,
	SettingsMenuAddApplication,
	SettingsMenuApplication,
	SettingsMenuEntry,
} from "@workspace/ui/components/settings-menu"
import { SpaceSquare } from "@workspace/ui/components/space-switcher"

const NEEDS_AUTHORIZATION_DOT = "bg-state-needs-authorization"

const E3_DARK_NEEDS_AUTHORIZATION = "rgb(232, 176, 74)"

const needsAuthorizationDotIn = (canvasElement: HTMLElement) => {
	const dot = canvasElement.querySelector<HTMLElement>(
		'[data-connection="needsAuthorization"]',
	)
	if (!dot) throw new Error("No needs-authorization dot in the menu.")
	return dot
}

const Frame = ({ children }: { children: ReactNode }) => (
	<div className="flex h-[600px] bg-background p-4">{children}</div>
)

const DANGER = (
	<SettingsMenuEntry
		icon="Alert"
		isDanger
		isSelected={false}
		label="Danger zone"
		onSelect={fn()}
	/>
)

const meta = preview.meta({
	title: "Navigation/SettingsMenu",
	component: SettingsMenu,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The menu a focused settings screen draws where the conversations panel sits: Back to conversations, the subject's avatar, name and kind, its entries, and whatever must stay pinned at the foot. Each entry is a button, the current one marked `aria-current=page`. The entries scroll on their own; the foot never does.",
			},
		},
	},
	args: {
		avatar: <SpaceSquare colour="blue" host="up" size="avatar" />,
		name: "Release desk",
		subtitle: "Space settings",
		onBack: fn(),
		footer: DANGER,
		children: null,
	},
	render: (args) => (
		<Frame>
			<SettingsMenu {...args} />
		</Frame>
	),
})

export const Default = meta.story({
	args: {
		children: (
			<>
				<SettingsMenuEntry
					icon="Folder"
					isSelected
					label="Space"
					onSelect={fn()}
				/>
				<SettingsMenuEntry
					icon="Users"
					isSelected={false}
					label="Members"
					onSelect={fn()}
				/>
				<SettingsMenuEntry
					hasIndicator
					icon="Info"
					isSelected={false}
					label="About"
					onSelect={fn()}
				/>
			</>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A menu at rest. Check that it is a navigation landmark named Settings, that only the selected entry carries `aria-current=page`, and that an entry asking for attention ends on an accent dot.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const menu = within(canvasElement).getByRole("navigation", {
			name: "Settings",
		})
		const space = within(menu).getByRole("button", { name: "Space" })
		await expect(space).toHaveAttribute("aria-current", "page")
		await expect(
			within(menu).getByRole("button", { name: "Members" }),
		).not.toHaveAttribute("aria-current")
		await expect(
			slotIn(
				within(menu).getByRole("button", { name: "About" }),
				"settings-menu-indicator",
			),
		).toBeVisible()

		await userEvent.click(
			within(menu).getByRole("button", { name: "Back to conversations" }),
		)
		await expect(args.onBack).toHaveBeenCalledOnce()
	},
})

export const States = meta.story({
	tags: ["test-only"],
	args: {
		footer: null,
		children: (
			<>
				<SettingsMenuEntry
					icon="Folder"
					isSelected={false}
					label="Default"
					onSelect={fn()}
				/>
				<SettingsMenuEntry
					icon="Users"
					isSelected={false}
					label="Hover"
					onSelect={fn()}
				/>
				<SettingsMenuEntry
					icon="Json"
					isSelected={false}
					label="Focus"
					onSelect={fn()}
				/>
				<SettingsMenuEntry
					icon="Skill"
					isSelected
					label="Selected"
					onSelect={fn()}
				/>
			</>
		),
	},
	parameters: {
		pseudo: {
			hover: "[data-slot=settings-menu-entries] li:nth-child(2) > button",
			focusVisible:
				"[data-slot=settings-menu-entries] li:nth-child(3) > button",
		},
	},
})

export const ApplicationsOpen = meta.story({
	args: {
		children: (
			<SettingsMenuEntry
				icon="Server"
				isOpen
				isSelected={false}
				label="Applications"
				onSelect={fn()}
			>
				{MARKED_APPLICATIONS.map((server, index) => (
					<SettingsMenuApplication
						connection={server.connection}
						isSelected={index === 0}
						key={server.name}
						mark={server.mark}
						name={server.displayName ?? server.name}
						onSelect={fn()}
					/>
				))}
				<SettingsMenuApplication
					connection="connecting"
					isSelected={false}
					name="Notion"
					onSelect={fn()}
				/>
				<SettingsMenuAddApplication onAdd={fn()} />
			</SettingsMenuEntry>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Applications opened on one of them. Check that Applications stays bold without the fill, that each sub-entry speaks its connection state beside its dot, and that the selected application carries `aria-current=page`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const menu = within(canvasElement).getByRole("navigation")
		await expect(
			within(menu).getByRole("button", { name: "Applications" }),
		).toHaveAttribute("data-open")
		await expect(
			within(menu).getByRole("button", { name: "Linear Connected" }),
		).toHaveAttribute("aria-current", "page")
		await expect(
			within(menu).getByRole("button", { name: "Notion Connecting…" }),
		).toBeVisible()
		await expect(
			within(menu).getByRole("button", { name: "Add an application" }),
		).toBeVisible()
		const dot = needsAuthorizationDotIn(canvasElement)
		await expect(dot).toHaveClass(NEEDS_AUTHORIZATION_DOT)
		await expect(getComputedStyle(dot).backgroundColor).toBe(
			resolvedRootColor("--warning"),
		)
	},
})

export const ApplicationsOpenDark = meta.story({
	globals: { theme: "dark" },
	args: ApplicationsOpen.input.args,
	parameters: {
		docs: {
			description: {
				story:
					"The dark theme, Applications opened. Check that GitHub, which needs authorization, carries the amber dot apart from the green of the connected applications.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const dot = needsAuthorizationDotIn(canvasElement)
		await expect(dot).toHaveClass(NEEDS_AUTHORIZATION_DOT)
		await expect(getComputedStyle(dot).backgroundColor).toBe(
			E3_DARK_NEEDS_AUTHORIZATION,
		)
	},
})

export const DangerSelected = meta.story({
	args: {
		footer: (
			<SettingsMenuEntry
				icon="Alert"
				isDanger
				isSelected
				label="Danger zone"
				onSelect={fn()}
			/>
		),
		children: (
			<SettingsMenuEntry
				icon="Folder"
				isSelected={false}
				label="Space"
				onSelect={fn()}
			/>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Danger zone selected. Check that it keeps the destructive tone on its own tinted fill rather than the neutral one.",
			},
		},
	},
})

export const DangerSelectedDark = meta.story({
	globals: { theme: "dark" },
	args: DangerSelected.input.args,
	parameters: {
		docs: {
			description: {
				story:
					"Danger zone selected in the dark theme. Check that its label and icon keep the red of the unselected entry on a dark red fill, apart from the neutral fill of the other entries.",
			},
		},
	},
})

export const ConnectingSpaceDark = meta.story({
	globals: { theme: "dark" },
	args: {
		avatar: <SpaceSquare colour="pink" host="connecting" size="avatar" />,
		children: Default.input.args?.children,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The dark theme, for a space whose host is still connecting. Check that the hollow presence dot is filled with the card behind it and ringed in it.",
			},
		},
	},
})
