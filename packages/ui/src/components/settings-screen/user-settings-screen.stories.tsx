import { type ComponentType, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	expectLaptopWindow,
	expectSettingsChrome,
	expectSettingsPage,
	LAPTOP_WINDOW,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { AppRail } from "@workspace/ui/components/app-rail"
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
			onEntryChange={(next) => {
				setEntry(next)
				props.onEntryChange(next)
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

const RAIL: UserSettingsScreenProps["rail"] = (requestLeave) => (
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

const USER_ARGS = {
	target: "user",
	entry: "account",
	onEntryChange: fn(),
	onBack: fn(),
	rail: RAIL,
	titleBar: { ...TITLE_BAR, onSelectSpace: fn() },
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
	within(groupIn(menu, "Your settings"))
		.getAllByRole("button")
		.map((button) => button.textContent)

const spaceRowsIn = (menu: HTMLElement) =>
	within(groupIn(menu, "Your spaces")).queryAllByRole("button")

const spaceRowOf = (menu: HTMLElement, name: string) =>
	within(groupIn(menu, "Your spaces")).getByRole("button", {
		name: new RegExp(`^${name}`),
	})

const NORTHWIND = {
	id: "northwind",
	name: "Northwind",
	colour: "green",
	hasAttention: true,
} satisfies UserSpace

const SPACES_ARGS = {
	entry: "",
	ownedSpaces: [
		{ ...STUDIO, colour: "blue", host: "shared" },
		{ id: "field-notes", name: "Field notes", colour: "purple" },
	],
	joinedSpaces: [
		NORTHWIND,
		{ id: "harbor", name: "Harbor", colour: "orange", host: "down" },
	],
	invitations: [{ id: "atelier", name: "Atelier" }],
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
		slotsIn(groupIn(menu, "Your spaces"), "roster-row-name").map(
			(name) => name.textContent,
		),
	).toEqual(names)
	await expect(slotsIn(groupIn(menu, "Your spaces"), "host-dot")).toHaveLength(
		2,
	)
	await expect(slotIn(spaceRowOf(menu, "Studio"), "host-dot")).toHaveAttribute(
		"data-host",
		"shared",
	)
	await expect(slotIn(spaceRowOf(menu, "Harbor"), "host-dot")).toHaveAttribute(
		"data-host",
		"down",
	)
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
		slotIn(spaceRowOf(menu, "Atelier"), "settings-menu-space-invitation"),
	).toBeVisible()
	await expect(
		slotsIn(groupIn(menu, "Your spaces"), "settings-menu-space-current"),
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
			slotIn(spaceRowOf(menu, name), "space-dot").style.backgroundColor,
		).toBe(`var(--bot-blot-${colour})`)
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
					"Artboard F01: the menu in two titled groups, Your settings then Your spaces. The screen opens on Account when no entry is chosen. Check Studio marked current with its Open now pill and online dot, Northwind ending on the attention dot, Harbor's not-connected dot, Atelier's dashed square and Invitation pill, and the + creating a space by pointer or keyboard. The contrast audit is left to review: the Invitation pill wears the warning token on its own tint as the artboard draws it, 2.96:1 in the light theme.",
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
			slotsIn(groupIn(menu, "Your spaces"), "settings-menu-space-attention"),
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
		await expect(args.onOpenSpace).toHaveBeenLastCalledWith("field-notes")

		await userEvent.click(create)
		await expect(args.onCreateSpace).toHaveBeenCalledTimes(2)
		await userEvent.click(spaceRowOf(menu, "Northwind"))
		await expect(args.onOpenSpace).toHaveBeenLastCalledWith("northwind")

		for (const drawn of [
			create,
			...spaceRowsIn(menu),
			slotIn(menu, "settings-menu-space-current"),
			slotIn(menu, "settings-menu-space-invitation-pill"),
		])
			await expectNoColourTransition(drawn)
	},
})

export const SpacesDark = meta.story({
	args: SPACES_ARGS,
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"`Spaces` in the dark theme. Check that each host dot keeps its ring of the menu surface and the Invitation pill stays legible on its warning tint.",
			},
		},
	},
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
			slotsIn(groupIn(menu, "Your spaces"), "settings-menu-space-attention"),
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
