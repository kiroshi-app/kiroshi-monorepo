import { type ComponentType, useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectLaptopWindow,
	expectSettingsChrome,
	expectSettingsPage,
	LAPTOP_WINDOW,
	slotIn,
} from "@workspace/storybook/story-utils"
import { AppRail } from "@workspace/ui/components/app-rail"
import {
	GARAGE,
	TITLE_BAR,
} from "@workspace/ui/components/app-title-bar.fixtures"
import { SPACE_ENVIRONMENT } from "@workspace/ui/components/environment.fixtures"
import {
	CATALOGUE_APPLICATIONS,
	MARKED_APPLICATIONS,
} from "@workspace/ui/components/plugin-settings/applications.fixtures"
import { EVERYTHING_CATEGORY } from "@workspace/ui/components/plugin-settings/applications-catalogue"
import {
	HISTORY_DAYS,
	HISTORY_OLDEST_DATE,
} from "@workspace/ui/components/plugin-settings/history.fixtures"
import { BOT_SKILLS } from "@workspace/ui/components/plugin-settings/skills.fixtures"
import {
	SettingsScreen,
	type SpaceSettingsScreenProps,
} from "@workspace/ui/components/settings-screen"
import {
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_MAX_WIDTH,
	SIDEBAR_MIN_WIDTH,
} from "@workspace/ui/components/sidebar-resize"
import { SPACE_COMPANIONS } from "@workspace/ui/components/space-settings-dialog/companions.fixtures"
import { MembersPanel } from "@workspace/ui/components/space-settings-dialog/members-panel"

const SPACE_MENU = [
	"Space",
	"Members",
	"Secrets",
	"Skills",
	"Applications",
	"History",
	"Danger zone",
]

const MEMBERS = (
	<MembersPanel
		email=""
		isHosted
		members={[
			{
				id: "steve",
				name: "Steve",
				email: "steve@example.com",
				status: "host",
			},
			{
				id: "maya",
				name: "Maya Chen",
				email: "maya@example.com",
				status: "joined",
			},
		]}
		onEmailChange={fn()}
		onInvite={fn()}
		onInviteAgain={fn()}
		onRemove={fn()}
		onRemoveCancel={fn()}
		onRemoveConfirm={fn()}
		onWithdraw={fn()}
		space="Release desk"
	/>
)

const LINEAR_OPEN = {
	entry: "mcp",
	mcpServerToOpen: "linear",
	serverConnection: { state: "connected", onDisconnect: fn() },
} as const

const RAIL_PRESSES = {
	onSelectConversations: fn(),
	onSelectMissions: fn(),
	onOpenSpaceSettings: fn(),
	onOpenYou: fn(),
}

const RAIL: SpaceSettingsScreenProps["rail"] = (requestLeave) => (
	<AppRail
		onOpenSpaceSettings={() => requestLeave(RAIL_PRESSES.onOpenSpaceSettings)}
		onOpenYou={() => requestLeave(RAIL_PRESSES.onOpenYou)}
		onSelectConversations={() =>
			requestLeave(RAIL_PRESSES.onSelectConversations)
		}
		onSelectMissions={() => requestLeave(RAIL_PRESSES.onSelectMissions)}
		selected="conversations"
		user={{ name: "Ada Martin" }}
	/>
)

const railIn = () => screen.findByRole("navigation", { name: "Navigation" })

const SpaceSettingsScreen =
	SettingsScreen as ComponentType<SpaceSettingsScreenProps>

const ScreenHost = (props: SpaceSettingsScreenProps) => {
	const [entry, setEntry] = useState(props.entry)

	return (
		<SpaceSettingsScreen
			{...props}
			entry={entry}
			onEntryChange={(next) => {
				setEntry(next)
				props.onEntryChange(next)
			}}
		/>
	)
}

const menuIn = () => screen.findByRole("navigation", { name: "Settings" })

const entryIn = (menu: HTMLElement, name: string) =>
	within(menu).getByRole("button", { name })

const menuNames = (menu: HTMLElement) =>
	within(menu)
		.getAllByRole("button")
		.map((button) => button.textContent)

const SPACE_ARGS = {
	target: "space",
	entry: "members",
	onEntryChange: fn(),
	onBack: fn(),
	rail: RAIL,
	titleBar: { ...TITLE_BAR, onSelectSpace: fn() },
	isShared: true,
	value: { name: "Release desk", colour: "blue" },
	onValueChange: fn(),
	environment: SPACE_ENVIRONMENT,
	onEnvironmentSet: fn(),
	onEnvironmentDelete: fn(),
	skills: BOT_SKILLS,
	onSkillCreate: fn(),
	onSkillChange: fn(),
	onSkillPreloadedChange: fn(),
	onSkillDelete: fn(),
	mcpServers: MARKED_APPLICATIONS,
	onMcpServerCreate: fn(),
	onMcpServerChange: fn(),
	onMcpServerDelete: fn(),
	onMcpServerOpen: fn(),
	mcpCatalogue: {
		category: EVERYTHING_CATEGORY,
		onCategoryChange: fn(),
		query: "",
		onQueryChange: fn(),
		applications: CATALOGUE_APPLICATIONS,
		onRetry: fn(),
		onPick: fn(),
		onOpen: fn(),
	},
	history: {
		days: HISTORY_DAYS,
		oldestDate: HISTORY_OLDEST_DATE,
		onUndo: fn(),
	},
	members: MEMBERS,
	onDelete: fn(),
} satisfies SpaceSettingsScreenProps

const meta = preview.meta({
	title: "Settings/Space/SettingsScreen",
	component: SpaceSettingsScreen,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"A space's settings as a whole window instead of an overlay. The settings menu takes the place of the conversations panel: Back to your settings, the space's square and name, then its entries, Danger zone pinned at the foot. The content column draws the same panels the space settings dialog draws. Each page sits under a header bar the height of a conversation's header carrying the entry's label, its first row where a conversation's first message starts: forms in a column centred and capped at 800px, lists across the whole card. Members, Companions, Skills, Applications and History are lists; an open application is a form. Space opens on the space's own header: its square, name, standing and Open, then its Name field and, while it is yours and not shared, the Not shared yet card. A joined space pins Leave space instead of Danger zone and, while its host is not connected, greys every entry but Space; an invitation reduces the menu to one Invitation entry and pins Decline. Applications opens onto the space's installed applications, one sub-entry each with its mark and connection dot, then Add an application.",
			},
		},
	},
	args: SPACE_ARGS,
	render: (args) => <ScreenHost {...args} />,
})

export const Members = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Artboard E2: the space's settings open on Members. Check the menu order with Danger zone pinned last, Members marked as the current page, the space square with its presence dot beside the name, the Members title above the panel, and that Back to your settings reports itself.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		await expect(menuNames(menu)).toEqual([
			"Back to your settings",
			...SPACE_MENU,
		])
		await expect(entryIn(menu, "Members")).toHaveAttribute(
			"aria-current",
			"page",
		)
		await expect(within(menu).getByText("Release desk")).toBeVisible()
		await expect(within(menu).getByText("Space settings")).toBeVisible()
		await expect(slotIn(menu, "space-dot")).toHaveClass("size-9")
		await expect(slotIn(menu, "host-dot")).toHaveAttribute(
			"data-host",
			"shared",
		)

		const main = screen.getByRole("main")
		await expectSettingsPage(main, "Members", "full")
		await expect(within(main).getByText("Maya Chen")).toBeVisible()

		await userEvent.click(entryIn(menu, "Back to your settings"))
		await expect(args.onBack).toHaveBeenCalledOnce()
	},
})

export const MembersDark = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"`Members` in the dark theme. Check that the selected entry sits on the muted surface and the presence dot keeps its ring of the card.",
			},
		},
	},
})

export const MembersTinted = meta.story({
	args: { spaceTint: "blue" },
	parameters: {
		docs: {
			description: {
				story:
					"`Members` in a blue Space. Check that the shell wears the Space's tint, like the conversations shell of the same Space.",
			},
		},
	},
	play: async () => {
		const shell = screen.getByRole("main").parentElement as HTMLElement
		await expect(shell).toHaveAttribute("data-space-tint", "blue")
	},
})

export const Companions = meta.story({
	globals: { theme: "dark" },
	args: {
		entry: "companions",
		value: { name: "Studio", colour: "blue" },
		companions: {
			companions: SPACE_COMPANIONS,
			onSelect: fn(),
			onCreate: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"Artboard H01: the space's settings open on Companions. Check that Companions follows Members with its count on the right, that the header bar carries Companions, that the section draws its own title once, and that the cards sit two to a row across the whole card.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		await expect(menuNames(menu)).toEqual([
			"Back to your settings",
			"Space",
			"Members",
			"Companions4",
			...SPACE_MENU.slice(2),
		])
		const entry = entryIn(menu, "Companions 4")
		await expect(entry).toHaveAttribute("aria-current", "page")
		await expect(slotIn(entry, "settings-menu-count")).toHaveTextContent("4")

		const main = screen.getByRole("main")
		await expectSettingsPage(main, "Companions", "full")
		await expect(
			within(slotIn(main, "screen-layout-column")).getAllByRole("heading", {
				level: 2,
			}),
		).toHaveLength(1)
		const cards = within(main).getAllByRole("button", {
			name: /Writer|Planner|Builder|Designer/,
		})
		await expect(cards).toHaveLength(4)
		await expect(cards[0].getBoundingClientRect().top).toBe(
			cards[1].getBoundingClientRect().top,
		)

		await userEvent.click(cards[0])
		await expect(args.companions?.onSelect).toHaveBeenCalledWith("juniper")
	},
})

export const LinearApplication = meta.story({
	args: LINEAR_OPEN,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard E3: Applications open on Linear. Check that each installed application is a sub-entry with its mark and a connection dot whose state is spoken, that Linear is the current page while Applications stays bold without the fill, that the centred column under the Applications header bar heads the application page with its mark, name and state, and that Add an application opens the catalogue and reports it.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		const linear = await within(menu).findByRole("button", {
			name: "Linear Connected",
		})
		await expect(linear).toHaveAttribute("aria-current", "page")
		await expect(
			entryIn(menu, "GitHub Needs authorization"),
		).not.toHaveAttribute("aria-current")
		await expect(entryIn(menu, "Applications")).not.toHaveAttribute(
			"aria-current",
		)
		await expect(entryIn(menu, "Applications")).toHaveAttribute("data-open")
		await expect(
			slotIn(
				entryIn(menu, "GitHub Needs authorization"),
				"settings-menu-connection",
			),
		).toHaveAttribute("data-connection", "needsAuthorization")

		const main = screen.getByRole("main")
		const name = within(main).getByRole("heading", {
			level: 2,
			name: "Linear",
		})
		await expect(name).toBeVisible()
		await expect(within(main).getAllByText("Linear")).toHaveLength(1)
		await expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth)
		await expect(within(main).queryByRole("tab")).toBeNull()
		await expectSettingsPage(main, "Applications", "column")

		await userEvent.click(entryIn(menu, "GitHub Needs authorization"))
		await expect(args.onMcpServerOpen).toHaveBeenLastCalledWith("github")
		await waitFor(() =>
			expect(
				within(main).getByRole("heading", { level: 2, name: "GitHub" }),
			).toBeVisible(),
		)

		await userEvent.click(entryIn(menu, "Add an application"))
		await expect(args.mcpCatalogue?.onOpen).toHaveBeenCalledOnce()
	},
})

export const BackToTheApplicationsList = meta.story({
	args: LINEAR_OPEN,
	parameters: {
		docs: {
			description: {
				story:
					"`LinearApplication`, then Applications pressed again. Check that the application page closes, the closing is reported, and Applications becomes the current page over the list.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		await within(menu).findByRole("button", { name: "Linear Connected" })

		await userEvent.click(entryIn(menu, "Applications"))
		await expect(args.onMcpServerOpen).toHaveBeenLastCalledWith(null)
		await waitFor(() =>
			expect(entryIn(menu, "Applications")).toHaveAttribute(
				"aria-current",
				"page",
			),
		)
		await expect(
			within(screen.getByRole("main")).getByRole("heading", {
				level: 2,
				name: "Applications",
			}),
		).toBeVisible()
	},
})

export const LeavingUnsavedApplicationEdits = meta.story({
	args: LINEAR_OPEN,
	parameters: {
		docs: {
			description: {
				story:
					"`LinearApplication` with an edit not yet saved, then Members picked in the menu. Check that the screen asks with the dialog's own leave wording, that Cancel keeps the page, the edit and the menu selection, and that Leave goes to Members.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		const main = screen.getByRole("main")
		const linear = await within(menu).findByRole("button", {
			name: "Linear Connected",
		})
		const field = within(main).getByLabelText("Name")
		await userEvent.type(field, "-desk")

		await userEvent.click(entryIn(menu, "Members"))
		const question = await screen.findByRole("alertdialog", {
			name: "Leave without saving?",
		})
		await userEvent.click(
			within(question).getByRole("button", { name: "Cancel" }),
		)
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
		await expect(field).toHaveValue("linear-desk")
		await expect(linear).toHaveAttribute("aria-current", "page")
		await expect(entryIn(menu, "Members")).not.toHaveAttribute("aria-current")
		await expect(args.onEntryChange).not.toHaveBeenCalled()

		await userEvent.click(entryIn(menu, "Members"))
		await userEvent.click(
			within(
				await screen.findByRole("alertdialog", {
					name: "Leave without saving?",
				}),
			).getByRole("button", { name: "Leave" }),
		)
		await expect(args.onEntryChange).toHaveBeenLastCalledWith("members")
		await waitFor(() =>
			expect(entryIn(menu, "Members")).toHaveAttribute("aria-current", "page"),
		)
		await expect(
			within(main).getByRole("heading", { level: 2, name: "Members" }),
		).toBeVisible()
	},
})

export const LeavingUnsavedApplicationEditsByTheRail = meta.story({
	args: LINEAR_OPEN,
	parameters: {
		docs: {
			description: {
				story:
					"`LinearApplication` with an edit not yet saved, then the rail's Space settings gear pressed. Check that the screen asks with the dialog's own leave wording before the rail navigates, and that Leave drops the edit and runs the rail's navigation once.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		const rail = await railIn()
		const main = screen.getByRole("main")
		await within(menu).findByRole("button", { name: "Linear Connected" })
		await userEvent.type(within(main).getByLabelText("Name"), "-desk")

		await userEvent.click(
			within(rail).getByRole("button", { name: "Space settings" }),
		)
		const question = await screen.findByRole("alertdialog", {
			name: "Leave without saving?",
		})
		await expect(RAIL_PRESSES.onOpenSpaceSettings).not.toHaveBeenCalled()

		await userEvent.click(
			within(question).getByRole("button", { name: "Leave" }),
		)
		await expect(RAIL_PRESSES.onOpenSpaceSettings).toHaveBeenCalledTimes(1)
		await waitFor(() =>
			expect(within(main).queryByLabelText("Name")).toBeNull(),
		)
		await expect(args.onEntryChange).not.toHaveBeenCalled()
	},
})

export const LeavingUnsavedApplicationEditsBySwitchingSpace = meta.story({
	args: LINEAR_OPEN,
	parameters: {
		docs: {
			description: {
				story:
					"`LinearApplication` with an edit not yet saved, then another Space picked in the title bar's switcher. Check that the screen asks with the same leave wording the rail and Back use before the Space changes, that Cancel keeps the Space, and that Leave switches to the picked Space once.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const menu = await menuIn()
		const main = screen.getByRole("main")
		const switcher = slotIn(
			slotIn(canvasElement, "app-title-bar"),
			"space-switcher",
		)
		await within(menu).findByRole("button", { name: "Linear Connected" })
		await userEvent.type(within(main).getByLabelText("Name"), "-desk")

		const pickGarage = async () => {
			await userEvent.click(switcher)
			await userEvent.click(
				await screen.findByRole("menuitemradio", { name: /Garage/ }),
			)
			return screen.findByRole("alertdialog", {
				name: "Leave without saving?",
			})
		}

		await userEvent.click(
			within(await pickGarage()).getByRole("button", { name: "Cancel" }),
		)
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
		await expect(args.titleBar?.onSelectSpace).not.toHaveBeenCalled()

		await userEvent.click(
			within(await pickGarage()).getByRole("button", { name: "Leave" }),
		)
		await expect(args.titleBar?.onSelectSpace).toHaveBeenCalledTimes(1)
		await expect(args.titleBar?.onSelectSpace).toHaveBeenCalledWith(GARAGE.id)
	},
})

export const LeavesByTheRailWithNothingUnsaved = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Members with nothing unsaved, then each rail entry pressed in turn: Conversations, Missions, the Space settings gear and the avatar. Check that none asks and each runs its navigation at once.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const rail = await railIn()
		const presses = [
			["Conversations", RAIL_PRESSES.onSelectConversations],
			["Missions", RAIL_PRESSES.onSelectMissions],
			["Space settings", RAIL_PRESSES.onOpenSpaceSettings],
			["Ada Martin", RAIL_PRESSES.onOpenYou],
		] as const

		for (const [name, navigation] of presses) {
			await userEvent.click(within(rail).getByRole("button", { name }))
			await expect(screen.queryByRole("alertdialog")).toBeNull()
			await expect(navigation).toHaveBeenCalledTimes(1)
		}
	},
})

export const LeavesASavedApplicationBehind = meta.story({
	args: LINEAR_OPEN,
	parameters: {
		docs: {
			description: {
				story:
					"`LinearApplication` with nothing unsaved, then Members, then Applications again. Check that leaving asks nothing and closes the application page, so Applications comes back on its list rather than on Linear.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const menu = await menuIn()
		await within(menu).findByRole("button", { name: "Linear Connected" })

		await userEvent.click(entryIn(menu, "Members"))
		await expect(screen.queryByRole("alertdialog")).toBeNull()
		await userEvent.click(entryIn(menu, "Applications"))

		const main = screen.getByRole("main")
		await waitFor(() =>
			expect(
				within(main).getByRole("heading", { level: 2, name: "Applications" }),
			).toBeVisible(),
		)
		await expect(entryIn(menu, "Applications")).toHaveAttribute(
			"aria-current",
			"page",
		)
		await expect(entryIn(menu, "Linear Connected")).not.toHaveAttribute(
			"aria-current",
		)
	},
})

const artboardCompanions = (count: number) => ({
	companions: SPACE_COMPANIONS.slice(0, count),
	onSelect: fn(),
	onCreate: fn(),
})

const ARTBOARD_MENU = [
	"Space",
	"Members",
	"Companions",
	"Secrets",
	"Skills",
	"Applications",
	"History",
]

const JOINED_ARGS = {
	entry: "space",
	value: { name: "Northwind", colour: "green" },
	companions: artboardCompanions(3),
	spaceState: "joined",
	host: "http://192.168.1.24:45367",
	hostName: "Sam Rivera",
	rank: 3,
	onOpen: fn(),
	onLeave: fn(),
	onDelete: undefined,
	isShared: undefined,
} as const

const INK = {
	foreground: "rgb(245, 245, 245)",
	muted: "rgb(163, 163, 163)",
	soft: "rgb(212, 212, 212)",
	destructive: "oklch(0.704 0.191 22.216)",
	online: "rgb(63, 180, 102)",
	offline: "rgb(115, 115, 115)",
	card: "rgb(18, 18, 19)",
	none: "rgba(0, 0, 0, 0)",
}

const TINT = {
	purple: "rgb(188, 175, 227)",
	green: "rgb(175, 201, 155)",
	orange: "rgb(242, 181, 126)",
	yellow: "rgb(242, 200, 121)",
}

type PinnedInk = {
	label: string
	icon: string
}

const DANGER_INK: PinnedInk = { label: INK.destructive, icon: INK.destructive }

const QUIET_INK: PinnedInk = { label: INK.soft, icon: INK.muted }

type ArtboardMenu = {
	kind: string
	subtitle: string
	entries: string[]
	pinned: string
	pinnedInk: PinnedInk
	tint: string
	isInvitation?: boolean
}

type ArtboardType = {
	size: string
	leading: string
	weight: string
	ink: string
}

const expectType = async (
	element: Element,
	{ size, leading, weight, ink }: ArtboardType,
) => {
	const style = getComputedStyle(element)
	await expect([
		style.fontSize,
		style.lineHeight,
		style.fontWeight,
		style.color,
	]).toEqual([size, leading, weight, ink])
}

const iconOf = (element: Element) => {
	const icon = element.querySelector("svg")
	if (!icon) throw new Error("The entry lost its icon")
	return getComputedStyle(icon)
}

type ArtboardSquare = {
	area: HTMLElement
	size: number
	radius: string
	tint: string
	isInvitation: boolean
}

const expectSquare = async ({
	area,
	size,
	radius,
	tint,
	isInvitation,
}: ArtboardSquare) => {
	const square = slotIn(area, "space-dot")
	const box = square.getBoundingClientRect()
	await expect([box.width, box.height]).toEqual([size, size])
	await expect(getComputedStyle(square).borderRadius).toBe(radius)
	await expect(getComputedStyle(square).backgroundColor).toBe(
		isInvitation ? INK.none : tint,
	)
	if (!isInvitation) return
	const outline = getComputedStyle(slotIn(square, "space-invitation-outline"))
	await expect([outline.borderTopStyle, outline.borderTopColor]).toEqual([
		"dashed",
		tint,
	])
}

const expectArtboard = async ({
	kind,
	subtitle,
	entries,
	pinned,
	pinnedInk,
	tint,
	isInvitation = false,
}: ArtboardMenu) => {
	const menu = await menuIn()
	await expect(menuNames(menu)).toEqual([
		"Back to your settings",
		...entries,
		pinned,
	])
	const main = screen.getByRole("main")
	await expect(slotIn(main, "focused-space-standing")).toHaveTextContent(
		subtitle,
	)

	const back = entryIn(menu, "Back to your settings")
	await expect(getComputedStyle(back).alignSelf).toBe("flex-start")
	await expect(iconOf(back).strokeWidth).toBe("2px")

	const identity = slotIn(menu, "settings-menu-header")
	await expect(getComputedStyle(identity).columnGap).toBe("10px")
	await expectType(slotIn(identity, "settings-menu-name"), {
		size: "14px",
		leading: "20px",
		weight: "600",
		ink: INK.foreground,
	})
	await expectType(within(identity).getByText(kind), {
		size: "12px",
		leading: "16px",
		weight: "400",
		ink: INK.muted,
	})
	await expectSquare({
		area: identity,
		size: 36,
		radius: "11px",
		tint,
		isInvitation,
	})
	await expectSquare({
		area: slotIn(main, "focused-space-header"),
		size: 48,
		radius: "13px",
		tint,
		isInvitation,
	})

	const foot = entryIn(menu, pinned)
	await expectType(foot, {
		size: "14px",
		leading: "20px",
		weight: "400",
		ink: pinnedInk.label,
	})
	const footIcon = iconOf(foot)
	await expect([footIcon.stroke, footIcon.strokeWidth]).toEqual([
		pinnedInk.icon,
		"1.8px",
	])
	return { menu, main }
}

const hostDotsIn = (menu: HTMLElement, main: HTMLElement) =>
	[menu, main].map((area) =>
		area.querySelector("[data-slot=host-dot]")?.getAttribute("data-host"),
	)

const expectHostDots = async (
	menu: HTMLElement,
	main: HTMLElement,
	ink: string,
) => {
	for (const [area, size] of [
		[menu, 10],
		[main, 14],
	] as const) {
		const dot = slotIn(area, "host-dot")
		await expect(dot.getBoundingClientRect().width).toBe(size)
		await expect(getComputedStyle(dot).backgroundColor).toBe(ink)
		await expect(getComputedStyle(dot).boxShadow).toContain(
			`${INK.card} 0px 0px 0px 2px`,
		)
	}
	const menuDot = getComputedStyle(slotIn(menu, "host-dot"))
	await expect([menuDot.insetInlineEnd, menuDot.bottom]).toEqual([
		"-3px",
		"-3px",
	])
}

const expectHeaderButton = async (button: HTMLElement) => {
	await expectType(button, {
		size: "13px",
		leading: "16px",
		weight: "500",
		ink: "rgb(0, 0, 0)",
	})
	await expect(getComputedStyle(button).columnGap).toBe("8px")
}

const YOURS_NOT_SHARED = {
	entry: "space",
	value: { name: "Release desk", colour: "blue" },
	companions: artboardCompanions(2),
	isShared: false,
	rank: 2,
	onOpen: fn(),
	onShare: fn(),
} as const

export const YoursNotShared = meta.story({
	globals: { theme: "dark" },
	args: {
		...YOURS_NOT_SHARED,
		value: { name: "Field notes", colour: "purple" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"Artboard F02: a space of yours, not shared yet. Check the Space header bar over the centred column, then the space's own header with the colour square, the name, Yours · not shared and Open ⌘2, Companions counting 2, then the Name field, then the Not shared yet card with Share, Danger zone pinned at the foot, and no presence dot on either square.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const { menu, main } = await expectArtboard({
			kind: "Space settings",
			subtitle: "Yours · not shared",
			entries: ARTBOARD_MENU.map((label) =>
				label === "Companions" ? "Companions2" : label,
			),
			pinned: "Danger zone",
			pinnedInk: DANGER_INK,
			tint: TINT.purple,
		})
		await expect(entryIn(menu, "Space")).toHaveAttribute("aria-current", "page")
		await expectSettingsPage(main, "Space", "column")
		await expect(hostDotsIn(menu, main)).toEqual([undefined, undefined])
		await expect(iconOf(entryIn(menu, "Members")).strokeWidth).toBe("1.8px")
		await expect(
			within(main).getByRole("heading", { level: 2, name: "Field notes" }),
		).toBeVisible()
		await expect(within(main).getByLabelText("Name")).not.toHaveAttribute(
			"readonly",
		)

		const standing = slotIn(main, "focused-space-standing")
		await expect(
			getComputedStyle(standing.parentElement as HTMLElement).rowGap,
		).toBe("2px")
		const nameField = within(main).getByLabelText("Name")
		await expect(
			getComputedStyle(nameField.parentElement as HTMLElement).rowGap,
		).toBe("8px")

		const open = within(main).getByRole("button", { name: "Open ⌘2" })
		await expect(getComputedStyle(open).transitionProperty).toBe("none")
		await expectHeaderButton(open)
		await expect(
			getComputedStyle(within(open).getByText("⌘2")).fontWeight,
		).toBe("400")
		await userEvent.click(open)
		await expect(args.onOpen).toHaveBeenCalledOnce()

		const card = slotIn(main, "not-shared-card")
		await expect(card).toHaveTextContent(
			"Share Field notes to invite people. Deleting it lives in Danger zone.",
		)
		const share = within(card).getByRole("button", { name: "Share" })
		await expect(getComputedStyle(share).lineHeight).toBe("16px")
		await userEvent.click(share)
		await expect(args.onShare).toHaveBeenCalledOnce()
	},
})

export const SpaceFormPage = meta.story({
	globals: LAPTOP_WINDOW,
	args: YOURS_NOT_SHARED,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to see a form page in a laptop window: the Space page of a space of yours, not shared yet. Check the Space header bar, then the space's own header and its Name field in a column centred and capped at 800px, its first row where a conversation's first message starts. Pick `SpaceCompanions` for a list page. The screen in a 1280 by 800 window, the size the review screenshot is taken at.",
			},
		},
	},
	play: async () => {
		await expectLaptopWindow()
		await menuIn()
		await expectSettingsPage(screen.getByRole("main"), "Space", "column")
	},
})

export const SpaceCompanions = meta.story({
	globals: LAPTOP_WINDOW,
	args: {
		...YOURS_NOT_SHARED,
		entry: "companions",
		companions: artboardCompanions(SPACE_COMPANIONS.length),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to see a list page in a laptop window: the companions of a space. Check the Companions header bar, then the section title and the cards across the whole card, the first row where a conversation's first message starts. Pick `SpaceFormPage` for a form page. The screen in a 1280 by 800 window, the size the review screenshot is taken at.",
			},
		},
	},
	play: async () => {
		await expectLaptopWindow()
		await menuIn()
		await expectSettingsPage(screen.getByRole("main"), "Companions", "full")
	},
})

export const JoinedHostOnline = meta.story({
	globals: { theme: "dark" },
	args: { ...JOINED_ARGS, isConnected: true },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard F03: a space joined from Sam Rivera, whose computer is online. Check Joined · hosted by Sam Rivera, Companions counting 3, a green presence dot on both squares, a Name field that reads the name without letting it change, no card, and Leave space pinned at the foot, asking before it leaves.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const { menu, main } = await expectArtboard({
			kind: "Space settings",
			subtitle: "Joined · hosted by Sam Rivera",
			entries: ARTBOARD_MENU.map((label) =>
				label === "Companions" ? "Companions3" : label,
			),
			pinned: "Leave space",
			pinnedInk: DANGER_INK,
			tint: TINT.green,
		})
		await expect(hostDotsIn(menu, main)).toEqual(["up", "up"])
		await expectHostDots(menu, main, INK.online)
		await expect(within(main).getByLabelText("Name")).toHaveAttribute(
			"readonly",
		)
		await expect(
			main.querySelector("[data-slot=not-shared-card]"),
		).not.toBeInTheDocument()
		await userEvent.click(within(main).getByRole("button", { name: "Open ⌘3" }))
		await expect(args.onOpen).toHaveBeenCalledOnce()

		await userEvent.click(entryIn(menu, "Leave space"))
		const question = await screen.findByRole("alertdialog", {
			name: "Leave Northwind?",
		})
		await userEvent.click(
			within(question).getByRole("button", { name: "Leave space" }),
		)
		await expect(args.onLeave).toHaveBeenCalledOnce()
	},
})

export const JoinedHostNotConnected = meta.story({
	globals: { theme: "dark" },
	args: {
		...JOINED_ARGS,
		value: { name: "Harbor", colour: "orange" },
		hostName: "Jordan Lee",
		isConnected: false,
		rank: 4,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Artboard F04: a space joined from Jordan Lee, whose computer isn't connected. Check · Not connected after the host, a grey presence dot, the header alone with no Name field, every entry but Space dimmed, out of the tab order and announced as disabled with its count hidden, and Leave space still reachable.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const { menu, main } = await expectArtboard({
			kind: "Space settings",
			subtitle: "Joined · hosted by Jordan Lee · Not connected",
			entries: ARTBOARD_MENU,
			pinned: "Leave space",
			pinnedInk: DANGER_INK,
			tint: TINT.orange,
		})
		await expect(hostDotsIn(menu, main)).toEqual(["down", "down"])
		await expectHostDots(menu, main, INK.offline)

		const standing = slotIn(main, "focused-space-standing")
		await expect(
			getComputedStyle(standing.parentElement as HTMLElement).rowGap,
		).toBe("2px")
		const open = within(main).getByRole("button", { name: "Open ⌘4" })
		await expect(getComputedStyle(open).columnGap).toBe("8px")
		await expect(getComputedStyle(within(open).getByText("⌘4")).color).toBe(
			"color(srgb 0.384314 0.384314 0.384314)",
		)
		await expect(within(main).queryByLabelText("Name")).not.toBeInTheDocument()
		for (const label of ARTBOARD_MENU.slice(1)) {
			const entry = entryIn(menu, label)
			await expect(entry).toBeDisabled()
			await expect(getComputedStyle(entry).opacity).toBe("0.4")
		}
		await expect(getComputedStyle(entryIn(menu, "Leave space")).opacity).toBe(
			"1",
		)

		entryIn(menu, "Back to your settings").focus()
		await userEvent.tab()
		await expect(entryIn(menu, "Space")).toHaveFocus()
		await userEvent.tab()
		await expect(entryIn(menu, "Leave space")).toHaveFocus()
	},
})

export const JoinedSessionUnavailable = meta.story({
	globals: { theme: "dark" },
	args: {
		...JOINED_ARGS,
		entry: "environment",
		isConnected: true,
		isSessionUnavailable: true,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A space joined from Steve, whose computer is online, that isn't the current space: no session reads its Secrets, Skills, Applications or History. Check those four entries dimmed, out of the tab order and announced as disabled with their count hidden, Secrets asked for yet the Space page shown, and Members, Companions and Leave space still reachable.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const { menu } = await expectArtboard({
			subtitle: "Joined · hosted by Steve",
			entries: ARTBOARD_MENU.map((label) =>
				label === "Companions" ? "Companions4" : label,
			),
			pinned: "Leave space",
		})
		for (const label of ["Secrets", "Skills", "Applications", "History"]) {
			const entry = entryIn(menu, label)
			await expect(entry).toBeDisabled()
			await expect(getComputedStyle(entry).opacity).toBe("0.4")
		}
		for (const label of ["Space", "Members", "Companions 4"]) {
			await expect(entryIn(menu, label)).toBeEnabled()
		}

		entryIn(menu, "Back to your settings").focus()
		for (const label of ["Space", "Members", "Companions 4", "Leave space"]) {
			await userEvent.tab()
			await expect(entryIn(menu, label)).toHaveFocus()
		}
	},
})

export const Invitation = meta.story({
	globals: { theme: "dark" },
	args: {
		entry: "space",
		value: { name: "Atelier", colour: "yellow" },
		spaceState: "invitation",
		invitation: {
			hostEmail: "priya@example.com",
			expiresAt: new Date(2026, 10, 2).getTime(),
		},
		onAccept: fn(),
		onDecline: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Artboard F06: an invitation to a space. Check that the menu holds one selected Invitation entry with Decline pinned at the foot, that both squares are dashed in the space's colour without a presence dot, and that the header reads who invited you and when it expires beside Accept.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const { menu, main } = await expectArtboard({
			kind: "Invitation",
			subtitle: "Invitation from priya@example.com · Expires Nov 2",
			entries: ["Invitation"],
			pinned: "Decline",
			pinnedInk: QUIET_INK,
			tint: TINT.yellow,
			isInvitation: true,
		})
		await expect(entryIn(menu, "Invitation")).toHaveAttribute(
			"aria-current",
			"page",
		)
		await expect(hostDotsIn(menu, main)).toEqual([undefined, undefined])
		await expect(slotIn(menu, "space-invitation-outline")).toBeVisible()
		await expect(slotIn(main, "space-invitation-outline")).toBeVisible()

		const accept = within(main).getByRole("button", { name: "Accept" })
		await expectHeaderButton(accept)
		await userEvent.click(accept)
		await expect(args.onAccept).toHaveBeenCalledOnce()
		await userEvent.click(entryIn(menu, "Decline"))
		await expect(args.onDecline).toHaveBeenCalledOnce()
	},
})

export const ByKeyboard = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The menu driven from the keyboard. Check that Tab walks Back to your settings then each entry in order, each drawing the focus ring, and that Enter opens the focused entry.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		entryIn(menu, "Back to your settings").focus()

		await userEvent.tab()
		const space = entryIn(menu, "Space")
		await expect(space).toHaveFocus()
		await expect(getComputedStyle(space).boxShadow).not.toBe("none")

		await userEvent.tab()
		await userEvent.tab()
		await expect(entryIn(menu, "Secrets")).toHaveFocus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onEntryChange).toHaveBeenLastCalledWith("environment")
		await expect(entryIn(menu, "Secrets")).toHaveAttribute(
			"aria-current",
			"page",
		)
	},
})

export const ShortWindow = meta.story({
	parameters: {
		viewport: {
			options: {
				short: { name: "Short", styles: { width: "1024px", height: "360px" } },
			},
		},
		docs: {
			description: {
				story:
					"A window too short for every entry. Check that the entries scroll inside the menu while Danger zone stays pinned and visible at its foot.",
			},
		},
	},
	globals: { viewport: { value: "short" } },
	play: async () => {
		const menu = await menuIn()
		const entries = slotIn(menu, "settings-menu-entries")
		await waitFor(() =>
			expect(entries.scrollHeight).toBeGreaterThan(entries.clientHeight),
		)
		const danger = entryIn(menu, "Danger zone").getBoundingClientRect()
		await expect(danger.bottom).toBeLessThanOrEqual(
			menu.getBoundingClientRect().bottom,
		)
		await expect(danger.top).toBeGreaterThanOrEqual(
			entries.getBoundingClientRect().bottom,
		)
	},
})

export const LongName = meta.story({
	args: {
		value: {
			name: "The quarterly release desk for every product line we ship",
			colour: "pink",
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A space name far wider than the menu. Check that it stays on one line, cut with an ellipsis, and the avatar keeps its size.",
			},
		},
	},
	play: async () => {
		const menu = await menuIn()
		const name = slotIn(menu, "settings-menu-name")
		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(getComputedStyle(name).whiteSpace).toBe("nowrap")
		await expect(getComputedStyle(name).textOverflow).toBe("ellipsis")
		await expect(slotIn(menu, "space-dot").getBoundingClientRect().width).toBe(
			36,
		)
	},
})

export const DefaultWidth = meta.story({
	args: { width: SIDEBAR_DEFAULT_WIDTH },
	parameters: {
		docs: {
			description: {
				story:
					"Artboards E2 and E3: the space's settings at the panel width the conversations screen opens with. Check that the 34px title bar carries the window controls reserve and the Space switcher at the place the conversations screen draws them, that the 60px rail follows, and that the menu panel is 304px wide with the conversations panel's end separator. Pick `MinimumWidth` or `MaximumWidth` for a reader who resized the panel.",
			},
		},
	},
	play: ({ canvasElement }) =>
		expectSettingsChrome(canvasElement, SIDEBAR_DEFAULT_WIDTH),
})

export const MinimumWidth = meta.story({
	args: { width: SIDEBAR_MIN_WIDTH },
	parameters: {
		docs: {
			description: {
				story:
					"`DefaultWidth` after the reader narrowed the conversations panel as far as it goes. Check that the menu panel follows it down to 224px and the title bar and rail do not move.",
			},
		},
	},
	play: ({ canvasElement }) =>
		expectSettingsChrome(canvasElement, SIDEBAR_MIN_WIDTH),
})

export const MaximumWidth = meta.story({
	args: { width: SIDEBAR_MAX_WIDTH },
	parameters: {
		docs: {
			description: {
				story:
					"`DefaultWidth` after the reader widened the conversations panel as far as it goes. Check that the menu panel follows it up to 416px and the title bar and rail do not move.",
			},
		},
	},
	play: ({ canvasElement }) =>
		expectSettingsChrome(canvasElement, SIDEBAR_MAX_WIDTH),
})
