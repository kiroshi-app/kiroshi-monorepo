import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	opaque,
	probedStyleOf,
	slotIn,
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
	widthInRems,
} from "@workspace/storybook/story-utils"
import {
	endNotice,
	NoticeSurface,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"
import { MARKED_APPLICATIONS } from "@workspace/ui/components/plugin-settings/applications.fixtures"
import {
	HISTORY_DAYS,
	HISTORY_OLDEST_DATE,
} from "@workspace/ui/components/plugin-settings/history.fixtures"
import {
	BOT_SKILLS,
	LONG_SKILL,
} from "@workspace/ui/components/plugin-settings/skills.fixtures"
import {
	UserSettingsDialog,
	type UserSettingsDialogProps,
	type UserSettingsValue,
} from "@workspace/ui/components/user-settings-dialog"
import type { AboutFieldsProps } from "@workspace/ui/components/user-settings-dialog/about-fields"
import type { AccountState } from "@workspace/ui/components/user-settings-dialog/account-panel"
import { en } from "@workspace/ui/lib/i18n-en"

const FILLED_USER: UserSettingsValue = {
	name: "Ada Martin",
	colorScheme: "system",
}

const NEW_USER: UserSettingsValue = {
	name: "",
	colorScheme: "system",
}

const PICTURED_USER: UserSettingsValue = {
	...FILLED_USER,
	image: UPLOADED_AVATAR_IMAGE,
	colorScheme: "dark",
}

const DIALOG_WIDTH_REMS = 52

const SIGNED_IN: AccountState = {
	status: "signedIn",
	name: "Ada Martin",
	email: "ada.martin@example.com",
	plan: "pro",
}

const ACCOUNT = en.settings.account

const PLAN = ACCOUNT.signedIn.plan

const LONG_NAME =
	"Adaeze Oluwaseun Martin-Castellanos de la Fuente y Rodríguez-Villanueva"

const LONG_EMAIL =
	"ada.martin.who.signed.up.with.her.whole.department.address.for.every.space@kiroshi-research-laboratories.example.com"

const accountIn = (account: AccountState) => ({
	account,
	onSignIn: fn(),
	onCancel: fn(),
	onCopySignInLink: fn(),
	onManageAccount: fn(),
	onSignOut: fn(),
})

const accountPanelIn = async (dialog: HTMLElement) =>
	within(dialog).findByRole("tabpanel", { name: "Account" })

let raisedNotice: string | undefined

const DialogHost = (props: UserSettingsDialogProps) => {
	const [value, setValue] = useState(props.value)
	const [language, setLanguage] = useState(props.language)
	const [open, setOpen] = useState(props.open)

	return (
		<UserSettingsDialog
			{...props}
			language={language}
			onClose={() => {
				setOpen(false)
				props.onClose()
			}}
			onLanguageChange={(next) => {
				setLanguage(next)
				props.onLanguageChange(next)
			}}
			onValueChange={(next) => {
				setValue(next)
				props.onValueChange(next)
			}}
			open={open}
			value={value}
		/>
	)
}

const NoticeHost = (props: UserSettingsDialogProps) => (
	<>
		<DialogHost {...props} />
		<NoticeSurface />
	</>
)

type NoticeCopy = {
	title: string
	description: string
}

const raiseNotice = async (copy: NoticeCopy) => {
	raisedNotice = raiseFailureNotice(copy)
	const notice = await opaque(
		await screen.findByRole("alertdialog", { hidden: true }),
	)
	await expect(within(notice).getByText(copy.title)).toBeVisible()
	await expect(within(notice).getByText(copy.description)).toBeVisible()
}

const endRaisedNotice = () => () => {
	if (raisedNotice) endNotice(raisedNotice)
}

const UNDER_A_NOTICE = {
	render: (args: UserSettingsDialogProps) => <NoticeHost {...args} />,
	beforeEach: endRaisedNotice,
} as const

const dialogIn = async () => {
	const dialog = await screen.findByRole("dialog")
	await waitFor(() => expect(dialog).toBeVisible())
	return dialog
}

const meta = preview.meta({
	title: "Settings/User/UserSettingsDialog",
	component: UserSettingsDialog,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"Everything a reader is to the app, in one overlay. A breadcrumb heads it with their own face, the same avatar the sidebar chip draws so the dialog is visibly the one that chip opened, then their name and the word Settings. Down the left is a rail: Account, how they are signed in to Kiroshi; Appearance, how the app is painted; Notifications, what it tells them about; Language, the one it speaks; then Skills, Applications and History for their own plugin; last, About, which Kiroshi this is and how it updates. It opens on the tab the host asks for, else on Account, or on Appearance for a host that passes no account. Same contract as a companion's settings and for the same reason: fully controlled, saving as you type, no draft, no debounce, no persistence, so closing it is never a question. The language does not travel through the value: it is a prop of its own because the translation runtime is what the whole app reads from.",
			},
		},
	},
	args: {
		open: true,
		value: FILLED_USER,
		onClose: fn(),
		onValueChange: fn(),
		language: null,
		onLanguageChange: fn(),
		skills: BOT_SKILLS,
		onSkillCreate: fn(),
		onSkillChange: fn(),
		onSkillPreloadedChange: fn(),
		onSkillDelete: fn(),
		history: {
			days: HISTORY_DAYS,
			oldestDate: HISTORY_OLDEST_DATE,
			onUndo: fn(),
		},
	},
	render: (args) => <DialogHost {...args} />,
})

export const Default = meta.story({
	args: { account: accountIn(SIGNED_IN) },
	parameters: {
		docs: {
			description: {
				story:
					"The dialog as it opens on a signed in reader. Check that it lands on Account, first on the rail, that the breadcrumb wears their face and names them, and that the card draws the same avatar. Pick `OpensOnAppearanceWithoutAnAccount` for a host that passes no account, `Appearance` for the colour scheme, `Notifications` for what the app tells them about, `LanguageTab` for the language the app is read in, `Empty` for the reader who never filled anything in, `Skills` and `History` for the person's own plugin.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()
		await expect(dialog).toHaveAccessibleName("Ada Martin Settings")

		await expect(within(dialog).queryByRole("tab", { name: "Profile" })).toBe(
			null,
		)
		await expect(
			within(dialog).getByRole("tab", { name: "Account" }),
		).toHaveAttribute("aria-selected", "true")

		const panel = await accountPanelIn(dialog)
		await expect(slotsIn(dialog, "user-avatar")).toHaveLength(2)
		await expect(slotsIn(panel, "user-avatar")).toHaveLength(1)
	},
})

export const OpensOnAppearanceWithoutAnAccount = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A host that passes no account. Check that the rail draws no Account item and that the dialog lands on Appearance, the first group left. Pick `Default` for the signed in reader.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()

		await expect(within(dialog).queryByRole("tab", { name: "Account" })).toBe(
			null,
		)
		await expect(
			within(dialog).getByRole("tab", { name: "Appearance" }),
		).toHaveAttribute("aria-selected", "true")
	},
})

export const Empty = meta.story({
	args: { value: NEW_USER },
	parameters: {
		docs: {
			description: {
				story:
					"A reader who has never filled anything in. Check that the breadcrumb reads `You` rather than a gap before the chevron, and that the avatar falls back to that name's initial instead of a blank circle. The fallback is what the app calls them, never a value written into the record. Pick `Default` for the named reader.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()

		await expect(dialog).toHaveAccessibleName("You Settings")
		await expect(slotsIn(dialog, "user-avatar")).toHaveLength(1)
	},
})

export const Appearance = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The second group: the three colour schemes, side by side. Check that the chosen one reads as chosen and that choosing another writes the whole value back through `onValueChange`. Pick `Notifications` for the third group, `LanguageTab` for the one after it.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		await userEvent.click(
			within(dialog).getByRole("tab", { name: "Appearance" }),
		)

		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Appearance",
		})
		await userEvent.click(within(panel).getByRole("radio", { name: "Dark" }))
		await expect(args.onValueChange).toHaveBeenCalledWith(
			expect.objectContaining({ colorScheme: "dark" }),
		)
	},
})

export const Notifications = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The third group, on a record that holds no choice: the three moments on and the sound with them, which is what a reader who has never opened this tab is owed — a companion that asked something nobody heard waits forever. Check that flipping one writes the whole value back through `onValueChange` with that one event turned off and the name and the scheme exactly as they were. Pick `LanguageTab` for the group next door.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		await userEvent.click(
			within(dialog).getByRole("tab", { name: "Notifications" }),
		)

		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Notifications",
		})
		await userEvent.click(
			within(panel).getByRole("switch", {
				name: "A companion asks for approval",
			}),
		)
		await expect(args.onValueChange).toHaveBeenCalledWith({
			...FILLED_USER,
			notifications: {
				question: true,
				permission: false,
				turn: true,
				sound: true,
			},
		})
	},
})

export const LanguageTab = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The last group, on a record holding no language: a list one line to a language, the machine row heading it as the chosen one and every language this build ships written in itself under it. Check that a language leaves the value alone and reports itself through `onLanguageChange` — the one field the dialog does not hold — and that handing the choice back to the machine reports `null` rather than the language the machine happens to be set to. Pick `Appearance` for the group next door.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		await userEvent.click(within(dialog).getByRole("tab", { name: "Language" }))

		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Language",
		})
		await expect(
			within(panel).getByRole("radio", { name: "System" }),
		).toBeChecked()

		await userEvent.click(
			within(panel).getByRole("radio", { name: "Français" }),
		)
		await expect(args.onLanguageChange).toHaveBeenCalledWith("fr")
		await expect(args.onValueChange).not.toHaveBeenCalled()

		await userEvent.click(within(panel).getByRole("radio", { name: "System" }))
		await expect(args.onLanguageChange).toHaveBeenLastCalledWith(null)
	},
})

export const Skills = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The skills of the person's own plugin, the same panel a companion's settings draws, on the plugin every companion reads before it answers. Check that opening one swaps the whole body for the editor, and that the way back restores the rail. Pick `NoSkills` for the plugin that holds none yet.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(within(dialog).getByRole("tab", { name: "Skills" }))
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Skills",
		})

		await userEvent.click(
			within(panel).getByRole("button", { name: /release-notes/ }),
		)
		const back = within(dialog).getByRole("button", { name: "All skills" })
		await expect(back).toBeVisible()

		await userEvent.click(back)
		await expect(
			within(dialog).getByRole("tab", { name: "Skills" }),
		).toBeVisible()
	},
})

export const NoSkills = meta.story({
	args: { skills: [] },
	parameters: {
		docs: {
			description: {
				story:
					"The plugin before the person has written anything into it. Check that the tab shows the empty state and its one way forward, not a blank list.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(within(dialog).getByRole("tab", { name: "Skills" }))
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Skills",
		})

		await expect(within(panel).getByText("No skills yet")).toBeVisible()
		await expect(
			within(panel).getByRole("button", { name: "Add skill" }),
		).toBeVisible()
	},
})

export const WithALongSkill = meta.story({
	args: { skills: [...BOT_SKILLS, LONG_SKILL] },
	parameters: {
		docs: {
			description: {
				story:
					"A skill whose name and description are both wider than the panel that lists them. Check that the dialog stays the width it declares rather than growing to the longest row, and that the row clips its two lines instead of pushing the chevron and the tag out of reach. Pick `Skills` for the list at its usual widths.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(within(dialog).getByRole("tab", { name: "Skills" }))
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Skills",
		})

		await waitFor(() =>
			expect(widthInRems(dialog)).toBeCloseTo(DIALOG_WIDTH_REMS, 1),
		)

		const row = within(panel).getByRole("button", {
			name: new RegExp(LONG_SKILL.name),
		})
		await expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(
			dialog.getBoundingClientRect().right,
		)
	},
})

export const Applications = meta.story({
	args: {
		applications: {
			servers: MARKED_APPLICATIONS,
			onServerCreate: fn(),
			onServerChange: fn(),
			onServerDelete: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"The applications the person connects to in every space, on the rail between Skills and History. Check the order, the profile intro and the footnote. The item exists only for a host that passes the `applications` section: `Default` passes none and draws no such item.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		const names = within(dialog)
			.getAllByRole("tab")
			.map((tab) => tab.textContent)
		await expect(names.slice(-3)).toEqual(["Skills", "Applications", "History"])

		await userEvent.click(
			within(dialog).getByRole("tab", { name: "Applications" }),
		)
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Applications",
		})

		await expect(
			within(panel).getByText("What you connect to, in every space."),
		).toBeVisible()
	},
})

export const OpensOnAnApplication = meta.story({
	args: {
		tab: "mcp",
		applications: {
			servers: MARKED_APPLICATIONS,
			serverToOpen: MARKED_APPLICATIONS[0].name,
			onServerCreate: fn(),
			onServerChange: fn(),
			onServerDelete: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A host that asks for one application of the person: the dialog opens on Applications with the editor of that application pushed over the panel, the way an Open Settings control in the thread reaches its key. Check that the way back lands on the panel. Pick `OpensOnAMissingApplication` for a name the list does not hold.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		const back = await within(dialog).findByRole("button", {
			name: "All applications",
		})
		await expect(back).toBeVisible()

		await userEvent.click(back)
		await expect(
			await within(dialog).findByRole("tabpanel", { name: "Applications" }),
		).toBeVisible()
	},
})

export const OpensOnAMissingApplication = meta.story({
	args: {
		tab: "mcp",
		applications: {
			servers: MARKED_APPLICATIONS,
			serverToOpen: "absent",
			onServerCreate: fn(),
			onServerChange: fn(),
			onServerDelete: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A host that asks for an application the person does not hold. Check that the dialog stays on the Applications panel and pushes no editor.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()

		await expect(
			await within(dialog).findByRole("tabpanel", { name: "Applications" }),
		).toBeVisible()
		await expect(
			within(dialog).queryByRole("button", { name: "All applications" }),
		).toBe(null)
	},
})

export const WithoutApplications = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A host that passes no applications section. Check that the rail draws no Applications item rather than an empty one.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()

		await expect(
			within(dialog).queryByRole("tab", { name: "Applications" }),
		).toBe(null)
	},
})

export const History = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Everything ever written into the person's plugin, newest first, whoever wrote it. Check that a change the person made is signed You and one a companion made is signed generically, and that asking for the changes of an entry calls back for its diff.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(within(dialog).getByRole("tab", { name: "History" }))
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "History",
		})

		await expect(within(panel).getAllByText("You").length).toBeGreaterThan(0)
		await expect(within(panel).getAllByRole("listitem")).toHaveLength(6)
	},
})

export const Diagnostics = meta.story({
	args: {
		diagnostics: {
			onDiagnosticsCopy: fn(),
			onLogReveal: fn(),
			onLogClear: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A host that passes diagnostics gets a Diagnostics entry at the foot of the rail, after History. Check that it is the last tab, that its panel carries Copy diagnostics, Reveal log and Clear log. Pick `History` for the entry above it.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		const tabs = within(dialog).getAllByRole("tab")
		await expect(tabs.at(-1)).toHaveAccessibleName("Diagnostics")

		await userEvent.click(
			within(dialog).getByRole("tab", { name: "Diagnostics" }),
		)
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Diagnostics",
		})
		for (const name of ["Copy diagnostics", "Reveal log", "Clear log"]) {
			await expect(within(panel).getByRole("button", { name })).toBeVisible()
		}
	},
})

const aboutIn = (update: AboutFieldsProps["update"]): AboutFieldsProps => ({
	version: "0.23.3",
	channel: "stable",
	update,
	showsWhatsNew: true,
	onChannelChange: fn(),
	onShowsWhatsNewChange: fn(),
	onCheck: fn(),
	onDownload: fn(),
	onRestart: fn(),
	onWhatsNew: fn(),
	onReleaseNotes: fn(),
})

const ABOUT_RAIL_INDICATOR = "settings-rail-indicator"

export const About = meta.story({
	args: {
		about: aboutIn({ status: "available", version: "0.24.0" }),
		tab: "about",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The dialog opened on About while an update waits. Check that About is the last item of the rail, wearing its filled icon and a primary dot at its trailing edge, and that the panel reads the update the dot announces. Pick `AboutWithoutAnUpdate` for the rail with nothing to announce.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()

		const tabs = within(dialog).getAllByRole("tab")
		const about = tabs[tabs.length - 1]
		await expect(about).toHaveAccessibleName("About")
		await expect(about).toHaveAttribute("aria-selected", "true")
		await expect(slotsIn(about, ABOUT_RAIL_INDICATOR)).toHaveLength(1)

		const dot = slotIn(about, ABOUT_RAIL_INDICATOR).getBoundingClientRect()
		const item = about.getBoundingClientRect()
		await expect(Math.round(item.right - dot.right)).toBe(
			Number.parseFloat(getComputedStyle(about).paddingInlineEnd),
		)

		const panel = await within(dialog).findByRole("tabpanel", {
			name: "About",
		})
		await expect(within(panel).getByRole("status")).toHaveTextContent(
			"Kiroshi 0.24.0 is available.",
		)
	},
})

export const AboutWithoutAnUpdate = meta.story({
	tags: ["test-only"],
	args: {
		about: aboutIn({ status: "checking" }),
		tab: "about",
	},
	parameters: {
		docs: {
			description: {
				story:
					"About while Kiroshi looks for an update. Check that the rail draws no dot, since nothing is waiting yet. Pick `About` for the dot.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()

		await expect(slotsIn(dialog, ABOUT_RAIL_INDICATOR)).toHaveLength(0)
	},
})

export const AccountLoading = meta.story({
	args: {
		tab: "account",
		account: { ...accountIn({ status: "signedOut" }), isPending: true },
	},
	parameters: {
		docs: {
			description: {
				story:
					"The account not known yet. Check that the panel draws one account card skeleton, a round picture and two bars at the height of the signed-in card, with nothing below it, that neither the signed-in nor the signed-out content shows, and that the panel reads busy.",
			},
		},
	},
	play: async () => {
		const panel = await accountPanelIn(await dialogIn())
		const card = await waitFor(() => slotIn(panel, "account-card-skeleton"))
		const wrapper = card.parentElement as HTMLElement

		await expect(wrapper).toHaveAttribute("aria-busy", "true")
		await expect(wrapper.children).toHaveLength(1)
		await expect(card).toHaveAttribute("aria-hidden", "true")
		await expect(card.getBoundingClientRect().height).toBe(70)
		await expect(getComputedStyle(card).animationName).toBe("none")
		await expect(
			getComputedStyle(slotIn(card, "skeleton")).backgroundColor,
		).toBe(probedStyleOf("bg-border", "backgroundColor", card))
		await expect(within(panel).queryAllByRole("button")).toHaveLength(0)
		await expect(panel).not.toHaveTextContent(ACCOUNT.signedOut.title)
		await expect(panel).not.toHaveTextContent(ACCOUNT.signedIn.manage)
	},
})

export const SignedOut = meta.story({
	args: { tab: "account", account: accountIn({ status: "signedOut" }) },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 3.1: a reader who never signed in to Kiroshi. Check that Account heads the rail, that the panel explains what signing in buys, that there is no field to fill, and that Sign in with your browser carries the external link mark and calls back once. Pick `Waiting` for the moment after the press.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const tabs = within(dialog).getAllByRole("tab")
		await expect(tabs[0]).toHaveAccessibleName("Account")

		const panel = await accountPanelIn(dialog)
		await expect(
			within(panel).getByRole("heading", { name: ACCOUNT.signedOut.title }),
		).toBeVisible()
		await expect(within(panel).getByText(ACCOUNT.signedOut.body)).toBeVisible()
		await expect(
			within(panel).getByText(ACCOUNT.signedOut.caption),
		).toBeVisible()
		await expect(within(panel).queryByRole("textbox")).toBeNull()

		await userEvent.click(
			within(panel).getByRole("button", { name: ACCOUNT.signedOut.signIn }),
		)
		await expect(args.account?.onSignIn).toHaveBeenCalledOnce()
	},
})

export const Waiting = meta.story({
	args: { tab: "account", account: accountIn({ status: "waiting" }) },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 3.2: the browser is open and the panel waits for it. Check that the primary button is dimmed, spins its mark and names the wait, so a screen reader landing on it hears the state, that it stays in the tab order without calling back, that Cancel calls back, that the caption says where to finish, and that Copy the sign-in link is a button the keyboard reaches with a visible ring. The mark holds still for a reader who asked for reduced motion.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const panel = await accountPanelIn(dialog)

		const waiting = within(panel).getByRole("button", {
			name: ACCOUNT.waiting.label,
		})
		await expect(waiting).toHaveAttribute("aria-disabled", "true")
		waiting.focus()
		await expect(waiting).toHaveFocus()
		await userEvent.keyboard("{Enter}")
		await expect(args.account?.onSignIn).not.toHaveBeenCalled()

		const mark = waiting.querySelector("svg") as SVGElement
		const asksForStillness = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches
		await expect(getComputedStyle(mark).animationName).toBe(
			asksForStillness ? "none" : "spin",
		)

		await expect(within(panel).getByText(ACCOUNT.waiting.caption)).toBeVisible()
		await expect(
			within(panel).getByText(ACCOUNT.waiting.browserDidNotOpen),
		).toBeVisible()

		const cancel = within(panel).getByRole("button", {
			name: ACCOUNT.waiting.cancel,
		})
		await userEvent.click(cancel)
		await expect(args.account?.onCancel).toHaveBeenCalledOnce()

		await userEvent.tab()
		const copyLink = within(panel).getByRole("button", {
			name: ACCOUNT.waiting.copySignInLink,
		})
		await expect(copyLink).toHaveFocus()
		await expect(getComputedStyle(copyLink).outlineStyle).not.toBe("none")
		await userEvent.keyboard("{Enter}")
		await expect(args.account?.onCopySignInLink).toHaveBeenCalledOnce()
	},
})

export const SignedIn = meta.story({
	args: { tab: "account", account: accountIn(SIGNED_IN) },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 3.9: a reader signed in to Kiroshi on the Pro plan. Check that the card wears their initials, names them, shows their email as handed in and their plan behind the Free during the beta badge, that Manage account carries the external link mark and calls back, that Sign out calls back, and that no caption sits under the two actions. Pick `WithALongEmail` for an address wider than the card.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const panel = await accountPanelIn(dialog)

		await expect(within(panel).queryByRole("heading")).toBeNull()
		const avatar = slotIn(panel, "user-avatar")
		await expect(avatar).toBeVisible()
		await expect(avatar.querySelector("img")).toBeNull()
		await expect(avatar).toHaveTextContent("AM")
		await expect(within(panel).getByText(SIGNED_IN.name)).toBeVisible()
		await expect(within(panel).getByText(SIGNED_IN.email)).toBeVisible()
		const badge = within(panel).getByText(PLAN.beta)
		await expect(badge).toBeVisible()
		await expect(getComputedStyle(badge).fontSize).toBe("12px")
		await expect(getComputedStyle(badge).lineHeight).toBe("16px")
		await expect(within(panel).getByText(PLAN.pro)).toBeVisible()
		const manage = within(panel).getByRole("button", {
			name: ACCOUNT.signedIn.manage,
		})
		await expect(manage.parentElement?.parentElement?.children).toHaveLength(1)
		await expect(panel).not.toHaveTextContent("managed on kiroshi.app")

		await userEvent.click(manage)
		await expect(args.account?.onManageAccount).toHaveBeenCalledOnce()

		await userEvent.click(
			within(panel).getByRole("button", { name: ACCOUNT.signedIn.signOut }),
		)
		await expect(args.account?.onSignOut).toHaveBeenCalledOnce()
	},
})

export const SignedInWithPicture = meta.story({
	args: {
		tab: "account",
		value: PICTURED_USER,
		account: accountIn(SIGNED_IN),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A reader signed in whose stored record holds a picture: the card's avatar wears that picture, the same one the breadcrumb shows, instead of their initials.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()
		const panel = await accountPanelIn(dialog)

		const avatar = slotIn(panel, "user-avatar")
		await waitFor(() =>
			expect(avatar.querySelector("img")).toHaveAttribute(
				"src",
				UPLOADED_AVATAR_IMAGE,
			),
		)
	},
})

export const SignedInOnTheFreePlan = meta.story({
	args: { tab: "account", account: accountIn({ ...SIGNED_IN, plan: "free" }) },
	parameters: {
		docs: {
			description: {
				story:
					"A reader signed in on the Free plan: the card names it, with no beta badge.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()
		const panel = await accountPanelIn(dialog)

		await expect(within(panel).getByText(PLAN.free)).toBeVisible()
		await expect(within(panel).queryByText(PLAN.beta)).toBeNull()
	},
})

export const SignedInWithoutAPlan = meta.story({
	args: { tab: "account", account: accountIn({ ...SIGNED_IN, plan: null }) },
	parameters: {
		docs: {
			description: {
				story:
					"A reader signed in whose account carries no plan: the card stops at their email, with no plan and no badge.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()
		const panel = await accountPanelIn(dialog)

		await expect(within(panel).getByText(SIGNED_IN.email)).toBeVisible()
		await expect(within(panel).queryByText(PLAN.pro)).toBeNull()
		await expect(within(panel).queryByText(PLAN.free)).toBeNull()
		await expect(within(panel).queryByText(PLAN.beta)).toBeNull()
	},
})

export const CantReachKiroshi = meta.story({
	args: { tab: "account", account: accountIn({ status: "signedOut" }) },
	...UNDER_A_NOTICE,
	parameters: {
		docs: {
			description: {
				story:
					"Signing in failed to reach Kiroshi. The panel is the signed out one unchanged, and the host raises a failure notice at the top of the window with the copy the catalogue holds under `account.unreachable`. Pressing Sign in with your browser again is the retry.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const panel = await accountPanelIn(dialog)

		await raiseNotice(ACCOUNT.unreachable)

		await userEvent.click(
			within(panel).getByRole("button", { name: ACCOUNT.signedOut.signIn }),
		)
		await expect(args.account?.onSignIn).toHaveBeenCalledOnce()
	},
})

export const RequestExpired = meta.story({
	args: { tab: "account", account: accountIn({ status: "signedOut" }) },
	...UNDER_A_NOTICE,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 3.12: the browser never finished and the request expired. The panel is the signed out one unchanged, and the host raises a failure notice with `account.failed.timedOut` over `account.failed.description`. Pressing Sign in with your browser again is the retry.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const panel = await accountPanelIn(dialog)

		await raiseNotice({
			title: ACCOUNT.failed.timedOut,
			description: ACCOUNT.failed.description,
		})

		await userEvent.click(
			within(panel).getByRole("button", { name: ACCOUNT.signedOut.signIn }),
		)
		await expect(args.account?.onSignIn).toHaveBeenCalledOnce()
	},
})

export const SignedOutFromTheSite = meta.story({
	args: { tab: "account", account: accountIn({ status: "signedOut" }) },
	...UNDER_A_NOTICE,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 3.13: this computer was signed out from Devices on kiroshi.app. The panel is the signed out one unchanged, and the host raises a failure notice with the copy the catalogue holds under `account.signedOutFromTheSite`. Pressing Sign in with your browser signs in again.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const panel = await accountPanelIn(dialog)

		await raiseNotice(ACCOUNT.signedOutFromTheSite)

		await userEvent.click(
			within(panel).getByRole("button", { name: ACCOUNT.signedOut.signIn }),
		)
		await expect(args.account?.onSignIn).toHaveBeenCalledOnce()
	},
})

const expectWithinTheCard = async (panel: HTMLElement, text: string) => {
	const line = within(panel).getByText(text)
	const card = line.parentElement?.parentElement as HTMLElement
	await expect(line.scrollWidth).toBeLessThanOrEqual(line.clientWidth)
	await expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(
		panel.getBoundingClientRect().right,
	)
	await expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth)
}

export const WithALongEmail = meta.story({
	tags: ["test-only"],
	args: {
		tab: "account",
		account: accountIn({ ...SIGNED_IN, email: LONG_EMAIL }),
	},
	play: async () => {
		const dialog = await dialogIn()
		await expectWithinTheCard(await accountPanelIn(dialog), LONG_EMAIL)
	},
})

export const WithALongName = meta.story({
	tags: ["test-only"],
	args: {
		tab: "account",
		account: accountIn({ ...SIGNED_IN, name: LONG_NAME }),
	},
	play: async () => {
		const dialog = await dialogIn()
		await expectWithinTheCard(await accountPanelIn(dialog), LONG_NAME)
	},
})
