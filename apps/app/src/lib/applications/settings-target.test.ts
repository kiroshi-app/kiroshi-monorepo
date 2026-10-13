// @vitest-environment happy-dom

import { cleanup, render, screen, within } from "@testing-library/react"
import { createElement, Fragment } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BLANK_BOT_PERMISSIONS } from "@workspace/ui/components/bot-settings"
import { BotSettingsDialog } from "@workspace/ui/components/bot-settings-dialog"
import { BOT_MCP_SERVERS } from "@workspace/ui/components/bot-settings-dialog/mcp-servers.fixtures"
import {
	BOT_ENVIRONMENT,
	SPACE_ENVIRONMENT,
} from "@workspace/ui/components/environment.fixtures"
import {
	HISTORY_DAYS,
	HISTORY_OLDEST_DATE,
} from "@workspace/ui/components/plugin-settings/history.fixtures"
import { BOT_SKILLS } from "@workspace/ui/components/plugin-settings/skills.fixtures"
import { SpaceSettingsDialog } from "@workspace/ui/components/space-settings-dialog"
import { UserSettingsDialog } from "@workspace/ui/components/user-settings-dialog"

import "@workspace/ui/lib/i18n"

import { applicationToOpenIn, type SettingsTarget } from "./settings-target"

import { APPLICATIONS_TAB } from "@/lib/applications/connection-settings"

const SPACE_ID = "space-of-the-release"
const COMPANION_ID = "companion-of-the-nest"
const READER = "Reader"
const SPACE_NAME = "Release desk"
const COMPANION_NAME = "Nest Keeper"
const SHARED_APPLICATION = "atlas"

const SPACE_SCOPE = { kind: "space", id: SPACE_ID } as const
const COMPANION_SCOPE = { kind: "companion", id: COMPANION_ID } as const

const COMPANION = {
	identity: {},
	name: COMPANION_NAME,
	title: "Repository archivist",
	instructions: "",
	model: "sonnet-4-5",
	effort: null,
	permissions: BLANK_BOT_PERMISSIONS,
}

const HISTORY = {
	days: HISTORY_DAYS,
	oldestDate: HISTORY_OLDEST_DATE,
	onUndo: vi.fn(),
}

const SKILL_HANDLERS = {
	skills: BOT_SKILLS,
	onSkillChange: vi.fn(),
	onSkillCreate: vi.fn(),
	onSkillDelete: vi.fn(),
	onSkillPreloadedChange: vi.fn(),
}

const APPLICATION_HANDLERS = {
	onServerChange: vi.fn(),
	onServerCreate: vi.fn(),
	onServerDelete: vi.fn(),
}

type SettingsProps = { application?: SettingsTarget }

const OpenedSettings = ({ application }: SettingsProps) =>
	createElement(
		Fragment,
		null,
		createElement(UserSettingsDialog, {
			applications: {
				...APPLICATION_HANDLERS,
				servers: BOT_MCP_SERVERS,
				serverToOpen: applicationToOpenIn({ kind: "user" }, application),
			},
			history: HISTORY,
			language: null,
			onClose: vi.fn(),
			onLanguageChange: vi.fn(),
			onValueChange: vi.fn(),
			open: true,
			tab: APPLICATIONS_TAB,
			value: { name: READER, colorScheme: "system" as const },
			...SKILL_HANDLERS,
		}),
		createElement(SpaceSettingsDialog, {
			environment: SPACE_ENVIRONMENT,
			history: HISTORY,
			mcpServers: BOT_MCP_SERVERS,
			mcpServerToOpen: applicationToOpenIn(SPACE_SCOPE, application),
			onClose: vi.fn(),
			onDelete: vi.fn(),
			onEnvironmentDelete: vi.fn(),
			onEnvironmentSet: vi.fn(),
			onMcpServerChange: vi.fn(),
			onMcpServerCreate: vi.fn(),
			onMcpServerDelete: vi.fn(),
			onValueChange: vi.fn(),
			open: true,
			tab: APPLICATIONS_TAB,
			value: { name: SPACE_NAME, colour: "blue" as const },
			...SKILL_HANDLERS,
		}),
		createElement(BotSettingsDialog, {
			environment: BOT_ENVIRONMENT,
			history: HISTORY,
			mcpServers: BOT_MCP_SERVERS,
			mcpServerToOpen: applicationToOpenIn(COMPANION_SCOPE, application),
			models: [
				{
					label: "Claude Sonnet 4.5",
					value: "sonnet-4-5",
					supportedEfforts: [],
				},
			],
			onAvatarUpload: vi.fn(),
			onClose: vi.fn(),
			onDelete: vi.fn(),
			onEnvironmentDelete: vi.fn(),
			onEnvironmentSet: vi.fn(),
			onMcpServerChange: vi.fn(),
			onMcpServerCreate: vi.fn(),
			onMcpServerDelete: vi.fn(),
			onValueChange: vi.fn(),
			open: true,
			tab: APPLICATIONS_TAB,
			value: COMPANION,
			...SKILL_HANDLERS,
		}),
	)

const BEHIND_ANOTHER_DIALOG = { hidden: true }

const dialogNamed = (name: string) =>
	screen.getByRole("dialog", {
		...BEHIND_ANOTHER_DIALOG,
		name: new RegExp(name),
	})

const openedApplicationIn = (dialog: HTMLElement) =>
	within(dialog).queryByRole("button", {
		...BEHIND_ANOTHER_DIALOG,
		name: "Remove application",
	})

const listedApplicationIn = (dialog: HTMLElement) =>
	within(dialog).queryByRole("button", {
		...BEHIND_ANOTHER_DIALOG,
		name: new RegExp(SHARED_APPLICATION),
	})

const openSettingsOn = (scope: SettingsTarget["scope"]) => {
	const { rerender } = render(createElement(OpenedSettings))

	rerender(
		createElement(OpenedSettings, {
			application: { scope, application: SHARED_APPLICATION },
		}),
	)
}

const expectListedOnly = (name: string) => {
	const dialog = dialogNamed(name)

	expect(listedApplicationIn(dialog)).toBeTruthy()
	expect(openedApplicationIn(dialog)).toBe(null)
}

afterEach(cleanup)

describe("opening an application on one scope", () => {
	it("opens the space editor and lists the profile and companion", () => {
		openSettingsOn(SPACE_SCOPE)

		expectListedOnly(READER)
		expectListedOnly(COMPANION_NAME)
		expect(openedApplicationIn(dialogNamed(SPACE_NAME))).toBeTruthy()
	})

	it("opens the companion editor and lists the profile and space", () => {
		openSettingsOn(COMPANION_SCOPE)

		expectListedOnly(READER)
		expectListedOnly(SPACE_NAME)
		expect(openedApplicationIn(dialogNamed(COMPANION_NAME))).toBeTruthy()
	})
})
