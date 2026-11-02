// @vitest-environment happy-dom

import { RouterProvider } from "@tanstack/react-router"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AppRailPanel } from "@workspace/ui/components/app-rail"
import { i18n } from "@workspace/ui/lib/i18n"

import { LibraryScreen } from "@/components/library-screen"
import type { LibraryItem, MissionInSpace } from "@/lib/bindings"
import { newBotIdentity } from "@/lib/bots/bot-settings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import type { Invoke } from "@/lib/host/joined-hosts-invoke"
import { titleOf } from "@/lib/library/library-items"
import { aMission } from "@/lib/missions/mission-fixtures"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { readMirror, writeMirror } from "@/lib/user/preferences-mirror"

type Harness = {
	store: TranscriptStore | null
	missions: MissionInSpace[]
	libraryItems: LibraryItem[]
}

const harness = vi.hoisted(
	(): Harness => ({ store: null, missions: [], libraryItems: [] }),
)

const LIBRARY_READS: Record<string, (name: string) => unknown> = {
	library_list: () => harness.libraryItems,
	library_read_document: (name) => ({ name, format: "text", content: "Notes" }),
	library_read_image: (name) => ({ name, mimeType: "image/png", content: "" }),
}

vi.mock("@/lib/conversations/create-store", () => ({
	createTranscriptStore: () => harness.store,
}))

vi.mock("@/lib/host/index", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/host/index")>()
	const invoke: Invoke = <T>(...call: Parameters<Invoke>) => {
		const [command, args] = call
		const read = LIBRARY_READS[command]
		const name = (args as { name?: string } | undefined)?.name ?? ""
		return read ? Promise.resolve(read(name) as T) : actual.invoke<T>(...call)
	}
	return { ...actual, invoke, isDesktopHost: () => false }
})

vi.mock("@/lib/host/tauri", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/tauri")>()),
	convertFileSrc: (path: string) => `asset://${path}`,
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

const { createWorkspaceRouter } = await import("@/workspace-router")

const SETTLE_MS = 200

const ROOM_TITLE = "Round table"

const OTHER_ROOM_TITLE = "Back room"

const OBJECTIVE = "Ship the release notes"

const LIBRARY_NAME = i18n.t("common:library.title")

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.useRealTimers()
	harness.store = null
	harness.missions = []
	harness.libraryItems = []
})

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(SETTLE_MS)
	})
}

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
	harness.missions = [
		{
			mission: aMission({
				id: "mission-release",
				botId: bot.id,
				objective: OBJECTIVE,
				originConversationId: room.id,
				spaceId: space.id,
				threadConversationId: room.id,
			}),
			conversationId: room.id,
			conversationTitle: room.title,
		},
	]
	vi.useFakeTimers()
	harness.store = store
	const router = createWorkspaceRouter()
	render(createElement(RouterProvider, { router }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
	return { otherRoom, router }
}

const click = async (target: Element) => {
	await act(async () => {
		fireEvent.click(target, { detail: 1 })
	})
	await settle()
}

const libraryHeading = () =>
	screen.queryByRole("heading", { level: 1, name: LIBRARY_NAME })

const shownThread = () => document.querySelector('[data-slot="chat-layout"]')

const rosterRowOf = (name: string) =>
	[...document.querySelectorAll('[data-slot="roster-row-name"]')]
		.find((label) => label.textContent === name)
		?.closest("button")

const railButton = (entry: AppRailPanel) =>
	screen.getByRole("button", { name: i18n.t(`bots:rail.${entry}`) })

const selectedRailEntries = () =>
	(["conversations", "missions", "library"] as const).filter(
		(entry) => railButton(entry).getAttribute("aria-current") === "true",
	)

const currentTab = () => screen.getByRole("tab", { selected: true })

const tabTitled = (title: string) =>
	screen
		.getAllByRole("tab")
		.find((tab) => tab.textContent?.includes(title)) as HTMLElement

const showOtherRoom = () => click(rosterRowOf(OTHER_ROOM_TITLE) as HTMLElement)

describe("the Library page of a tab", () => {
	it("opens from the rail as a new entry of the current tab, titled Library, without the conversation list", async () => {
		const { router } = await mountApp()
		await showOtherRoom()
		const tabCount = screen.getAllByRole("tab").length

		await click(railButton("library"))

		expect(router.state.location.pathname).toBe("/library")
		expect(router.history.canGoBack()).toBe(true)
		expect(screen.getAllByRole("tab")).toHaveLength(tabCount)
		expect(currentTab().textContent).toContain(LIBRARY_NAME)
		expect(libraryHeading()).not.toBeNull()
		expect(shownThread()).toBeNull()
		expect(rosterRowOf(ROOM_TITLE)).toBeUndefined()
		expect(rosterRowOf(OTHER_ROOM_TITLE)).toBeUndefined()
		expect(selectedRailEntries()).toEqual(["library"])
	})

	it("restores the conversation layout and the conversation shown before on Back", async () => {
		const { router, otherRoom } = await mountApp()
		await showOtherRoom()
		await click(railButton("library"))

		await act(async () => router.history.back())
		await settle()

		expect(libraryHeading()).toBeNull()
		expect(shownThread()).not.toBeNull()
		expect(rosterRowOf(ROOM_TITLE)).toBeInstanceOf(HTMLElement)
		expect(router.state.location.search.conversation).toBe(otherRoom.id)
		expect(currentTab().textContent).toContain(OTHER_ROOM_TITLE)
		expect(selectedRailEntries()).toEqual(["conversations"])
	})

	it("restores the conversation layout and the conversation shown before on Conversations in the rail", async () => {
		const { router, otherRoom } = await mountApp()
		await showOtherRoom()
		await click(railButton("library"))

		await click(railButton("conversations"))

		expect(libraryHeading()).toBeNull()
		expect(shownThread()).not.toBeNull()
		expect(router.state.location.search.conversation).toBe(otherRoom.id)
		expect(selectedRailEntries()).toEqual(["conversations"])
	})

	it("leaves for the missions panel on Missions in the rail", async () => {
		await mountApp()
		await click(railButton("library"))

		await click(railButton("missions"))

		expect(libraryHeading()).toBeNull()
		expect(selectedRailEntries()).toEqual(["missions"])
	})

	it("shows each tab its own page when switching away from the Library and back", async () => {
		const { router } = await mountApp()
		await showOtherRoom()
		await click(railButton("library"))

		await act(async () => router.options.context.tabs.openEmptyTab())
		await settle()
		expect(libraryHeading()).toBeNull()
		expect(selectedRailEntries()).toEqual(["conversations"])

		await click(tabTitled(LIBRARY_NAME))

		expect(currentTab().textContent).toContain(LIBRARY_NAME)
		expect(libraryHeading()).not.toBeNull()
		expect(rosterRowOf(ROOM_TITLE)).toBeUndefined()
		expect(selectedRailEntries()).toEqual(["library"])
	})
})

const railSearch = () =>
	screen.getByRole("button", { name: i18n.t("search:open") })

describe("the search entry of the rail", () => {
	it.each([
		["the Library", "/library"],
		["the user settings", "/settings/user"],
	] as const)("opens search on %s", async (_page, path) => {
		const { router } = await mountApp()
		await act(async () => router.navigate({ to: path }))
		await settle()

		const search = railSearch()

		await click(search)

		expect(router.state.location.pathname).toBe(path)
		expect(search.getAttribute("aria-expanded")).toBe("true")
		expect(screen.getByRole("dialog")).toBeInstanceOf(HTMLElement)
	})
})

const libraryItemOf = (
	name: string,
	kind: LibraryItem["kind"],
): LibraryItem => ({
	name,
	kind,
	path: `/library/${name}`,
	bytes: 1024,
	modifiedAt: 0,
	createdAt: null,
})

const IMAGE = libraryItemOf("diagram.png", "image")

const DOCUMENT = libraryItemOf("notes.txt", "document")

const mountLibraryScreen = async (isJoined: boolean) => {
	harness.libraryItems = [IMAGE, DOCUMENT]
	render(createElement(LibraryScreen, { spaceId: "space", isJoined }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await screen.findByRole("heading", { level: 1, name: LIBRARY_NAME })
}

const openLibraryItem = async (item: LibraryItem) => {
	const tile = (await screen.findAllByRole("button")).find((button) =>
		button.textContent?.includes(titleOf(item)),
	)
	await act(async () => {
		fireEvent.click(tile as HTMLElement, { detail: 1 })
	})
}

const buttonNamed = (name: string) => screen.queryByRole("button", { name })

const findButtonNamed = (name: string) => screen.findByRole("button", { name })

describe("the More action of an opened Library item", () => {
	it("shows Download and Copy but no More on an image of a joined Space", async () => {
		await mountLibraryScreen(true)

		await openLibraryItem(IMAGE)

		expect(
			await findButtonNamed(i18n.t("common:library.lightbox.download")),
		).toBeInstanceOf(HTMLElement)
		expect(buttonNamed(i18n.t("common:library.lightbox.copy"))).toBeInstanceOf(
			HTMLElement,
		)
		expect(buttonNamed(i18n.t("common:library.lightbox.more"))).toBeNull()
	})

	it("shows no More on a document of a joined Space", async () => {
		await mountLibraryScreen(true)

		await openLibraryItem(DOCUMENT)

		expect(
			await findButtonNamed(i18n.t("common:library.document.back")),
		).toBeInstanceOf(HTMLElement)
		expect(buttonNamed(i18n.t("common:library.document.more"))).toBeNull()
	})

	it("keeps More on an image and a document of the host's own Space", async () => {
		await mountLibraryScreen(false)

		await openLibraryItem(IMAGE)
		expect(
			await findButtonNamed(i18n.t("common:library.lightbox.more")),
		).toBeInstanceOf(HTMLElement)

		await act(async () => {
			fireEvent.click(
				buttonNamed(i18n.t("common:library.lightbox.close")) as HTMLElement,
			)
		})
		await openLibraryItem(DOCUMENT)
		expect(
			await findButtonNamed(i18n.t("common:library.document.more")),
		).toBeInstanceOf(HTMLElement)
	})
})
