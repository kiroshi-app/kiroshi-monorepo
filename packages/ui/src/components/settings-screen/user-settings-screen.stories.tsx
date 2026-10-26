import { type ComponentType, useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn, slotsIn } from "@workspace/storybook/story-utils"
import { AppRail } from "@workspace/ui/components/app-rail"
import { MARKED_APPLICATIONS } from "@workspace/ui/components/plugin-settings/applications.fixtures"
import {
	HISTORY_DAYS,
	HISTORY_OLDEST_DATE,
} from "@workspace/ui/components/plugin-settings/history.fixtures"
import { BOT_SKILLS } from "@workspace/ui/components/plugin-settings/skills.fixtures"
import {
	SettingsScreen,
	type UserSettingsScreenProps,
} from "@workspace/ui/components/settings-screen"

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

const expectEntryShown = async (label: string) => {
	const menu = await menuIn()
	await expect(
		within(menu).getByRole("button", { name: label }),
	).toHaveAttribute("aria-current", "page")
	await expect(
		within(screen.getByRole("main")).getByRole("heading", {
			level: 2,
			name: label,
		}),
	).toBeVisible()
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
					"The reader's own settings as a whole window instead of an overlay. The settings menu takes the place of the conversations panel: Back to conversations, the reader's round initials avatar and name, then Account, Appearance, Notifications, Language, Skills, Applications, History, Diagnostics and About, each optional entry shown under the same condition as in the user settings dialog. The content column draws the same panels the dialog draws, centred under the entry's title.",
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
		await expect(
			within(menu)
				.getAllByRole("button")
				.map((button) => button.textContent),
		).toEqual(["Back to conversations", ...USER_MENU])
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
		await expect(
			within(menu)
				.getAllByRole("button")
				.map((button) => button.textContent),
		).toEqual([
			"Back to conversations",
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
