// @vitest-environment happy-dom

import { RouterProvider } from "@tanstack/react-router"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
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
import { readMirror, writeMirror } from "@/lib/user/preferences-mirror"
import type { SidebarPanel } from "@/lib/user/use-sidebar-tab"

type Harness = {
	store: TranscriptStore | null
	missions: MissionInSpace[]
	openSidebarTab: ((panel: SidebarPanel) => void) | null
}

const harness = vi.hoisted(
	(): Harness => ({ store: null, missions: [], openSidebarTab: null }),
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

vi.mock("@/lib/bindings", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/bindings")>()
	return {
		...actual,
		commands: {
			...actual.commands,
			libraryList: async () => ({ status: "ok", data: [] }),
		},
	}
})

vi.mock("@/lib/user/use-sidebar-tab", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/user/use-sidebar-tab")>()
	return {
		...actual,
		useSidebarTab: (user: Parameters<typeof actual.useSidebarTab>[0]) => {
			const sidebarTab = actual.useSidebarTab(user)
			harness.openSidebarTab = sidebarTab.openSidebarTab
			return sidebarTab
		},
	}
})

const { createWorkspaceRouter } = await import("@/workspace-router")

const SETTLE_MS = 200

const ROOM_TITLE = "Round table"

const OTHER_ROOM_TITLE = "Back room"

const FIRST_OBJECTIVE = "Ship the release notes"

const SECOND_OBJECTIVE = "Tidy the changelog"

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.useRealTimers()
	harness.store = null
	harness.missions = []
	harness.openSidebarTab = null
})

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(SETTLE_MS)
	})
}

const missionIdOf = (objective: string) => `mission-${objective}`

const mountApp = async () => {
	writeMirror({ ...readMirror(), firstRunDone: true })
	const store = createFakeTranscriptStore()
	const [space] = await store.spaces()
	const bot = await store.createBot(newBotIdentity([]), space.id)
	const conversationIn = (title: string) =>
		store.createConversation({
			botIds: [bot.id],
			sectionId: null,
			spaceId: space.id,
			title,
		})
	const room = await conversationIn(ROOM_TITLE)
	const otherRoom = await conversationIn(OTHER_ROOM_TITLE)
	harness.missions = [FIRST_OBJECTIVE, SECOND_OBJECTIVE].map((objective) => ({
		mission: aMission({
			id: missionIdOf(objective),
			botId: bot.id,
			objective,
			originConversationId: room.id,
			spaceId: space.id,
			threadConversationId: room.id,
		}),
		conversationId: room.id,
		conversationTitle: room.title,
	}))
	vi.useFakeTimers()
	harness.store = store
	const router = createWorkspaceRouter()
	render(createElement(RouterProvider, { router }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
	return { bot, room, otherRoom, router }
}

const click = async (target: Element) => {
	await act(async () => {
		fireEvent.click(target, { detail: 1 })
	})
	await settle()
}

const openLibrary = async () => {
	await act(async () => harness.openSidebarTab?.("library"))
	await settle()
}

const libraryHeading = () =>
	screen.queryByRole("heading", { level: 1, name: "Library" })

const shownThread = () => document.querySelector('[data-slot="chat-layout"]')

const rosterRowOf = (name: string) =>
	[...document.querySelectorAll('[data-slot="roster-row-name"]')]
		.find((label) => label.textContent === name)
		?.closest("button") as HTMLElement

const railButton = (entry: "conversations" | "missions") =>
	screen.getByRole("button", { name: i18n.t(`bots:rail.${entry}`) })

describe("the Library panel", () => {
	it("opens over the thread from code", async () => {
		await mountApp()

		await openLibrary()

		expect(libraryHeading()).not.toBeNull()
		expect(shownThread()).toBeNull()
	})

	it("closes on the conversation selected from the sidebar", async () => {
		const { router, otherRoom } = await mountApp()
		await openLibrary()

		await click(rosterRowOf(OTHER_ROOM_TITLE))

		expect(libraryHeading()).toBeNull()
		expect(shownThread()).not.toBeNull()
		expect(router.state.location.search.conversation).toBe(otherRoom.id)
	})

	it("closes on the agent selected from the sidebar", async () => {
		const { router, bot } = await mountApp()
		await openLibrary()

		await click(rosterRowOf(bot.name))

		expect(libraryHeading()).toBeNull()
		expect(shownThread()).not.toBeNull()
		expect(router.state.location.search.bot).toBe(bot.id)
	})

	it("closes on the mission selected from the sidebar", async () => {
		const { router } = await mountApp()
		await openLibrary()

		await click(railButton("missions"))
		await click(
			screen.getByRole("button", { name: new RegExp(SECOND_OBJECTIVE) }),
		)

		expect(libraryHeading()).toBeNull()
		expect(router.state.location.search.mission).toBe(
			missionIdOf(SECOND_OBJECTIVE),
		)
	})

	it("closes on Conversations in the rail, though Conversations reads as selected", async () => {
		await mountApp()
		await openLibrary()
		expect(railButton("conversations").getAttribute("aria-current")).toBe(
			"true",
		)

		await click(railButton("conversations"))

		expect(libraryHeading()).toBeNull()
		expect(shownThread()).not.toBeNull()
	})
})
