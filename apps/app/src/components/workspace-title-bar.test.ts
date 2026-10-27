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

import { newBotIdentity } from "@/lib/bots/bot-settings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { readMirror, writeMirror } from "@/lib/user/preferences-mirror"

const harness = vi.hoisted((): { store: TranscriptStore | null } => ({
	store: null,
}))

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

const { createWorkspaceRouter } = await import("@/workspace-router")

const SETTLE_MS = 200

const ROOM_TITLE = "Round table"

const OTHER_SPACE = "Vocca"

const NEW_TAB = i18n.t("common:titleBar.newTab")

const MIDDLE_BUTTON = 1

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.useRealTimers()
	harness.store = null
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
	await store.createSpace(OTHER_SPACE)
	const bot = await store.createBot(newBotIdentity([]), space.id)
	await store.createConversation({
		botIds: [bot.id],
		sectionId: null,
		spaceId: space.id,
		title: ROOM_TITLE,
	})
	vi.useFakeTimers()
	harness.store = store
	const router = createWorkspaceRouter()
	render(createElement(RouterProvider, { router }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
	return { router, botName: bot.name, spaceName: space.name }
}

const titleBarOf = () =>
	document.querySelector<HTMLElement>(
		'[data-slot="app-title-bar"]',
	) as HTMLElement

const tabsOf = () => within(titleBarOf()).getAllByRole("tab")

const tabNames = () =>
	tabsOf().map((tab) => tab.getAttribute("aria-label") ?? tab.textContent)

const activeTabName = () => {
	const active = within(titleBarOf()).getByRole("tab", { selected: true })
	return active.getAttribute("aria-label") ?? active.textContent
}

const barButton = (name: string) =>
	within(titleBarOf()).getByRole("button", { name })

const press = async (control: Element) => {
	await act(async () => {
		fireEvent.click(control)
	})
	await settle()
}

const rowOf = (name: string) =>
	[...document.querySelectorAll('[data-slot="roster-row-name"]')]
		.find((label) => label.textContent === name)
		?.closest("button") as HTMLElement

const clickRow = async (name: string, init: MouseEventInit = {}) => {
	await act(async () => {
		fireEvent.click(rowOf(name), { detail: 1, ...init })
	})
	await settle()
}

const middleClickRow = async (name: string) => {
	await act(async () => {
		fireEvent(
			rowOf(name),
			new MouseEvent("auxclick", {
				bubbles: true,
				button: MIDDLE_BUTTON,
				detail: 1,
			}),
		)
	})
	await settle()
}

const pickInTabMenu = async (tabName: string, item: string) => {
	const tab = within(titleBarOf()).getByRole("tab", { name: tabName })
	await act(async () => {
		fireEvent.contextMenu(tab)
	})
	await press(screen.getByRole("menuitem", { name: item }))
}

const pressModKey = async (key: string) => {
	await act(async () => {
		fireEvent.keyDown(window, { key, metaKey: true })
	})
	await settle()
}

const railOf = () =>
	screen.getByRole("navigation", { name: i18n.t("bots:rail.label") })

const spacesLogoOf = () =>
	railOf()
		.querySelector('[data-slot="space-avatar"]')
		?.closest("button") as HTMLElement

const openSpacesMenu = async () => {
	await press(spacesLogoOf())
	return screen.getByRole("menu", { name: i18n.t("bots:spaces.label") })
}

describe("the title bar", () => {
	it("shows the tabs of the current Space, without a Space switcher, as a drag region on the conversations and the settings", async () => {
		const { router } = await mountApp()

		expect(tabNames()).toEqual([NEW_TAB])
		expect(titleBarOf().dataset.tauriDragRegion).toBe("deep")
		expect(document.querySelector('[data-slot="space-switcher"]')).toBeNull()

		await act(() => router.navigate({ to: "/settings/user", search: {} }))
		await settle()

		expect(tabNames()).toEqual([i18n.t("settings:screen.subtitle.user")])
		expect(titleBarOf().dataset.tauriDragRegion).toBe("deep")
		expect(document.querySelector('[data-slot="space-switcher"]')).toBeNull()
	})

	it("names each tab after its page, and follows the page shown", async () => {
		const { botName } = await mountApp()

		await clickRow(botName)
		expect(tabNames()).toEqual([botName])

		await clickRow(ROOM_TITLE)
		expect(tabNames()).toEqual([ROOM_TITLE])
	})

	it("opens a row in a new background tab on Cmd-click and on middle-click, a plain click staying in the active tab", async () => {
		const { botName } = await mountApp()

		await clickRow(ROOM_TITLE)
		await middleClickRow(botName)

		expect(tabNames()).toEqual([ROOM_TITLE, botName])
		expect(activeTabName()).toBe(ROOM_TITLE)

		await press(barButton(NEW_TAB))
		await clickRow(ROOM_TITLE, { metaKey: true })

		expect(tabNames()).toEqual([ROOM_TITLE, NEW_TAB, botName])
		expect(activeTabName()).toBe(NEW_TAB)
	})

	it("selects, closes and opens tabs, and goes Back and Forward in the active one", async () => {
		const { botName } = await mountApp()
		await clickRow(botName)
		await press(barButton(NEW_TAB))
		await clickRow(ROOM_TITLE)

		await press(within(titleBarOf()).getByRole("tab", { name: botName }))
		expect(activeTabName()).toBe(botName)

		await press(barButton(i18n.t("common:titleBar.back")))
		expect(tabNames()).toEqual([NEW_TAB, ROOM_TITLE])
		expect(barButton(i18n.t("common:titleBar.back"))).toHaveProperty(
			"disabled",
			true,
		)

		await press(barButton(i18n.t("common:titleBar.forward")))
		expect(tabNames()).toEqual([botName, ROOM_TITLE])

		await press(barButton(i18n.t("common:titleBar.closeTab")))
		expect(tabNames()).toEqual([ROOM_TITLE])
	})

	it("pins, unpins and closes the other tabs from a tab menu", async () => {
		const { botName } = await mountApp()
		await clickRow(botName)
		await press(barButton(NEW_TAB))
		await clickRow(ROOM_TITLE)

		await pickInTabMenu(ROOM_TITLE, i18n.t("common:titleBar.pinTab"))
		expect(tabNames()).toEqual([ROOM_TITLE, botName])
		expect(
			titleBarOf().querySelector('[data-slot="title-bar-pinned-tab"]')
				?.textContent,
		).toBe("")

		await pickInTabMenu(ROOM_TITLE, i18n.t("common:titleBar.unpinTab"))
		expect(
			titleBarOf().querySelector('[data-slot="title-bar-pinned-tab"]'),
		).toBeNull()

		await pickInTabMenu(botName, i18n.t("common:titleBar.closeOtherTabs"))
		expect(tabNames()).toEqual([botName])
	})

	it("closes the active tab on Cmd+W, and shows an empty tab once the last one closes", async () => {
		const { botName } = await mountApp()
		await clickRow(botName)
		await clickRow(ROOM_TITLE, { metaKey: true })

		await pressModKey("w")
		expect(tabNames()).toEqual([ROOM_TITLE])

		await press(barButton(i18n.t("common:titleBar.closeTab")))
		expect(tabNames()).toEqual([NEW_TAB])
		expect(activeTabName()).toBe(NEW_TAB)
	})
})

describe("the Spaces menu of the rail", () => {
	it("offers to switch Space, open the Space settings and create a space", async () => {
		const { spaceName } = await mountApp()

		const menu = await openSpacesMenu()

		expect(
			within(menu).getByRole("menuitemradio", { name: new RegExp(spaceName) }),
		).toBeTruthy()
		expect(
			within(menu).getByRole("menuitemradio", {
				name: new RegExp(OTHER_SPACE),
			}),
		).toBeTruthy()
		expect(
			within(menu).getByRole("menuitem", {
				name: i18n.t("bots:spaces.create"),
			}),
		).toBeTruthy()
	})

	it("opens the Space settings from its Space settings entry", async () => {
		const { router } = await mountApp()

		const menu = await openSpacesMenu()
		await press(
			within(menu).getByRole("menuitem", {
				name: i18n.t("bots:rail.spaceSettings"),
			}),
		)

		expect(router.state.matches.at(-1)?.routeId).toBe(
			"/settings/space/$spaceId",
		)
		expect(tabNames()).toEqual([i18n.t("settings:screen.subtitle.space")])
	})

	it("switches to the Space picked and shows its own tabs", async () => {
		const { botName, spaceName } = await mountApp()
		await clickRow(botName)
		await clickRow(ROOM_TITLE, { metaKey: true })

		await press(
			within(await openSpacesMenu()).getByRole("menuitemradio", {
				name: new RegExp(OTHER_SPACE),
			}),
		)
		expect(spacesLogoOf().getAttribute("aria-label")).toContain(OTHER_SPACE)
		expect(tabNames()).toEqual([NEW_TAB])

		await press(
			within(await openSpacesMenu()).getByRole("menuitemradio", {
				name: new RegExp(spaceName),
			}),
		)
		expect(tabNames()).toEqual([botName, ROOM_TITLE])
		expect(activeTabName()).toBe(botName)
	})
})
