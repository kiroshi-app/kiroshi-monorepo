// @vitest-environment happy-dom

import { RouterProvider } from "@tanstack/react-router"
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import type { MissionInSpace } from "@/lib/bindings"
import { newBotIdentity } from "@/lib/bots/bot-settings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { aMission } from "@/lib/missions/mission-fixtures"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import type { CatalogueChat } from "@/lib/search/catalogue-contract"
import { readMirror, writeMirror } from "@/lib/user/preferences-mirror"

type Harness = {
	store: TranscriptStore | null
	missions: MissionInSpace[]
	recents: CatalogueChat[]
}

const harness = vi.hoisted(
	(): Harness => ({ store: null, missions: [], recents: [] }),
)

vi.mock("@/lib/conversations/create-store", () => ({
	createTranscriptStore: () => harness.store,
}))

vi.mock("@/lib/host/index", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/index")>()),
	isDesktopHost: () => false,
}))

vi.mock("@/lib/chat/create-driver", async () => {
	const { withFakeHostWrites } = await import(
		"@/lib/conversations/fake-host-writes"
	)
	return {
		createChatDriver: (store: TranscriptStore) =>
			withFakeHostWrites(createFakeChatDriver({ stepMs: 1 }), store),
	}
})

vi.mock("@/lib/missions/missions-transport", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/missions/missions-transport")>()
	const { aSpacePage } = await import("@/lib/missions/mission-fixtures")
	const heldMission = (missionId: string) => {
		const held = harness.missions.find(
			({ mission }) => mission.id === missionId,
		)
		if (!held) throw new Error(`no mission ${missionId}`)
		return held.mission
	}
	return {
		...actual,
		missionsTransport: {
			...actual.missionsTransport,
			spacePage: async () => aSpacePage(harness.missions),
			detail: async (missionId: string) => ({
				mission: heldMission(missionId),
				events: [],
			}),
		},
	}
})

vi.mock("@/lib/search/search-port", () => ({
	searchPort: {
		messages: async () => [],
		catalogue: async () => ({ chats: [], missions: [], routines: [] }),
		recent: async () => harness.recents,
	},
}))

const { createWorkspaceRouter } = await import("@/workspace-router")

const SETTLE_MS = 200

const ROOM_TITLE = "Round table"

const FIRST_OBJECTIVE = "Ship the release notes"

const SECOND_OBJECTIVE = "Tidy the changelog"

const USER_SETTINGS_HREF = "/settings/user"

const MIDDLE_BUTTON = 1

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.useRealTimers()
	harness.store = null
	harness.missions = []
	harness.recents = []
	for (const anchor of document.querySelectorAll("a[data-test-link]")) {
		anchor.remove()
	}
})

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(SETTLE_MS)
	})
}

const missionIn = (
	room: { id: string; title: string },
	botId: string,
	spaceId: string,
	objective: string,
): MissionInSpace => ({
	mission: aMission({
		id: missionIdOf(objective),
		botId,
		objective,
		originConversationId: room.id,
		spaceId,
		threadConversationId: room.id,
	}),
	conversationId: room.id,
	conversationTitle: room.title,
})

const mountApp = async () => {
	writeMirror({ ...readMirror(), firstRunDone: true })
	const store = createFakeTranscriptStore()
	const [space] = await store.spaces()
	const bot = await store.createBot(newBotIdentity([]), space.id)
	const room = await store.createConversation({
		botIds: [bot.id],
		sectionId: null,
		spaceId: space.id,
		title: ROOM_TITLE,
	})
	harness.missions = [FIRST_OBJECTIVE, SECOND_OBJECTIVE].map((objective) =>
		missionIn(room, bot.id, space.id, objective),
	)
	harness.recents = [
		{
			conversationId: room.id,
			kind: "topic",
			title: ROOM_TITLE,
			botId: null,
			participants: [bot.name],
			spaceId: space.id,
		},
	]
	vi.useFakeTimers()
	harness.store = store
	const router = createWorkspaceRouter()
	render(createElement(RouterProvider, { router }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
	return { botId: bot.id, botName: bot.name, router }
}

const missionIdOf = (objective: string) => `mission-${objective}`

const titleBarOf = () =>
	document.querySelector<HTMLElement>(
		'[data-slot="app-title-bar"]',
	) as HTMLElement

const tabNames = () =>
	within(titleBarOf())
		.getAllByRole("tab")
		.map((tab) => tab.getAttribute("aria-label") ?? tab.textContent)

const tabsOf = () => within(titleBarOf()).getAllByRole("tab")

const activeTabIndex = () =>
	tabsOf().findIndex((tab) => tab.getAttribute("aria-selected") === "true")

const activeTabName = () => {
	const active = within(titleBarOf()).getByRole("tab", { selected: true })
	return active.getAttribute("aria-label") ?? active.textContent
}

const click = async (target: Element, init: MouseEventInit = {}) => {
	await act(async () => {
		fireEvent.click(target, { detail: 1, ...init })
	})
	await settle()
}

const middleClick = async (target: Element) => {
	await act(async () => {
		fireEvent(
			target,
			new MouseEvent("auxclick", {
				bubbles: true,
				cancelable: true,
				button: MIDDLE_BUTTON,
				detail: 1,
			}),
		)
	})
	await settle()
}

const rosterRowOf = (name: string) =>
	[...document.querySelectorAll('[data-slot="roster-row-name"]')]
		.find((label) => label.textContent === name)
		?.closest("button") as HTMLElement

const showMissions = () =>
	click(
		within(
			screen.getByRole("navigation", { name: i18n.t("bots:rail.label") }),
		).getByRole("button", { name: i18n.t("bots:rail.missions") }),
	)

const missionRowOf = (objective: string) =>
	screen.getByRole("button", { name: new RegExp(objective) })

const openSearch = async () => {
	await act(async () => {
		fireEvent.keyDown(window, { key: "k", metaKey: true })
	})
	await settle()
}

const searchResultOf = (title: string) =>
	screen.getByRole("option", { name: new RegExp(title) })

const linkTo = (href: string) => {
	const anchor = document.createElement("a")
	anchor.href = href
	anchor.dataset.testLink = ""
	anchor.textContent = href
	document.body.append(anchor)
	return anchor
}

describe("a mission of the sidebar missions list", () => {
	it("opens in the active tab on a plain click", async () => {
		const { router } = await mountApp()
		await showMissions()

		await click(missionRowOf(SECOND_OBJECTIVE))

		expect(tabsOf()).toHaveLength(1)
		expect(router.state.location.search.mission).toBe(
			missionIdOf(SECOND_OBJECTIVE),
		)
	})

	it("opens in a new background tab on Cmd-click", async () => {
		const { router } = await mountApp()
		await showMissions()

		await click(missionRowOf(SECOND_OBJECTIVE), { metaKey: true })

		expect(tabsOf()).toHaveLength(2)
		expect(activeTabIndex()).toBe(0)
		expect(router.state.location.search.mission).toBe(
			missionIdOf(FIRST_OBJECTIVE),
		)

		await click(tabsOf()[1] as HTMLElement)

		expect(router.state.location.search.mission).toBe(
			missionIdOf(SECOND_OBJECTIVE),
		)
	})
})

describe("a search result", () => {
	it("opens in the active tab on a plain click", async () => {
		const { botName } = await mountApp()
		await click(rosterRowOf(botName))
		await openSearch()

		await click(searchResultOf(ROOM_TITLE))

		expect(tabNames()).toEqual([ROOM_TITLE])
	})

	it("opens in a new background tab on Cmd-click", async () => {
		const { botName } = await mountApp()
		await click(rosterRowOf(botName))
		await openSearch()

		await click(searchResultOf(ROOM_TITLE), { metaKey: true })

		expect(tabNames()).toEqual([botName, ROOM_TITLE])
		expect(activeTabName()).toBe(botName)
	})
})

describe("an in-app link", () => {
	it("opens its destination in a new background tab on middle-click and on Cmd-click", async () => {
		const { botId, botName } = await mountApp()
		await click(rosterRowOf(ROOM_TITLE))
		const settingsName = i18n.t("settings:screen.subtitle.user")

		await middleClick(linkTo(USER_SETTINGS_HREF))

		expect(tabNames()).toEqual([ROOM_TITLE, settingsName])
		expect(activeTabName()).toBe(ROOM_TITLE)

		await click(linkTo(`/?bot=${botId}`), { metaKey: true })

		expect(tabNames()).toEqual([ROOM_TITLE, botName, settingsName])
		expect(activeTabName()).toBe(ROOM_TITLE)
	})

	it("leaves an external link to the external-link path", async () => {
		const { botName } = await mountApp()
		await click(rosterRowOf(botName))
		const external = linkTo("https://example.com/notes")
		const middle = new MouseEvent("auxclick", {
			bubbles: true,
			cancelable: true,
			button: MIDDLE_BUTTON,
			detail: 1,
		})

		await act(async () => {
			fireEvent(external, middle)
		})
		await settle()

		expect(middle.defaultPrevented).toBe(false)
		expect(tabNames()).toEqual([botName])
	})
})
