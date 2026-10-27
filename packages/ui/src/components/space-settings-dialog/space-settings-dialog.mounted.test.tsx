// @vitest-environment happy-dom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react"
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest"

import { BOT_MCP_SERVERS } from "@workspace/ui/components/bot-settings-dialog/mcp-servers.fixtures"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import {
	SERVER_ENVIRONMENT,
	SPACE_ENVIRONMENT,
} from "@workspace/ui/components/environment.fixtures"
import {
	HISTORY_DAYS,
	HISTORY_OLDEST_DATE,
} from "@workspace/ui/components/plugin-settings/history.fixtures"
import { BOT_SKILLS } from "@workspace/ui/components/plugin-settings/skills.fixtures"
import type { PluginSessionsProps } from "@workspace/ui/components/plugin-settings/use-plugin-sessions"
import {
	SpaceSettingsDialog,
	type SpaceSettingsDialogProps,
} from "@workspace/ui/components/space-settings-dialog"

import "@workspace/ui/lib/i18n"

const SERVER_ENVIRONMENT_SECTION = {
	entries: SERVER_ENVIRONMENT,
	onSet: vi.fn(),
	onDelete: vi.fn(),
}

const SPACE_PROPS = {
	environment: SPACE_ENVIRONMENT,
	history: {
		days: HISTORY_DAYS,
		oldestDate: HISTORY_OLDEST_DATE,
		onUndo: vi.fn(),
	},
	mcpServers: BOT_MCP_SERVERS,
	onClose: vi.fn(),
	onDelete: vi.fn(),
	onEnvironmentDelete: vi.fn(),
	onEnvironmentSet: vi.fn(),
	onMcpServerChange: vi.fn(),
	onMcpServerCreate: vi.fn(),
	onMcpServerDelete: vi.fn(),
	onSkillChange: vi.fn(),
	onSkillCreate: vi.fn(),
	onSkillDelete: vi.fn(),
	onSkillPreloadedChange: vi.fn(),
	onValueChange: vi.fn(),
	open: true,
	serverEnvironment: SERVER_ENVIRONMENT_SECTION,
	skills: BOT_SKILLS,
	value: { name: "Release desk", colour: BLOT_HUES.blue },
} satisfies SpaceSettingsDialogProps

const spaceDialog = (overrides: Partial<PluginSessionsProps> = {}) =>
	render(<SpaceSettingsDialog {...SPACE_PROPS} {...overrides} />)

const pick = async (name: string) => {
	fireEvent.click(await screen.findByRole("tab", { name }))
	return screen.findByRole("tabpanel", { name })
}

const press = (name: string | RegExp, container: HTMLElement = document.body) =>
	fireEvent.click(within(container).getByRole("button", { name }))

const answer = (label: string, value: string) =>
	fireEvent.change(screen.getByLabelText(label), { target: { value } })

afterEach(cleanup)

describe("SpaceSettingsDialog applications", () => {
	it("lists the servers the space holds", async () => {
		spaceDialog()

		const panel = await pick("Applications")

		expect(within(panel).getByText("atlas")).toBeTruthy()
		expect(within(panel).getByText("ledger")).toBeTruthy()
	})

	it("says the listing failed instead of inviting a first application", async () => {
		spaceDialog({ haveMcpServersFailedToLoad: true, mcpServers: [] })

		const panel = await pick("Applications")

		expect(
			within(panel).getByText(
				"Couldn’t load applications. Reopen settings to retry.",
			),
		).toBeTruthy()
		expect(screen.queryByRole("button", { name: "Add an application" })).toBe(
			null,
		)
	})

	it("writes a new server under the name it was given", async () => {
		const onMcpServerCreate = vi.fn()
		spaceDialog({ mcpServers: [], onMcpServerCreate })

		press("Add an application", await pick("Applications"))
		answer("Name", "atlas")
		answer("Command", "npx")
		press("Add application")

		expect(onMcpServerCreate).toHaveBeenCalledWith("atlas", { command: "npx" })
	})

	it("takes away the server it was opened on", async () => {
		const onMcpServerDelete = vi.fn()
		spaceDialog({ onMcpServerDelete })

		press(/atlas/, await pick("Applications"))
		press("Remove application")
		press("Remove application", await screen.findByRole("alertdialog"))

		expect(onMcpServerDelete).toHaveBeenCalledWith("atlas")
	})

	it("shows the variables of a saved server beside its own", async () => {
		const onMcpServerOpen = vi.fn()
		spaceDialog({ onMcpServerOpen })

		press(/atlas/, await pick("Applications"))

		expect(onMcpServerOpen).toHaveBeenLastCalledWith("atlas")
		expect(within(await pick("Secrets")).getByText("LEDGER_KEY")).toBeTruthy()
	})

	it("shows no variables for a server that was never saved", async () => {
		const onMcpServerOpen = vi.fn()
		spaceDialog({ mcpServers: [], onMcpServerOpen })

		press("Add an application", await pick("Applications"))

		expect(onMcpServerOpen).toHaveBeenLastCalledWith(null)
		expect(within(await pick("Secrets")).queryByText("LEDGER_KEY")).toBe(null)
	})
})

describe("SpaceSettingsDialog tab", () => {
	it("refuses onTabChange without tab", () => {
		const onTabChange = vi.fn()

		expectTypeOf({
			...SPACE_PROPS,
			onTabChange,
		}).not.toExtend<SpaceSettingsDialogProps>()
		expectTypeOf({
			...SPACE_PROPS,
			tab: "hosting",
			onTabChange,
		}).toExtend<SpaceSettingsDialogProps>()
	})
})
