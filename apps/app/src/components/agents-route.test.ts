// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import type { Space } from "@workspace/ui/components/space"
import { i18n } from "@workspace/ui/lib/i18n"

import { AgentsRoute } from "@/components/agents-route"
import type { CompanionCounts } from "@/lib/bindings"
import type { Bot } from "@/lib/conversations/store-contract"
import { botIdentity } from "@/lib/conversations/transcript-fixtures"
import { invoke, isDesktopHost } from "@/lib/host/index"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { isJoinedRowId } from "@/lib/spaces/joined-spaces-controller"
import type { WorkspaceAssembly } from "@/lib/workspace/use-workspace-assembly"
import { WorkspaceContext } from "@/lib/workspace/workspace-context"

vi.mock("@/lib/host/index", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/index")>()),
	isDesktopHost: vi.fn(() => false),
	invoke: vi.fn(async () => []),
}))

const agentOf = (id: string, name: string): Bot => ({
	...botIdentity({ name, instructions: `${name} reads the diff.` }),
	id,
	createdAt: 1,
	memory: "",
	sectionId: null,
	pinPosition: null,
	changesNothing: true,
})

const ADA = agentOf("b-ada", "Ada")
const BO = agentOf("b-bo", "Bo")
const CY = agentOf("b-cy", "Cy")

const spaceOf = (id: string, name: string): Space => ({
	id,
	name,
	colour: null,
	avatarSeed: id,
})

const HOME = spaceOf("home", "Home")
const OFFICE = spaceOf("office", "Office")
const GARAGE = spaceOf("joined:garage", "Garage")

const ROSTERS = {
	[HOME.id]: [ADA, BO],
	[OFFICE.id]: [ADA, CY],
	[GARAGE.id]: [CY],
}

const sidebarActions = {
	onAddBotToSpace: vi.fn(),
	onCreateBot: vi.fn(),
	onDeleteBot: vi.fn(),
	onDuplicateBot: vi.fn(),
	onOpenBotInNewTab: vi.fn(),
	onRemoveBotFromSpace: vi.fn(),
}

const openCompanionSettings = vi.fn()

type Roster = {
	hasLoaded: boolean
	rosteredSpaceId: string
	isRosterPending: boolean
	hasFailedToLoad: boolean
}

const ROSTER_SHOWN = {
	hasLoaded: true,
	isRosterPending: false,
	hasFailedToLoad: false,
}

const workspaceOn = (
	space: Space,
	roster: Partial<Roster> = {},
): WorkspaceAssembly => {
	const { hasLoaded, rosteredSpaceId, isRosterPending, hasFailedToLoad } = {
		...ROSTER_SHOWN,
		rosteredSpaceId: space.id,
		...roster,
	}
	return {
		core: {
			roster: { state: { rosters: ROSTERS, isRosterPending, hasFailedToLoad } },
		},
		navigation: { openCompanionSettings },
		rosterLines: { sidebarActions },
		rosterView: { bots: ROSTERS[rosteredSpaceId], hasLoaded, rosteredSpaceId },
		scopes: {
			openRowId: space.id,
			selectedSpace: isJoinedRowId(space.id) ? undefined : space,
		},
		switcher: { selectedSpace: space, ownedSpaces: [HOME, OFFICE] },
	} as unknown as WorkspaceAssembly
}

const agentsRouteIn = (workspace: WorkspaceAssembly) =>
	createElement(
		WorkspaceContext.Provider,
		{ value: workspace },
		createElement(AgentsRoute),
		createElement(NoticeSurface),
	)

const showAgentsOf = (workspace: WorkspaceAssembly) =>
	render(agentsRouteIn(workspace), {
		wrapper: createQueryTestWrapper().wrapper,
	})

const slotsOf = (slot: string) => [
	...document.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`),
]

const cardNames = () =>
	slotsOf("companion-card-name").map((name) => name.textContent)

const cardOf = (agent: Bot) => {
	const card = slotsOf("companion-card").find(
		(shown) =>
			shown.querySelector('[data-slot="companion-card-name"]')?.textContent ===
			agent.name,
	)
	if (!card) throw new Error(`no card for ${agent.name}`)
	return card
}

const captionOf = (space: Space) =>
	screen.queryByText(
		i18n.t("settings:space.agents.caption", { space: space.name }),
	)

const press = async (control: HTMLElement) => {
	await act(async () => {
		fireEvent.click(control)
	})
}

const openMenuOf = async (agent: Bot) => {
	const label = i18n.t("bots:roster.actions", { name: agent.name })
	await press(screen.getByRole("button", { name: label }))
	return screen.findByRole("menu", { name: label })
}

const chooseInMenuOf = async (agent: Bot, item: string) =>
	press(within(await openMenuOf(agent)).getByRole("menuitem", { name: item }))

const toggleSpaceOf = async (agent: Bot, space: Space) => {
	const menu = await openMenuOf(agent)
	await press(
		within(menu).getByRole("menuitem", {
			name: i18n.t("bots:roster.spaces.label"),
		}),
	)
	await press(await screen.findByRole("menuitemcheckbox", { name: space.name }))
}

const COUNTS_LINE = /skill|application/

const countsLineOf = (agent: Bot) =>
	within(cardOf(agent)).queryByText(COUNTS_LINE)?.textContent ?? null

const readCounts = vi.fn<(spaceId: string) => Promise<CompanionCounts[]>>()

const serveCounts = () => {
	vi.mocked(isDesktopHost).mockReturnValue(true)
	vi.mocked(invoke).mockImplementation(async (command: string, args) =>
		command === "space_companion_counts"
			? readCounts((args as { spaceId: string }).spaceId)
			: [],
	)
}

afterEach(() => {
	cleanup()
	vi.mocked(isDesktopHost).mockReturnValue(false)
	vi.clearAllMocks()
	readCounts.mockReset()
})

describe("the Agents page of the Space on screen", () => {
	it("lists the agents of that Space under its name", () => {
		showAgentsOf(workspaceOn(HOME))

		expect(cardNames()).toEqual([ADA.name, BO.name])
		expect(captionOf(HOME)).not.toBeNull()
	})

	it("lists the agents of the new Space once the Space on screen changes", () => {
		const { rerender } = showAgentsOf(workspaceOn(HOME))

		rerender(agentsRouteIn(workspaceOn(OFFICE)))

		expect(cardNames()).toEqual([ADA.name, CY.name])
		expect(captionOf(OFFICE)).not.toBeNull()
		expect(captionOf(HOME)).toBeNull()
	})

	it.each<{ reason: string; roster: Partial<Roster> }>([
		{ reason: "no roster has loaded", roster: { hasLoaded: false } },
		{
			reason: "the roster held is the one of another Space",
			roster: { rosteredSpaceId: OFFICE.id },
		},
		{ reason: "its roster is being read", roster: { isRosterPending: true } },
		{ reason: "its roster failed to load", roster: { hasFailedToLoad: true } },
	])("shows the loading page while $reason", ({ roster }) => {
		showAgentsOf(workspaceOn(HOME, roster))

		expect(slotsOf("agents-page-skeleton")).toHaveLength(1)
		expect(cardNames()).toEqual([])
	})
})

describe("an action of the Agents page", () => {
	it("opens the settings of a pressed card as opened from the Agents page", async () => {
		showAgentsOf(workspaceOn(HOME))

		await press(cardOf(BO))

		expect(openCompanionSettings.mock.calls).toEqual([
			[BO.id, { isFromAgentsPage: true }],
		])
	})

	it("opens the settings from Open settings as opened from the Agents page", async () => {
		showAgentsOf(workspaceOn(HOME))

		await chooseInMenuOf(BO, i18n.t("bots:roster.settings"))

		expect(openCompanionSettings.mock.calls).toEqual([
			[BO.id, { isFromAgentsPage: true }],
		])
	})

	it("runs the create flow of the sidebar from Create an agent", async () => {
		showAgentsOf(workspaceOn(HOME))

		await press(
			screen.getByRole("button", {
				name: i18n.t("settings:space.agents.create"),
			}),
		)

		expect(sidebarActions.onCreateBot).toHaveBeenCalledOnce()
	})

	it.each([
		{ item: "roster.openInNewTab", handler: "onOpenBotInNewTab" },
		{ item: "roster.duplicate", handler: "onDuplicateBot" },
		{ item: "roster.delete", handler: "onDeleteBot" },
	] as const)(
		"hands the agent of $item to $handler of the sidebar menu",
		async ({ item, handler }) => {
			showAgentsOf(workspaceOn(HOME))

			await chooseInMenuOf(BO, i18n.t(`bots:${item}`))

			expect(sidebarActions[handler].mock.calls).toEqual([[BO.id]])
		},
	)

	it("adds an agent to a Space it is not in through the sidebar handler", async () => {
		showAgentsOf(workspaceOn(HOME))

		await toggleSpaceOf(BO, OFFICE)

		expect(sidebarActions.onAddBotToSpace.mock.calls).toEqual([
			[BO.id, OFFICE.id],
		])
		expect(sidebarActions.onRemoveBotFromSpace).not.toHaveBeenCalled()
	})

	it("removes an agent from a Space it is in through the sidebar handler", async () => {
		showAgentsOf(workspaceOn(HOME))

		await toggleSpaceOf(ADA, OFFICE)

		expect(sidebarActions.onRemoveBotFromSpace.mock.calls).toEqual([
			[ADA.id, OFFICE.id],
		])
		expect(sidebarActions.onAddBotToSpace).not.toHaveBeenCalled()
	})
})

describe("the skills and applications counts of the Agents page", () => {
	it("reads the counts of the owned Space on screen and gives each card its own", async () => {
		serveCounts()
		readCounts.mockResolvedValue([
			{ botId: BO.id, skillsCount: 5, applicationsCount: 1 },
		])

		showAgentsOf(workspaceOn(HOME))

		await waitFor(() =>
			expect(countsLineOf(BO)).toBe("5 skills · 1 application"),
		)
		expect(countsLineOf(ADA)).toBeNull()
		expect(readCounts.mock.calls).toEqual([[HOME.id]])
	})

	it("reads the counts of the new Space once the Space on screen changes", async () => {
		serveCounts()
		readCounts.mockResolvedValue([])
		const { rerender } = showAgentsOf(workspaceOn(HOME))

		rerender(agentsRouteIn(workspaceOn(OFFICE)))

		await waitFor(() =>
			expect(readCounts.mock.calls).toEqual([[HOME.id], [OFFICE.id]]),
		)
	})

	it("reads no counts for a joined Space and still lists its agents", async () => {
		serveCounts()

		showAgentsOf(workspaceOn(GARAGE))
		await act(async () => undefined)

		expect(cardNames()).toEqual([CY.name])
		expect(readCounts).not.toHaveBeenCalled()
	})

	it("raises one notice and keeps every card when the counts cannot be read", async () => {
		serveCounts()
		readCounts.mockRejectedValue({ kind: "unknownSpace", id: HOME.id })

		showAgentsOf(workspaceOn(HOME))

		expect(
			await screen.findAllByRole("heading", {
				name: i18n.t("settings:space.agents.countsUnreadable"),
				hidden: true,
			}),
		).toHaveLength(1)
		expect(cardNames()).toEqual([ADA.name, BO.name])
		expect([ADA, BO].map(countsLineOf)).toEqual([null, null])
	})
})
