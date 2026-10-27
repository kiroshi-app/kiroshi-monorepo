import { Tabs } from "@base-ui/react/tabs"
import {
	expect,
	fn,
	screen,
	type userEvent,
	waitFor,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	expectHeadingFont,
	FRAME_POLL,
} from "@workspace/storybook/story-utils"
import { BOT_MCP_SERVERS } from "@workspace/ui/components/bot-settings-dialog/mcp-servers.fixtures"
import { Icons } from "@workspace/ui/components/icons"
import type { SettingsPage } from "@workspace/ui/components/plugin-settings/settings-pages"
import { BOT_SKILLS } from "@workspace/ui/components/plugin-settings/skills.fixtures"
import { useMcpSession } from "@workspace/ui/components/plugin-settings/use-mcp-session"
import { useSkillSession } from "@workspace/ui/components/plugin-settings/use-skill-session"
import {
	SettingsDialogShell,
	type SettingsDialogShellProps,
} from "@workspace/ui/components/settings-dialog-shell"
import {
	SETTINGS_PANEL_CLASS,
	SettingsRailItem,
} from "@workspace/ui/components/settings-rail"
import { usePushedPages } from "@workspace/ui/hooks/use-pushed-pages"

const railOf = (iconsOnly: boolean) => (
	<>
		<SettingsRailItem
			icon="Settings"
			iconsOnly={iconsOnly}
			label="General"
			value="general"
		/>
		<SettingsRailItem
			icon="Skill"
			iconsOnly={iconsOnly}
			label="Skills"
			value="skills"
		/>
		<SettingsRailItem
			icon="Server"
			iconsOnly={iconsOnly}
			label="Applications"
			value="mcp"
		/>
	</>
)

const GeneralPanel = () => (
	<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="general">
		<span className="text-muted-foreground text-sm">General</span>
	</Tabs.Panel>
)

const ShellWithoutSession = (props: SettingsDialogShellProps) => (
	<SettingsDialogShell {...props}>
		<GeneralPanel />
		<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="skills">
			<span className="text-muted-foreground text-sm">Skills</span>
		</Tabs.Panel>
	</SettingsDialogShell>
)

const ShellWithSessions = (props: SettingsDialogShellProps) => {
	const pages = usePushedPages<SettingsPage>()
	const skillSession = useSkillSession({
		pages,
		skills: BOT_SKILLS,
		onSkillChange: fn(),
		onSkillCreate: fn(),
		onSkillDelete: fn(),
		onSkillPreloadedChange: fn(),
	})
	const mcpSession = useMcpSession({
		pages,
		owner: { kind: "companion", name: "Nest Keeper" },
		servers: BOT_MCP_SERVERS,
		onServerCreate: fn(),
		onServerChange: fn(),
		onServerDelete: fn(),
		isSettingsOpen: props.open,
	})

	return (
		<SettingsDialogShell
			{...props}
			pages={pages}
			sessions={{ skills: skillSession, applications: mcpSession }}
		>
			<GeneralPanel />
			<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="skills">
				{skillSession.panel}
			</Tabs.Panel>
			<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="mcp">
				{mcpSession.panel}
			</Tabs.Panel>
		</SettingsDialogShell>
	)
}

const dialogIn = async () => {
	const dialog = await screen.findByRole("dialog")
	await waitFor(() => expect(dialog).toBeVisible())
	await waitFor(async () => {
		await expect(dialog.contains(document.activeElement)).toBe(true)
	}, FRAME_POLL)
	return dialog
}

const typeIntoFirstSkill = async (user: ReturnType<typeof userEvent.setup>) => {
	const dialog = await dialogIn()
	await user.click(within(dialog).getByRole("tab", { name: "Skills" }))
	await user.click(
		within(dialog).getByRole("button", { name: /release-notes/ }),
	)
	const body = within(dialog).getByLabelText("Body")
	await user.type(body, "!")
	return body
}

const typeIntoFirstApplication = async (
	user: ReturnType<typeof userEvent.setup>,
) => {
	const dialog = await dialogIn()
	await user.click(within(dialog).getByRole("tab", { name: "Applications" }))
	await user.click(within(dialog).getByRole("button", { name: /atlas/ }))
	const command = within(dialog).getByLabelText("Command")
	await user.type(command, "x")
	return command
}

const ShellWithUnsavedWorkOffPage = (props: SettingsDialogShellProps) => (
	<SettingsDialogShell
		{...props}
		sessions={{
			applications: { pages: {}, isUnsaved: true, discard: fn() },
		}}
	>
		<GeneralPanel />
	</SettingsDialogShell>
)

const SKILL_LEAVE =
	"You’ll lose your unsaved changes. The saved skill stays as it is."

const APPLICATION_LEAVE =
	"You’ll lose your unsaved changes. The saved application stays as it is."

const confirmationIn = async () => {
	const asked = await screen.findByRole("alertdialog")
	await waitFor(() => expect(asked).toBeVisible())
	return asked
}

const meta = preview.meta({
	title: "Settings/SettingsDialogShell",
	component: SettingsDialogShell,
	tags: ["test-only"],
	render: (args) => <ShellWithSessions {...args} />,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The frame every settings dialog shares: the surface and its size, the header reading mark, name, chevron and breadcrumb, the rail and the panels under one tabs root, and the question asked before a close drops unsaved work. A dialog hands it its sessions, its header mark, its rail entries and its panels, and nothing else.",
			},
		},
	},
	args: {
		open: true,
		onClose: fn(),
		tab: "general",
		mark: (
			<Icons.Settings
				aria-hidden="true"
				className="size-5 shrink-0 text-muted-foreground"
			/>
		),
		name: "Nest Keeper",
		breadcrumb: "Settings",
		rail: railOf,
		children: null,
	},
})

export const GuardRaised = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Escape over a skill with something typed into it. Check that the skill question is asked and the dialog stays open.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const body = await typeIntoFirstSkill(userEvent)
		await userEvent.keyboard("{Escape}")

		const asked = await confirmationIn()
		await expect(
			within(asked).getByRole("button", { name: "Leave" }),
		).toBeVisible()
		await expect(body).toBeInTheDocument()
		await expect(args.onClose).not.toHaveBeenCalled()
	},
})

export const GuardRefused = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The question refused. Check that the skill page stays with what was typed and that no close is reported.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const body = await typeIntoFirstSkill(userEvent)
		await userEvent.keyboard("{Escape}")

		const asked = await confirmationIn()
		await userEvent.click(within(asked).getByRole("button", { name: "Cancel" }))

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(body).toHaveValue(`${BOT_SKILLS[0]?.body}!`)
		await expect(args.onClose).not.toHaveBeenCalled()
	},
})

export const GuardAccepted = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The question accepted. Check that the close is reported exactly once.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		await typeIntoFirstSkill(userEvent)
		await userEvent.keyboard("{Escape}")

		const asked = await confirmationIn()
		await userEvent.click(within(asked).getByRole("button", { name: "Leave" }))

		await waitFor(() => expect(args.onClose).toHaveBeenCalledTimes(1))
	},
})

export const WithoutSessionClosesUnasked = meta.story({
	render: (args) => <ShellWithoutSession {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A dialog that declares no session, as the conversation dialog does. Check that Escape reports the close at once, with no question.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		await dialogIn()
		await userEvent.keyboard("{Escape}")

		await waitFor(() => expect(args.onClose).toHaveBeenCalledTimes(1))
		await expect(screen.queryByRole("alertdialog")).toBe(null)
	},
})

export const RailIconsOnly = meta.story({
	args: { className: "w-[32rem]" },
	parameters: {
		docs: {
			description: {
				story:
					"A surface narrower than the rail label width. Check that the rail drops to its icons while every entry stays named to a screen reader.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()
		await expectHeadingFont(within(dialog).getByRole("heading", { level: 2 }))
		const general = within(dialog).getByRole("tab", { name: "General" })
		const skills = within(dialog).getByRole("tab", { name: "Skills" })

		await waitFor(() =>
			expect(within(general).getByText("General")).toHaveClass("sr-only"),
		)
		await expect(within(skills).getByText("Skills")).toHaveClass("sr-only")
	},
})

export const ChordIgnored = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The settings chord over an open shell with a skill holding unsaved work: the chord only opens the reader's settings from the workspace and never closes a dialog. Check that nothing is asked, nothing is reported and the skill page stays on screen.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const body = await typeIntoFirstSkill(userEvent)
		await userEvent.keyboard("{Meta>},{/Meta}")

		await expect(screen.queryByRole("alertdialog")).toBe(null)
		await expect(body).toBeVisible()
		await expect(args.onClose).not.toHaveBeenCalled()
	},
})

export const SkillPageWording = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Escape over a skill page with unsaved work. Check that the question speaks of the saved skill.",
			},
		},
	},
	play: async ({ userEvent }) => {
		await typeIntoFirstSkill(userEvent)
		await userEvent.keyboard("{Escape}")

		const asked = await confirmationIn()
		await expect(within(asked).getByText(SKILL_LEAVE)).toBeVisible()
	},
})

export const ApplicationPageWording = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Escape over an application page with unsaved work. Check that the question speaks of the saved application.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		await typeIntoFirstApplication(userEvent)
		await userEvent.keyboard("{Escape}")

		const asked = await confirmationIn()
		await expect(within(asked).getByText(APPLICATION_LEAVE)).toBeVisible()
		await expect(args.onClose).not.toHaveBeenCalled()
	},
})

export const DefaultWordingWithNoPage = meta.story({
	render: (args) => <ShellWithUnsavedWorkOffPage {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Unsaved work with no page on screen, declared by an application session only. Check that the question takes the named default wording, the skill one, rather than the wording of the first session declared.",
			},
		},
	},
	play: async ({ userEvent }) => {
		await dialogIn()
		await userEvent.keyboard("{Escape}")

		const asked = await confirmationIn()
		await expect(within(asked).getByText(SKILL_LEAVE)).toBeVisible()
	},
})
