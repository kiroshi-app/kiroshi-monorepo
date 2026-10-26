import type { CSSProperties, ReactNode } from "react"
import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	resolvedRootColor,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import type { BotMcpConnectionState } from "@workspace/ui/components/bot-settings"
import { MARKED_APPLICATIONS } from "@workspace/ui/components/plugin-settings/applications.fixtures"
import {
	SettingsMenu,
	SettingsMenuAddApplication,
	SettingsMenuAddSpace,
	SettingsMenuApplication,
	SettingsMenuEntry,
	SettingsMenuSection,
	SettingsMenuSpace,
} from "@workspace/ui/components/settings-menu"
import { SIDEBAR_DEFAULT_WIDTH } from "@workspace/ui/components/sidebar-resize"
import { SpaceSquare } from "@workspace/ui/components/space-switcher"
import { SidebarProvider } from "@workspace/ui/components/ui/sidebar"

const NEEDS_AUTHORIZATION_DOT = "bg-state-needs-authorization"

const CONNECTED_DOT = "bg-success"

const E3_DARK_NEEDS_AUTHORIZATION = "rgb(232, 176, 74)"

const E3_DARK_CONNECTED = "rgb(95, 191, 133)"

const expectDot = async (
	dot: HTMLElement,
	dotClass: string,
	backgroundColor: string,
) => {
	await expect(dot).toHaveClass(dotClass)
	await expect(getComputedStyle(dot).backgroundColor).toBe(backgroundColor)
}

const connectionDotIn = (
	canvasElement: HTMLElement,
	connection: BotMcpConnectionState,
) => {
	const dot = canvasElement.querySelector<HTMLElement>(
		`[data-connection="${connection}"]`,
	)
	if (!dot) throw new Error(`No ${connection} dot in the menu.`)
	return dot
}

const Frame = ({ children }: { children: ReactNode }) => (
	<div
		className="flex h-[600px] bg-background p-4"
		style={{ "--sidebar-width": `${SIDEBAR_DEFAULT_WIDTH}px` } as CSSProperties}
	>
		{children}
	</div>
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

const LONG_NAME =
	"Northwind quarterly planning offsite in Lisbon with the whole studio"

const SPACE_PRESSES = {
	onAdd: fn(),
	onOpenStudio: fn(),
	onOpenNorthwind: fn(),
}

const heightOf = (element: Element) => element.getBoundingClientRect().height

const expectWhole = (element: HTMLElement) =>
	expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth)

const titleRowOf = (menu: HTMLElement, title: string) =>
	within(menu).getByText(title).parentElement as HTMLElement

export const SpaceSections = meta.story({
	args: {
		avatar: <SpaceSquare colour="orange" size="avatar" />,
		name: "Ada Martin",
		subtitle: "User settings",
		footer: undefined,
		children: (
			<>
				<SettingsMenuSection title="Your settings">
					<SettingsMenuEntry
						icon="Cloud"
						isSelected
						label="Account"
						onSelect={fn()}
					/>
				</SettingsMenuSection>
				<SettingsMenuSection
					action={<SettingsMenuAddSpace onAdd={SPACE_PRESSES.onAdd} />}
					title="Your spaces"
				>
					<SettingsMenuSpace
						colour="orange"
						host="up"
						isCurrent
						name={`Studio ${LONG_NAME}`}
						onOpen={SPACE_PRESSES.onOpenStudio}
					/>
					<SettingsMenuSpace
						colour="blue"
						hasAttention
						name={LONG_NAME}
						onOpen={SPACE_PRESSES.onOpenNorthwind}
					/>
					<SettingsMenuSpace isInvitation name={LONG_NAME} onOpen={fn()} />
				</SettingsMenuSection>
			</>
		),
	},
	render: (args) => (
		<SidebarProvider>
			<Frame>
				<SettingsMenu {...args} />
			</Frame>
		</SidebarProvider>
	),
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The two titled groups of the user settings menu, Space names longer than the menu. Check that each name truncates while the Open now pill, the Invitation pill and the attention dot stay whole, that the Your spaces title row is 16px taller than the first, that the + is a 24px control named Create a space, and that a row and the + answer Enter. The contrast audit is left to review: the Invitation pill wears the warning token on its own tint as the artboard draws it.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const menu = within(canvasElement).getByRole("navigation", {
			name: "Settings",
		})
		await expect(heightOf(titleRowOf(menu, "Your settings"))).toBe(32)
		await expect(
			heightOf(titleRowOf(menu, "Your spaces").parentElement as HTMLElement) -
				heightOf(within(menu).getByRole("list", { name: "Your spaces" })),
		).toBe(48)

		const names = slotsIn(menu, "roster-row-name")
		await expect(names).toHaveLength(3)
		for (const name of names)
			await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expectWhole(slotIn(menu, "settings-menu-space-current"))
		await expectWhole(slotIn(menu, "settings-menu-space-invitation-pill"))
		const dot = slotIn(menu, "settings-menu-space-attention")
		await expect(heightOf(dot)).toBe(7)
		await expect(dot.getBoundingClientRect().width).toBe(7)

		const studio = within(menu).getByRole("button", { name: /^Studio/ })
		await expect(heightOf(studio)).toBe(36)
		await expect(studio).toHaveAttribute("aria-current", "true")
		await expect(heightOf(slotIn(studio, "space-dot"))).toBe(14)
		await expect(heightOf(slotIn(studio, "host-dot"))).toBe(8)
		const account = within(menu).getByRole("button", { name: "Account" })
		const leftOf = (element: Element) => element.getBoundingClientRect().left
		await expect(leftOf(slotIn(studio, "roster-row-name"))).toBe(
			leftOf(within(account).getByText("Account")),
		)
		await expect(leftOf(slotIn(studio, "space-dot"))).toBe(
			leftOf(account.querySelector("svg") as SVGElement) + 1,
		)

		const create = within(menu).getByRole("button", { name: "Create a space" })
		await expect(heightOf(create)).toBe(24)
		create.focus()
		await userEvent.keyboard("{Enter}")
		await expect(SPACE_PRESSES.onAdd).toHaveBeenCalledOnce()
		await userEvent.tab()
		await userEvent.keyboard("{Enter}")
		await expect(SPACE_PRESSES.onOpenStudio).toHaveBeenCalledOnce()
		await userEvent.tab()
		await userEvent.keyboard(" ")
		await expect(SPACE_PRESSES.onOpenNorthwind).toHaveBeenCalledOnce()
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
		await expectDot(
			connectionDotIn(canvasElement, "needsAuthorization"),
			NEEDS_AUTHORIZATION_DOT,
			resolvedRootColor("--warning"),
		)
		await expectDot(
			connectionDotIn(canvasElement, "connected"),
			CONNECTED_DOT,
			resolvedRootColor("--success"),
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
		await expectDot(
			connectionDotIn(canvasElement, "needsAuthorization"),
			NEEDS_AUTHORIZATION_DOT,
			E3_DARK_NEEDS_AUTHORIZATION,
		)
		await expectDot(
			connectionDotIn(canvasElement, "connected"),
			CONNECTED_DOT,
			E3_DARK_CONNECTED,
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
