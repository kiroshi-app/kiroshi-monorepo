import { type ComponentType, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	expectClickModifiers,
	expectLaptopWindow,
	expectRailSpaceHost,
	expectSettingsChrome,
	expectSettingsMenuLeftColumn,
	expectSettingsPage,
	LAPTOP_WINDOW,
	middleClick,
	RAIL_SPACE_HOST,
	rightClick,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	STUDIO,
	TITLE_BAR,
} from "@workspace/ui/components/app-title-bar.fixtures"
import {
	endNotice,
	NoticeSurface,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { MARKED_APPLICATIONS } from "@workspace/ui/components/plugin-settings/applications.fixtures"
import {
	HISTORY_DAYS,
	HISTORY_OLDEST_DATE,
} from "@workspace/ui/components/plugin-settings/history.fixtures"
import { BOT_SKILLS } from "@workspace/ui/components/plugin-settings/skills.fixtures"
import {
	SettingsScreen,
	type UserSettingsScreenProps,
	type UserSpace,
} from "@workspace/ui/components/settings-screen"
import {
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_MAX_WIDTH,
	SIDEBAR_MIN_WIDTH,
} from "@workspace/ui/components/sidebar-resize"
import {
	type ClickModifiers,
	NO_CLICK_MODIFIERS,
} from "@workspace/ui/lib/click-modifiers"

const USER_MENU = [
	"Account",
	"Appearance",
	"Notifications",
	"Language",
	"Skills",
	"Applications",
	"History",
	"Diagnostics",
	"About",
]

const UserSettingsScreen =
	SettingsScreen as ComponentType<UserSettingsScreenProps>

const ScreenHost = (props: UserSettingsScreenProps) => {
	const [entry, setEntry] = useState(props.entry)
	const [value, setValue] = useState(props.value)
	const [language, setLanguage] = useState(props.language)

	return (
		<UserSettingsScreen
			{...props}
			entry={entry}
			language={language}
			onEntryChange={(next, modifiers) => {
				setEntry(next)
				props.onEntryChange(next, modifiers)
			}}
			onLanguageChange={(next) => {
				setLanguage(next)
				props.onLanguageChange(next)
			}}
			onValueChange={(next) => {
				setValue(next)
				props.onValueChange(next)
			}}
			value={value}
		/>
	)
}

const RAIL_PRESSES = {
	onSelectConversations: fn(),
	onSelectMissions: fn(),
	onOpenSpaceSettings: fn(),
	onOpenYou: fn(),
}

const RAIL: UserSettingsScreenProps["rail"] = {
	...RAIL_PRESSES,
	selected: "conversations",
	user: { name: "Ada Martin" },
}

const USER_ARGS = {
	target: "user",
	entry: "account",
	onEntryChange: fn(),
	onBack: fn(),
	rail: RAIL,
	titleBar: TITLE_BAR,
	value: { name: "Ada Martin", colorScheme: "system" },
	onValueChange: fn(),
	language: null,
	onLanguageChange: fn(),
	skills: BOT_SKILLS,
	onSkillCreate: fn(),
	onSkillChange: fn(),
	onSkillPreloadedChange: fn(),
	onSkillDelete: fn(),
	applications: {
		servers: MARKED_APPLICATIONS,
		onServerCreate: fn(),
		onServerChange: fn(),
		onServerDelete: fn(),
	},
	account: {
		account: {
			status: "signedIn",
			name: "Ada Martin",
			email: "ada.martin@example.com",
			plan: "pro",
		},
		onSignIn: fn(),
		onCancel: fn(),
		onCopySignInLink: fn(),
		onManageAccount: fn(),
		onSignOut: fn(),
	},
	diagnostics: {
		onDiagnosticsCopy: fn(),
		onLogReveal: fn(),
		onLogClear: fn(),
	},
	about: {
		version: "0.23.3",
		channel: "stable",
		update: { status: "available", version: "0.24.0" },
		showsWhatsNew: true,
		onChannelChange: fn(),
		onShowsWhatsNewChange: fn(),
		onCheck: fn(),
		onDownload: fn(),
		onRestart: fn(),
		onWhatsNew: fn(),
		onReleaseNotes: fn(),
	},
	history: {
		days: HISTORY_DAYS,
		oldestDate: HISTORY_OLDEST_DATE,
		onUndo: fn(),
	},
} satisfies UserSettingsScreenProps

const menuIn = () => screen.findByRole("navigation", { name: "Settings" })

const groupIn = (menu: HTMLElement, title: string) =>
	within(menu).getByRole("list", { name: title })

const entriesIn = (menu: HTMLElement) =>
	within(groupIn(menu, "Settings"))
		.getAllByRole("button")
		.map((button) => button.textContent)

const spaceRowsIn = (menu: HTMLElement) =>
	within(groupIn(menu, "Spaces")).queryAllByRole("button")

const spaceRowOf = (menu: HTMLElement, name: string) =>
	within(groupIn(menu, "Spaces")).getByRole("button", {
		name: new RegExp(`^${name}`),
	})

const NORTHWIND = {
	id: "northwind",
	name: "Northwind",
	colour: "green",
	avatarSeed: "northwind",
	hasAttention: true,
} satisfies UserSpace

const SPACES_ARGS = {
	entry: "",
	ownedSpaces: [
		{ ...STUDIO, colour: "blue", host: "shared" },
		{
			id: "field-notes",
			name: "Field notes",
			colour: "purple",
			avatarSeed: "field-notes",
		},
	],
	joinedSpaces: [
		NORTHWIND,
		{
			id: "harbor",
			name: "Harbor",
			colour: "orange",
			avatarSeed: "harbor",
			host: "down",
		},
	],
	invitations: [{ id: "atelier", name: "Atelier", avatarSeed: "atelier" }],
	currentSpaceId: STUDIO.id,
	onOpenSpace: fn(),
	onCreateSpace: fn(),
} satisfies Partial<UserSettingsScreenProps>

const COLOUR_TRANSITIONS = /color|background|all/

const expectNoColourTransition = (element: HTMLElement) => {
	const { transitionProperty, transitionDuration } = getComputedStyle(element)
	const durations = transitionDuration.split(", ")
	const animated = transitionProperty
		.split(", ")
		.filter((_, index) => durations[index % durations.length] !== "0s")
	return expect(animated.join(" ")).not.toMatch(COLOUR_TRANSITIONS)
}

const expectSpaceRows = async (menu: HTMLElement, names: string[]) => {
	await expect(
		slotsIn(groupIn(menu, "Spaces"), "roster-row-name").map(
			(name) => name.textContent,
		),
	).toEqual(names)
	await expect(
		slotIn(spaceRowOf(menu, "Studio"), "space-avatar").dataset.state,
	).toBe("shared")
	await expect(
		slotIn(spaceRowOf(menu, "Harbor"), "space-avatar").dataset.state,
	).toBe("offline")
	await expect(slotsIn(groupIn(menu, "Spaces"), "host-pill")).toHaveLength(0)
	await expect(spaceRowOf(menu, "Studio")).toHaveAttribute(
		"aria-current",
		"true",
	)
	await expect(
		slotIn(spaceRowOf(menu, "Studio"), "settings-menu-space-current"),
	).toHaveTextContent("Open now")
	await expect(
		slotIn(spaceRowOf(menu, "Atelier"), "settings-menu-space-invitation-pill"),
	).toHaveTextContent("Invitation")
	await expect(
		slotIn(spaceRowOf(menu, "Atelier"), "space-avatar").dataset.state,
	).toBe("invitation")
	await expect(
		slotsIn(groupIn(menu, "Spaces"), "settings-menu-space-current"),
	).toHaveLength(1)
	for (const pill of [
		slotIn(spaceRowOf(menu, "Studio"), "settings-menu-space-current"),
		slotIn(spaceRowOf(menu, "Atelier"), "settings-menu-space-invitation-pill"),
	]) {
		await expect(getComputedStyle(pill).padding).toBe("3px 6px")
	}
	for (const { name, colour } of [
		...SPACES_ARGS.ownedSpaces,
		...SPACES_ARGS.joinedSpaces,
	].filter((space) => names.includes(space.name))) {
		await expect(
			slotIn(spaceRowOf(menu, name), "space-avatar").dataset.colour,
		).toBe(colour)
	}
}

const FULL_PAGES = new Set(["Skills", "Applications", "History"])

const expectEntryShown = async (label: string) => {
	const menu = await menuIn()
	await expect(
		within(menu).getByRole("button", { name: label }),
	).toHaveAttribute("aria-current", "page")
	await expectSettingsPage(
		screen.getByRole("main"),
		label,
		FULL_PAGES.has(label) ? "full" : "column",
	)
	return menu
}

const meta = preview.meta({
	title: "Settings/User/SettingsScreen",
	component: UserSettingsScreen,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The reader's own settings as a whole window instead of an overlay. The settings menu takes the place of the conversations panel: Back to conversations, the reader's round initials avatar and name, then Account, Appearance, Notifications, Language, Skills, Applications, History, Diagnostics and About, each optional entry shown under the same condition as in the user settings dialog. The content column draws the same panels the dialog draws. Each page sits under a header bar the height of a conversation's header carrying the entry's label, its first row where a conversation's first message starts: forms in a column centred and capped at 800px, lists across the whole card. Skills, Applications and History are lists.",
			},
		},
	},
	args: USER_ARGS,
	render: (args) => <ScreenHost {...args} />,
})

export const Account = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Artboard E4: the reader's settings open on Account. Check the menu order, the round initials avatar beside the name and User settings, Account marked as the current page under its title, and the accent dot on About while an update waits.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await expectEntryShown("Account")
		await expect(entriesIn(menu)).toEqual(USER_MENU)
		await expect(spaceRowsIn(menu)).toHaveLength(0)
		await expect(
			within(menu).getByRole("button", { name: "Create a space" }),
		).toBeVisible()
		await expect(slotIn(menu, "user-avatar")).toBeVisible()
		await expect(within(menu).getByText("User settings")).toBeVisible()
		await expect(
			slotsIn(
				within(menu).getByRole("button", { name: "About" }),
				"settings-menu-indicator",
			),
		).toHaveLength(1)
		await expect(
			within(screen.getByRole("main")).getByText("ada.martin@example.com"),
		).toBeVisible()

		await userEvent.click(
			within(menu).getByRole("button", { name: "Back to conversations" }),
		)
		await expect(args.onBack).toHaveBeenCalledOnce()
	},
})

export const Spaces = meta.story({
	args: SPACES_ARGS,
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Artboard F01: the menu in two titled groups, Settings then Spaces. The screen opens on Account when no entry is chosen. Check Studio marked current with its Open now pill and the shared dot on its avatar, Northwind ending on the attention dot, Harbor in greys with no state pill, Atelier's dashed outline and Invitation pill, and the + creating a space by pointer or keyboard. The contrast audit is left to review: the Invitation pill wears the warning token on its own tint as the artboard draws it, 2.96:1 in the light theme.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await expectEntryShown("Account")
		await expect(entriesIn(menu)).toEqual(USER_MENU)
		await expectSpaceRows(menu, [
			"Studio",
			"Field notes",
			"Northwind",
			"Harbor",
			"Atelier",
		])
		await expect(
			slotsIn(groupIn(menu, "Spaces"), "settings-menu-space-attention"),
		).toHaveLength(1)
		await expect(
			slotIn(spaceRowOf(menu, "Northwind"), "settings-menu-space-attention"),
		).toBeVisible()

		const create = within(menu).getByRole("button", { name: "Create a space" })
		create.focus()
		await expect(create).toHaveFocus()
		await expect(create.matches(":focus-visible")).toBe(true)
		await expect(getComputedStyle(create).boxShadow).not.toBe("none")
		await userEvent.keyboard("{Enter}")
		await expect(args.onCreateSpace).toHaveBeenCalledOnce()
		await userEvent.tab()
		await expect(spaceRowOf(menu, "Studio")).toHaveFocus()
		await userEvent.tab()
		await userEvent.keyboard("{Enter}")
		await expect(args.onOpenSpace).toHaveBeenLastCalledWith(
			"field-notes",
			NO_CLICK_MODIFIERS,
		)

		await userEvent.click(create)
		await expect(args.onCreateSpace).toHaveBeenCalledTimes(2)
		await userEvent.click(spaceRowOf(menu, "Northwind"))
		await expect(args.onOpenSpace).toHaveBeenLastCalledWith(
			"northwind",
			NO_CLICK_MODIFIERS,
		)

		for (const drawn of [
			create,
			...spaceRowsIn(menu),
			slotIn(menu, "settings-menu-space-current"),
			slotIn(menu, "settings-menu-space-invitation-pill"),
		])
			await expectNoColourTransition(drawn)
	},
})

export const OpensASpaceWithClickModifiers = meta.story({
	tags: ["test-only"],
	args: SPACES_ARGS,
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A Space row, then an invitation row, each clicked every way a host can tell apart with nothing unsaved to hold the leave. Check that the screen hands its caller the Space with the button and the keys of that click, middle with the keys held, Cmd, Ctrl or Shift alone, none on a plain click or Enter, and nothing on a right-click.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await expectEntryShown("Account")
		for (const [name, id] of [
			["Northwind", "northwind"],
			["Atelier", "atelier"],
		]) {
			await expectClickModifiers({
				target: spaceRowOf(menu, name),
				callback: args.onOpenSpace,
				reported: [id],
				userEvent,
			})
		}
	},
})

export const SpacesDark = meta.story({
	args: SPACES_ARGS,
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"`Spaces` in the dark theme. Check that each presence dot keeps its cut-out from the avatar and the Invitation pill stays legible on its warning tint.",
			},
		},
	},
})

const HOST_STATES_ARGS = {
	...SPACES_ARGS,
	ownedSpaces: [{ ...STUDIO, colour: "blue", host: "shared" }],
	joinedSpaces: [
		{
			id: "vocca",
			name: "Vocca",
			colour: "green",
			avatarSeed: "vocca",
			host: "up",
		},
		{
			id: "archives",
			name: "Archives",
			colour: "purple",
			avatarSeed: "archives",
			host: "connecting",
		},
		{
			id: "harbor",
			name: "Harbor",
			colour: "orange",
			avatarSeed: "harbor",
			host: "down",
		},
	],
	invitations: [],
} satisfies Partial<UserSettingsScreenProps>

const HOST_ROWS = [
	{ name: "Studio", state: "shared", label: "Shared" },
	{ name: "Vocca", state: "online", label: "Online" },
	{ name: "Archives", state: "connecting", label: "Connecting…" },
	{ name: "Harbor", state: "offline", label: "Not connected" },
]

const playHostStates = async () => {
	const menu = await menuIn()
	const spaces = groupIn(menu, "Spaces")
	const names = slotsIn(spaces, "roster-row-name")
	await expect(names.map((name) => name.textContent)).toEqual(
		HOST_ROWS.map(({ name }) => name),
	)
	for (const name of names) {
		await expect(name.getBoundingClientRect().width).toBeGreaterThan(0)
		await expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth)
	}
	for (const { name, state, label } of HOST_ROWS) {
		const row = spaceRowOf(menu, name)
		await expect(slotIn(row, "space-avatar").dataset.state).toBe(state)
		await expect(within(row).getByText(label)).toHaveClass("sr-only")
	}
	await expect(slotsIn(spaces, "host-pill")).toHaveLength(0)
}

export const SpacesHostStates = meta.story({
	args: HOST_STATES_ARGS,
	parameters: {
		docs: {
			description: {
				story:
					"Spaces with one row per host state: Studio shared from this computer, Vocca joined and online, Archives connecting, Harbor not connected. Check every row shows its name in full beside its avatar in the state of its host, that no state pill sits in any row, and that each row reads its state to assistive technology after the name. Pick `SpacesHostStatesDark` for the dark theme.",
			},
		},
	},
	play: playHostStates,
})

export const SpacesHostStatesDark = meta.story({
	args: HOST_STATES_ARGS,
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"`SpacesHostStates` in the dark theme. Check the four names stay shown in full and the connecting and not connected avatars stay told apart from the online ones without a pill.",
			},
		},
	},
	play: playHostStates,
})

const LeftNorthwindNotice = () => {
	const { t } = useTranslation("settings")

	useEffect(() => {
		const notice = raiseTransientNotice({
			title: t("screen.space.left.title", { name: NORTHWIND.name }),
			description: t("screen.space.left.description", {
				host: "Sam Rivera",
			}),
		})
		return () => endNotice(notice)
	}, [t])

	return null
}

const LEFT_COLUMN = {
	parameters: {
		docs: {
			description: {
				story:
					"The User settings menu as the left column every screen shares. Check that the column opens 8px under its top edge and closes 12px over its bottom edge, that its pieces stand 8px apart, that its back header is 32px tall like the Conversations panel header and that its first entry sits 8px in from its inner edge, the same numbers the Conversations and Missions panels and the Space settings menu read.",
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		await expectSettingsMenuLeftColumn(canvasElement)
	},
}

export const LeftColumn = meta.story(LEFT_COLUMN)

const RAIL_SPACE_HOST_STORY = {
	args: { currentSpace: STUDIO, currentSpaceHost: RAIL_SPACE_HOST },
	parameters: {
		docs: {
			description: {
				story:
					"The User settings while the current Space's host is being reached. Check that the Space logo at the top of the rail draws the connecting state, the same one the Conversations and Missions panels and the Space settings screen draw for the same host.",
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		await expectRailSpaceHost(canvasElement)
	},
}

export const RailSpaceHost = meta.story(RAIL_SPACE_HOST_STORY)

export const RailSpaceHostDark = meta.story({
	...RAIL_SPACE_HOST_STORY,
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"`RailSpaceHost` in the dark theme. Check that the Space logo at the top of the rail still draws the connecting state, its hatching legible on its dark fill and told apart from the filled online logo.",
			},
		},
	},
})

export const LeftColumnDark = meta.story({
	...LEFT_COLUMN,
	globals: { theme: "dark" },
})

export const AfterLeavingASpace = meta.story({
	args: {
		...SPACES_ARGS,
		joinedSpaces: SPACES_ARGS.joinedSpaces.filter(
			(space) => space.id !== NORTHWIND.id,
		),
	},
	decorators: [
		(Story) => (
			<>
				<Story />
				<NoticeSurface transientDelay={0} />
				<LeftNorthwindNotice />
			</>
		),
	],
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Artboard F09: Northwind just left. Check that its row is gone, the other rows unchanged, and that a success notice says You left Northwind and whom to ask for a new invitation. Kept gap: the artboard draws the notice bottom right, 24px from the edges and 340px wide; it sits top centred here, where every notice of the app sits, since moving it means changing the placement of the notice surface for all of them. The contrast audit is left to review: the Invitation pill wears the warning token on its own tint as the artboard draws it.",
			},
		},
	},
	play: async () => {
		const menu = await expectEntryShown("Account")
		await expectSpaceRows(menu, ["Studio", "Field notes", "Harbor", "Atelier"])
		await expect(
			slotsIn(groupIn(menu, "Spaces"), "settings-menu-space-attention"),
		).toHaveLength(0)
		const title = await waitFor(() => slotIn(document.body, "toast-title"))
		await expect(title).toHaveTextContent("You left Northwind")
		await expect(title).toHaveAttribute("data-type", "success")
		await expect(slotIn(document.body, "toast-description")).toHaveTextContent(
			"Ask Sam Rivera for a new invitation to join again.",
		)
	},
})

export const AccountDark = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"`Account` in the dark theme. Check that the selected entry sits on the muted surface and the menu meets the card through its divider.",
			},
		},
	},
})

export const WithoutOptionalEntries = meta.story({
	args: {
		entry: "appearance",
		account: undefined,
		applications: undefined,
		diagnostics: undefined,
		about: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A host that passes no account, applications, diagnostics or about. Check that the menu lists only the entries the dialog would list for the same host.",
			},
		},
	},
	play: async () => {
		const menu = await expectEntryShown("Appearance")
		await expect(entriesIn(menu)).toEqual([
			"Appearance",
			"Notifications",
			"Language",
			"Skills",
			"History",
		])
	},
})

export const Appearance = meta.story({
	args: { entry: "appearance" },
	parameters: {
		docs: {
			description: {
				story:
					"The Appearance entry. Check that picking a scheme reports it with the name unchanged.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		await expectEntryShown("Appearance")
		await userEvent.click(
			within(screen.getByRole("main")).getByRole("radio", { name: "Dark" }),
		)
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Ada Martin",
			colorScheme: "dark",
		})
	},
})

export const Notifications = meta.story({
	args: { entry: "notifications" },
	parameters: {
		docs: {
			description: {
				story: "The Notifications entry, drawn by the dialog's own fields.",
			},
		},
	},
	play: async () => {
		await expectEntryShown("Notifications")
	},
})

export const Language = meta.story({
	args: { entry: "language" },
	parameters: {
		docs: {
			description: {
				story: "The Language entry, drawn by the dialog's own fields.",
			},
		},
	},
	play: async () => {
		await expectEntryShown("Language")
	},
})

export const Skills = meta.story({
	args: { entry: "skills" },
	parameters: {
		docs: {
			description: {
				story: "The Skills entry. Check that the reader's skills are listed.",
			},
		},
	},
	play: async () => {
		await expectEntryShown("Skills")
		await expect(
			within(screen.getByRole("main")).getByText(BOT_SKILLS[0].name),
		).toBeVisible()
	},
})

export const UserSkills = meta.story({
	globals: LAPTOP_WINDOW,
	args: { entry: "skills" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to see the reader's skills as a list page in a laptop window. Check the Skills header bar, then the skills across the whole card, the first row where a conversation's first message starts. The screen in a 1280 by 800 window, the size the review screenshot is taken at.",
			},
		},
	},
	play: async () => {
		await expectLaptopWindow()
		await expectEntryShown("Skills")
	},
})

export const LeavingAnUnsavedSkillByTheRail = meta.story({
	args: { entry: "skills" },
	parameters: {
		docs: {
			description: {
				story:
					"A skill with an edit not yet saved, then the rail's Missions pressed. Check that the screen asks with the skill's leave wording before the rail navigates, that Cancel keeps the skill, the edit and the menu selection, and that Leave drops the edit and runs the rail's navigation once.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await expectEntryShown("Skills")
		const rail = await screen.findByRole("navigation", { name: "Navigation" })
		const main = screen.getByRole("main")
		await userEvent.click(
			within(main).getByRole("button", { name: /release-notes/ }),
		)
		const body = within(main).getByLabelText("Body")
		await userEvent.type(body, "!")
		const missions = within(rail).getByRole("button", { name: "Missions" })

		await userEvent.click(missions)
		const question = await screen.findByRole("alertdialog", {
			name: "Leave without saving?",
		})
		await userEvent.click(
			within(question).getByRole("button", { name: "Cancel" }),
		)
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
		await expect(body).toHaveValue(`${BOT_SKILLS[0].body}!`)
		await expect(
			within(menu).getByRole("button", { name: "Skills" }),
		).toHaveAttribute("aria-current", "page")
		await expect(RAIL_PRESSES.onSelectMissions).not.toHaveBeenCalled()

		await userEvent.click(missions)
		await userEvent.click(
			within(
				await screen.findByRole("alertdialog", {
					name: "Leave without saving?",
				}),
			).getByRole("button", { name: "Leave" }),
		)
		await expect(RAIL_PRESSES.onSelectMissions).toHaveBeenCalledTimes(1)
		await waitFor(() =>
			expect(within(main).queryByLabelText("Body")).toBeNull(),
		)
		await expect(args.onEntryChange).not.toHaveBeenCalled()
	},
})

export const OpensAnEntryWithClickModifiers = meta.story({
	tags: ["test-only"],
	args: { entry: "skills" },
	parameters: {
		docs: {
			description: {
				story:
					"A skill with an edit not yet saved, then Appearance Cmd clicked and the leave confirmed, then Appearance clicked every way a host can tell apart. Check that the confirmed leave hands the caller the entry with the Cmd of the original click, and that a free entry reports middle with the keys held, Cmd, Ctrl or Shift alone, none on a plain click or Enter, and nothing on a right-click.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await expectEntryShown("Skills")
		const main = screen.getByRole("main")
		await userEvent.click(
			within(main).getByRole("button", { name: /release-notes/ }),
		)
		await userEvent.type(within(main).getByLabelText("Body"), "!")
		const appearance = within(menu).getByRole("button", { name: "Appearance" })

		fireEvent.click(appearance, { metaKey: true, detail: 1 })
		await userEvent.click(
			within(
				await screen.findByRole("alertdialog", {
					name: "Leave without saving?",
				}),
			).getByRole("button", { name: "Leave" }),
		)
		await expect(args.onEntryChange).toHaveBeenCalledOnce()
		await expect(args.onEntryChange).toHaveBeenLastCalledWith("appearance", {
			...NO_CLICK_MODIFIERS,
			meta: true,
		})

		await expectClickModifiers({
			target: within(menu).getByRole("button", { name: "Appearance" }),
			callback: args.onEntryChange,
			reported: ["appearance"],
			userEvent,
		})
	},
})

export const Applications = meta.story({
	args: { entry: "mcp" },
	parameters: {
		docs: {
			description: {
				story:
					"The Applications entry. Check that the reader's applications are listed under it as sub-entries, then Add an application, with the panel in the column.",
			},
		},
	},
	play: async () => {
		const menu = await expectEntryShown("Applications")
		for (const name of [
			"Linear Connected",
			"GitHub Needs authorization",
			"atlas Couldn’t connect",
			"Add an application",
		]) {
			await expect(within(menu).getByRole("button", { name })).toBeVisible()
		}
	},
})

const MODIFIED_CLICKS: [MouseEventInit, Partial<ClickModifiers>][] = [
	[{ metaKey: true }, { meta: true }],
	[{ ctrlKey: true }, { ctrl: true }],
	[{ shiftKey: true }, { shift: true }],
]

export const OpensAnApplicationWithClickModifiers = meta.story({
	tags: ["test-only"],
	args: { entry: "mcp", onOpenApplication: fn() },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Applications with a caller taking the opens that land elsewhere. atlas clicked plainly twice and edited, then Linear middle, Cmd, Ctrl, Shift and right-clicked, then Linear activated with Enter and the leave confirmed. Check that a plain click opens atlas in place and reports Applications with no key while the caller hears nothing, that the open atlas clicked again does nothing, that each modified click hands the caller Linear with its keys at once with no leave question while the edit, the page and the selected entry stay, that a right-click reports nothing, and that Enter opens Linear in place after the leave question.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await expectEntryShown("Applications")
		const atlas = within(menu).getByRole("button", { name: /^atlas/ })
		const linear = within(menu).getByRole("button", { name: /^Linear/ })

		await userEvent.click(atlas)
		await expect(atlas).toHaveAttribute("aria-current", "page")
		await expect(args.onEntryChange).toHaveBeenCalledOnce()
		await expect(args.onEntryChange).toHaveBeenLastCalledWith(
			"mcp",
			NO_CLICK_MODIFIERS,
		)
		await userEvent.click(atlas)
		await expect(args.onEntryChange).toHaveBeenCalledOnce()
		await expect(args.onOpenApplication).not.toHaveBeenCalled()

		const name = within(screen.getByRole("main")).getByLabelText("Name")
		await userEvent.type(name, "-desk")

		await expect(middleClick(linear, { shiftKey: true })).toBe(false)
		await expect(args.onOpenApplication).toHaveBeenLastCalledWith("linear", {
			...NO_CLICK_MODIFIERS,
			middle: true,
			shift: true,
		})
		for (const [held, pressed] of MODIFIED_CLICKS) {
			fireEvent.click(linear, { ...held, detail: 1 })
			await expect(args.onOpenApplication).toHaveBeenLastCalledWith("linear", {
				...NO_CLICK_MODIFIERS,
				...pressed,
			})
		}
		rightClick(linear)
		await expect(args.onOpenApplication).toHaveBeenCalledTimes(4)
		await expect(screen.queryByRole("alertdialog")).toBeNull()
		await expect(name).toHaveValue("atlas-desk")
		await expect(atlas).toHaveAttribute("aria-current", "page")
		await expect(linear).not.toHaveAttribute("aria-current")
		await expect(args.onEntryChange).toHaveBeenCalledOnce()

		linear.focus()
		await userEvent.keyboard("{Enter}")
		await userEvent.click(
			within(
				await screen.findByRole("alertdialog", {
					name: "Leave without saving?",
				}),
			).getByRole("button", { name: "Leave" }),
		)
		await expect(linear).toHaveAttribute("aria-current", "page")
		await expect(args.onEntryChange).toHaveBeenCalledTimes(2)
		await expect(args.onEntryChange).toHaveBeenLastCalledWith(
			"mcp",
			NO_CLICK_MODIFIERS,
		)
		await expect(args.onOpenApplication).toHaveBeenCalledTimes(4)
	},
})

export const OpensAnApplicationInPlace = meta.story({
	tags: ["test-only"],
	args: { entry: "mcp" },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Applications with no caller taking the open. Linear clicked plainly, then clicked again plainly, Cmd clicked and middle clicked, then atlas Cmd clicked, then Linear activated with Enter, then atlas right-clicked. Check that every open happens in place and reports Applications with the keys of its click, none on a plain click or Enter, that the open Linear does nothing whatever the click, and that a right-click reports nothing.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await expectEntryShown("Applications")
		const atlas = within(menu).getByRole("button", { name: /^atlas/ })
		const linear = within(menu).getByRole("button", { name: /^Linear/ })

		await userEvent.click(linear)
		await expect(linear).toHaveAttribute("aria-current", "page")
		await expect(args.onEntryChange).toHaveBeenCalledOnce()
		await expect(args.onEntryChange).toHaveBeenLastCalledWith(
			"mcp",
			NO_CLICK_MODIFIERS,
		)

		await userEvent.click(linear)
		fireEvent.click(linear, { metaKey: true, detail: 1 })
		middleClick(linear)
		await expect(args.onEntryChange).toHaveBeenCalledOnce()

		fireEvent.click(atlas, { metaKey: true, detail: 1 })
		await expect(atlas).toHaveAttribute("aria-current", "page")
		await expect(args.onEntryChange).toHaveBeenLastCalledWith("mcp", {
			...NO_CLICK_MODIFIERS,
			meta: true,
		})

		linear.focus()
		await userEvent.keyboard("{Enter}")
		await expect(linear).toHaveAttribute("aria-current", "page")
		await expect(args.onEntryChange).toHaveBeenLastCalledWith(
			"mcp",
			NO_CLICK_MODIFIERS,
		)

		rightClick(atlas)
		await expect(args.onEntryChange).toHaveBeenCalledTimes(3)
	},
})

export const History = meta.story({
	args: { entry: "history" },
	parameters: {
		docs: {
			description: {
				story: "The History entry, drawn by the dialog's own history panel.",
			},
		},
	},
	play: async () => {
		await expectEntryShown("History")
	},
})

export const Diagnostics = meta.story({
	args: { entry: "diagnostics" },
	parameters: {
		docs: {
			description: {
				story:
					"The Diagnostics entry. Check that Copy diagnostics, Reveal log and Clear log are offered.",
			},
		},
	},
	play: async () => {
		await expectEntryShown("Diagnostics")
		for (const name of ["Copy diagnostics", "Reveal log", "Clear log"]) {
			await expect(
				within(screen.getByRole("main")).getByRole("button", { name }),
			).toBeVisible()
		}
	},
})

export const About = meta.story({
	args: { entry: "about" },
	parameters: {
		docs: {
			description: {
				story:
					"The About entry while an update waits. Check that the panel reads the update the menu's dot announces.",
			},
		},
	},
	play: async () => {
		await expectEntryShown("About")
		await expect(
			within(screen.getByRole("main")).getByRole("status"),
		).toHaveTextContent("Kiroshi 0.24.0 is available.")
	},
})

export const DefaultWidth = meta.story({
	args: { width: SIDEBAR_DEFAULT_WIDTH },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard E4: the reader's own settings at the panel width the conversations screen opens with. Check that the 34px title bar carries the window controls reserve and the Space switcher at the place the conversations screen draws them, that the 60px rail follows, and that the menu panel is 304px wide with the conversations panel's end separator. Pick `MinimumWidth` or `MaximumWidth` for a reader who resized the panel.",
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
