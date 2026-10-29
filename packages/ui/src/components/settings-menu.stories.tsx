import type { CSSProperties, ReactNode } from "react"
import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	expectClickModifiers,
	resolvedRootColor,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import type { BotMcpConnectionState } from "@workspace/ui/components/bot-settings"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import { MARKED_APPLICATIONS } from "@workspace/ui/components/plugin-settings/applications.fixtures"
import {
	SettingsMenu,
	SettingsMenuAction,
	SettingsMenuAddApplication,
	SettingsMenuAddSpace,
	SettingsMenuApplication,
	SettingsMenuEntry,
	SettingsMenuSection,
	SettingsMenuSpace,
} from "@workspace/ui/components/settings-menu"
import { SIDEBAR_DEFAULT_WIDTH } from "@workspace/ui/components/sidebar-resize"
import { SpaceAvatar } from "@workspace/ui/components/space-avatar"
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
		avatar: (
			<SpaceAvatar
				colour={BLOT_HUES.blue}
				name="Release desk"
				size={36}
				spaceId="release-desk"
				state="online"
			/>
		),
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

const MODIFIER_PRESSES = {
	onSelectAccount: fn(),
	onOpenStudio: fn(),
}

export const OpensWithClickModifiers = meta.story({
	tags: ["test-only"],
	args: {
		avatar: (
			<SpaceAvatar
				colour={BLOT_HUES.orange}
				name="Studio"
				size={36}
				spaceId="studio"
			/>
		),
		name: "Ada Martin",
		subtitle: "User settings",
		footer: undefined,
		children: (
			<>
				<SettingsMenuSection title="Settings">
					<SettingsMenuEntry
						icon="Cloud"
						isSelected={false}
						label="Account"
						onSelect={MODIFIER_PRESSES.onSelectAccount}
					/>
				</SettingsMenuSection>
				<SettingsMenuSection title="Spaces">
					<SettingsMenuSpace
						colour={BLOT_HUES.orange}
						host="up"
						name="Studio"
						onOpen={MODIFIER_PRESSES.onOpenStudio}
						spaceId="studio"
					/>
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
		docs: {
			description: {
				story:
					"An entry and a Space row clicked every way a host can tell apart. Check that a middle click reports once with middle and the keys held, keeps the browser from starting its autoscroll, that a Cmd, Ctrl or Shift click reports that key alone, that a plain click and Enter report no key, and that a right-click reports nothing.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const menu = within(canvasElement).getByRole("navigation", {
			name: "Settings",
		})
		await expectClickModifiers({
			target: within(menu).getByRole("button", { name: "Account" }),
			callback: MODIFIER_PRESSES.onSelectAccount,
			reported: [],
			userEvent,
		})
		await expectClickModifiers({
			target: within(menu).getByRole("button", { name: /^Studio/ }),
			callback: MODIFIER_PRESSES.onOpenStudio,
			reported: [],
			userEvent,
		})
	},
})

const heightOf = (element: Element) => element.getBoundingClientRect().height

const expectWhole = (element: HTMLElement) =>
	expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth)

const titleRowOf = (menu: HTMLElement, title: string) =>
	within(menu).getByText(title).parentElement as HTMLElement

export const SpaceSections = meta.story({
	args: {
		avatar: (
			<SpaceAvatar
				colour={BLOT_HUES.orange}
				name="Studio"
				size={36}
				spaceId="studio"
			/>
		),
		name: "Ada Martin",
		subtitle: "User settings",
		footer: undefined,
		children: (
			<>
				<SettingsMenuSection title="Settings">
					<SettingsMenuEntry
						icon="Cloud"
						isSelected
						label="Account"
						onSelect={fn()}
					/>
				</SettingsMenuSection>
				<SettingsMenuSection
					action={<SettingsMenuAddSpace onAdd={SPACE_PRESSES.onAdd} />}
					title="Spaces"
				>
					<SettingsMenuSpace
						colour={BLOT_HUES.orange}
						host="up"
						isCurrent
						name={`Studio ${LONG_NAME}`}
						onOpen={SPACE_PRESSES.onOpenStudio}
						spaceId="studio"
					/>
					<SettingsMenuSpace
						colour={BLOT_HUES.blue}
						hasAttention
						name={LONG_NAME}
						onOpen={SPACE_PRESSES.onOpenNorthwind}
						spaceId="northwind"
					/>
					<SettingsMenuSpace
						colour={BLOT_HUES.green}
						isInvitation
						name={LONG_NAME}
						onOpen={fn()}
						spaceId="atelier"
					/>
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
					"The two titled groups of the user settings menu, Space names longer than the menu. Check that each name truncates while the Open now pill, the Invitation pill and the attention dot stay whole, that the Spaces title row is 16px taller than the first, that the + is a 24px control named Create a space, and that a row and the + answer Enter. The contrast audit is left to review: the Invitation pill wears the warning token on its own tint as the artboard draws it.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const menu = within(canvasElement).getByRole("navigation", {
			name: "Settings",
		})
		await expect(heightOf(titleRowOf(menu, "Settings"))).toBe(32)
		await expect(
			heightOf(titleRowOf(menu, "Spaces").parentElement as HTMLElement) -
				heightOf(within(menu).getByRole("list", { name: "Spaces" })),
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
		await expect(heightOf(slotIn(studio, "space-avatar"))).toBe(14)
		await expect(heightOf(slotIn(studio, "space-avatar-dot"))).toBe(8)
		const account = within(menu).getByRole("button", { name: "Account" })
		const leftOf = (element: Element) => element.getBoundingClientRect().left
		await expect(leftOf(slotIn(studio, "roster-row-name"))).toBe(
			leftOf(within(account).getByText("Account")),
		)
		await expect(leftOf(slotIn(studio, "space-avatar"))).toBe(
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

const expectCountInset = async (entry: HTMLElement) => {
	const row = entry.getBoundingClientRect()
	const badge = slotIn(entry, "settings-menu-count").getBoundingClientRect()
	const top = badge.top - row.top
	await expect(Math.abs(row.bottom - badge.bottom - top)).toBeLessThanOrEqual(1)
	await expect(Math.abs(row.right - badge.right - top)).toBeLessThanOrEqual(1)
}

const spaceEntries = (selected: "Space" | "Agents") => (
	<>
		<SettingsMenuEntry
			icon="Folder"
			isSelected={selected === "Space"}
			label="Space"
			onSelect={fn()}
		/>
		<SettingsMenuEntry
			count={3}
			icon="Users"
			isSelected={selected === "Agents"}
			label="Agents"
			onSelect={fn()}
		/>
	</>
)

const expectCompanionsCount = async (canvasElement: HTMLElement) => {
	const menu = within(canvasElement).getByRole("navigation", {
		name: "Settings",
	})
	const companions = within(menu).getByRole("button", { name: "Agents 3" })
	const count = slotIn(companions, "settings-menu-count")
	await expect(count).toHaveTextContent("3")
	await expect(getComputedStyle(count).fontVariantNumeric).toBe("tabular-nums")
	await expect(getComputedStyle(count).transitionProperty).not.toMatch(
		/color|all/,
	)
	await expectCountInset(companions)
	await expect(heightOf(companions)).toBe(
		heightOf(within(menu).getByRole("button", { name: "Space" })),
	)
}

export const FreeHue = meta.story({
	args: {
		avatar: (
			<SpaceAvatar colour={210} name="Studio" size={36} spaceId="studio" />
		),
		name: "Studio",
		children: (
			<SettingsMenuSection title="Spaces">
				<SettingsMenuSpace
					colour={210}
					isCurrent
					name="Studio"
					onOpen={fn()}
					spaceId="studio"
				/>
			</SettingsMenuSection>
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
					"A space at a hue outside the eight presets, 210, heading the menu and listed in it. Check that both marks wear that hue rather than the nearest preset. Pick `SpaceSections` for preset hues.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const avatars = slotsIn(canvasElement, "space-avatar")

		await expect(avatars.map((avatar) => avatar.dataset.colour)).toEqual([
			"210",
			"210",
		])
	},
})

export const AgentsCount = meta.story({
	args: { children: spaceEntries("Space") },
	parameters: {
		docs: {
			description: {
				story:
					"The Space menu, its Companions entry counting three. Check that the count sits in a badge as far from the top, the bottom and the right of its row, and that the row keeps the height of the Space entry.",
			},
		},
	},
	play: ({ canvasElement }) => expectCompanionsCount(canvasElement),
})

export const AgentsCountDark = meta.story({
	globals: { theme: "dark" },
	args: AgentsCount.input.args,
	parameters: {
		docs: {
			description: {
				story:
					"The counted Companions entry in the dark theme. Check that the badge keeps its equal inset and reads on the card.",
			},
		},
	},
	play: AgentsCount.input.play,
})

export const AgentsCountSelected = meta.story({
	args: { children: spaceEntries("Agents") },
	parameters: {
		docs: {
			description: {
				story:
					"Companions selected. Check that the badge keeps its card fill and its inset on the muted fill of the selected row.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			within(canvasElement).getByRole("button", { name: "Agents 3" }),
		).toHaveAttribute("aria-current", "page")
		await expectCompanionsCount(canvasElement)
	},
})

export const States = meta.story({
	tags: ["test-only"],
	args: {
		footer: (
			<>
				<SettingsMenuAction
					icon="Leave"
					label="Leave space"
					onSelect={fn()}
					tone="danger"
				/>
				<SettingsMenuAction
					icon="Close"
					label="Decline"
					onSelect={fn()}
					tone="quiet"
				/>
			</>
		),
		children: (
			<>
				<SettingsMenuEntry
					icon="Folder"
					isSelected={false}
					label="Default"
					onSelect={fn()}
				/>
				<SettingsMenuEntry
					count={4}
					icon="Users"
					isSelected={false}
					label="Hover"
					onSelect={fn()}
				/>
				<SettingsMenuEntry
					count={12}
					hasIndicator
					icon="Json"
					isSelected={false}
					label="Focus"
					onSelect={fn()}
				/>
				<SettingsMenuEntry
					count={3}
					icon="Skill"
					isSelected
					label="Selected"
					onSelect={fn()}
				/>
				<SettingsMenuEntry
					count={4}
					icon="Companions"
					isDisabled
					isSelected={false}
					label="Disabled"
					onSelect={fn()}
				/>
			</>
		),
	},
	play: async ({ canvasElement }) => {
		const menu = within(canvasElement).getByRole("navigation", {
			name: "Settings",
		})
		const disabled = within(menu).getByRole("button", { name: "Disabled" })
		await expect(disabled).toBeDisabled()
		await expect(
			disabled.querySelector("[data-slot=settings-menu-count]"),
		).not.toBeInTheDocument()
		await expect(
			within(menu).getByRole("button", { name: "Leave space" }),
		).toBeEnabled()
		const focus = within(menu).getByRole("button", { name: /^Focus/ })
		await expect(slotIn(focus, "settings-menu-indicator")).toBeVisible()
		await expectCountInset(focus)
	},
	parameters: {
		pseudo: {
			hover: "[data-slot=settings-menu-entries] li:nth-child(2) > button",
			focusVisible:
				"[data-slot=settings-menu-entries] li:nth-child(3) > button",
		},
	},
})

export const StatesDark = meta.story({
	tags: ["test-only"],
	globals: { theme: "dark" },
	args: States.input.args,
	parameters: States.input.parameters,
	play: States.input.play,
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
	play: async ({ canvasElement }) => {
		const menu = canvasElement.querySelector('nav[data-slot="settings-menu"]')
		await expect(menu).not.toBeNull()
		await expect(menu?.querySelector('li[aria-hidden="true"]')).toBeNull()
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
		avatar: (
			<SpaceAvatar
				colour={BLOT_HUES.pink}
				name="Release desk"
				size={36}
				spaceId="release-desk"
				state="connecting"
			/>
		),
		children: Default.input.args?.children,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The dark theme, for a space whose host is still connecting. Check that the avatar keeps its ground with its arcs drawn as lines, and carries no dot.",
			},
		},
	},
})

const HEADER_MENUS = [
	{
		isCompanionPage: true,
		avatar: <BotIdentityAvatar name="Atlas" seed="atlas" size={36} />,
		name: "Atlas",
		subtitle: "Agent settings",
		group: "Settings",
	},
	{
		isCompanionPage: false,
		avatar: (
			<SpaceAvatar
				colour={BLOT_HUES.blue}
				name="Release desk"
				size={36}
				spaceId="release-desk"
				state="online"
			/>
		),
		name: "Release desk",
		subtitle: "Space settings",
		group: "Settings",
	},
	{
		isCompanionPage: false,
		avatar: <InitialsAvatar name="Ada Martin" size={36} />,
		name: "Ada Martin",
		subtitle: "User settings",
		group: "Settings",
	},
]

const leftEdgeOf = (element: Element | null) =>
	(element as HTMLElement).getBoundingClientRect().left

export const HeaderAlignment = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: {
			config: { rules: [{ id: "landmark-unique", reviewOnFail: true }] },
		},
	},
	render: () => (
		<Frame>
			{HEADER_MENUS.map(({ group, ...menu }) => (
				<SettingsMenu key={menu.name} {...menu} onBack={fn()}>
					<SettingsMenuSection title={group}>
						<SettingsMenuEntry
							icon="Cloud"
							isSelected
							label="General"
							onSelect={fn()}
						/>
					</SettingsMenuSection>
				</SettingsMenu>
			))}
		</Frame>
	),
	play: async ({ canvasElement }) => {
		const menus = within(canvasElement).getAllByRole("navigation")
		await expect(menus).toHaveLength(HEADER_MENUS.length)
		for (const [index, menu] of menus.entries()) {
			const header = slotIn(menu, "settings-menu-header")
			const [title] = slotsIn(menu, "settings-menu-group-title")
			await expect(title).toHaveTextContent(HEADER_MENUS[index].group)
			await expect(leftEdgeOf(header.firstElementChild)).toBeCloseTo(
				leftEdgeOf(title.firstElementChild),
				0,
			)
		}
	},
})
