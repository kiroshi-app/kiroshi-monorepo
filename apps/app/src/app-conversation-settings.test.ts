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
import { afterEach, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import { newBotIdentity } from "@/lib/bots/bot-settings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { readMirror, writeMirror } from "@/lib/user/preferences-mirror"

type Harness = {
	store: TranscriptStore | null
	refusesRelease: boolean
}

const harness = vi.hoisted(
	(): Harness => ({ store: null, refusesRelease: false }),
)

vi.mock("@/lib/conversations/conversation-runtimes", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/lib/conversations/conversation-runtimes")
		>()
	return {
		...actual,
		createConversationRuntimes: (
			...args: Parameters<typeof actual.createConversationRuntimes>
		) => {
			const runtimes = actual.createConversationRuntimes(...args)
			return {
				...runtimes,
				release: (conversationId: string) =>
					harness.refusesRelease
						? Promise.reject({ kind: "storage" })
						: runtimes.release(conversationId),
			}
		},
	}
})

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
const { createWorkspaceTabs } = await import("@/lib/tabs/workspace-tabs")

const SETTLE_MS = 200

const ROOM = "Round table"

const RENAMED = "War room"

const DRAFT = "half a thought for the room"

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.useRealTimers()
	harness.store = null
	harness.refusesRelease = false
})

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(SETTLE_MS)
	})
}

const mountRouterAt = async (path = "/") => {
	writeMirror({ ...readMirror(), firstRunDone: true })
	const store = createFakeTranscriptStore()
	const [space] = await store.spaces()
	const bot = await store.createBot(newBotIdentity([]), space.id)
	await store.createConversation({
		botIds: [bot.id],
		sectionId: null,
		spaceId: space.id,
		title: ROOM,
	})
	vi.useFakeTimers()
	harness.store = store
	const router = createWorkspaceRouter(createWorkspaceTabs(path))
	render(createElement(RouterProvider, { router }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
	return router
}

const press = async (control: Element, init: MouseEventInit = {}) => {
	await act(async () => {
		fireEvent.click(control, { detail: 1, ...init })
	})
	await settle()
}

const rosterRowNamed = (name: string) =>
	[...document.querySelectorAll('[data-slot="roster-row-name"]')]
		.find((label) => label.textContent === name)
		?.closest("button") ?? null

const rosterRowOf = (name: string) => {
	const row = rosterRowNamed(name)
	if (!row) throw new Error(`no roster row for ${name}`)
	return row
}

const openRoom = () => press(rosterRowOf(ROOM))

const headerButtonOf = (name: string) =>
	screen.getByRole("button", {
		name: i18n.t("chat:screen.conversationIdentity", { name }),
	})

const rowMenuSettingsOf = async () => {
	await act(async () => {
		fireEvent.contextMenu(rosterRowOf(ROOM), { clientX: 20, clientY: 20 })
	})
	await settle()
	return screen.getByRole("menuitem", { name: i18n.t("bots:roster.settings") })
}

const openSettingsFromRowMenu = async () => press(await rowMenuSettingsOf())

const railOf = () =>
	screen.queryByRole("navigation", { name: i18n.t("bots:rail.label") })

const conversationsEntryOf = () =>
	within(railOf() as HTMLElement).getByRole("button", {
		name: i18n.t("bots:rail.conversations"),
	})

const settingsMenuOf = () =>
	screen.queryByRole("navigation", { name: i18n.t("settings:screen.menu") })

const menuEntryOf = (name: string) =>
	within(settingsMenuOf() as HTMLElement).getByRole("button", { name })

const conversationScreenOf = (name: string) => {
	const menu = settingsMenuOf()
	if (!menu) return null
	return {
		subtitle: within(menu).queryByText(
			i18n.t("settings:screen.subtitle.conversation"),
		)?.textContent,
		isNamed: within(menu).queryByText(name) !== null,
		entry: within(menu).getByRole("button", { current: "page" }).textContent,
		hasRail: railOf() !== null,
	}
}

const ON_GENERAL = {
	subtitle: i18n.t("settings:screen.subtitle.conversation"),
	isNamed: true,
	entry: i18n.t("chat:conversationSettings.tab.general"),
	hasRail: true,
}

const composerOf = () =>
	screen.getByRole<HTMLTextAreaElement>("textbox", {
		name: i18n.t("chat:composer.label"),
	})

const deleteFromDangerZone = async () => {
	await press(menuEntryOf(i18n.t("chat:conversationSettings.tab.danger")))
	const deleteLabel = i18n.t("chat:conversationSettings.danger.delete")
	await press(screen.getByRole("button", { name: deleteLabel }))
	await press(
		within(
			screen.getByRole("alertdialog", {
				name: i18n.t("chat:conversationSettings.danger.confirm.title", {
					name: ROOM,
				}),
			}),
		).getByRole("button", { name: deleteLabel }),
	)
}

const titleBarOf = () =>
	document.querySelector('[data-slot="app-title-bar"]') as HTMLElement

const tabsOf = () => within(titleBarOf()).getAllByRole("tab")

const tabNames = () =>
	tabsOf().map((tab) => tab.getAttribute("aria-label") ?? tab.textContent)

it("opens the conversation settings full-window from the conversation button of the thread header", async () => {
	const router = await mountRouterAt()
	await openRoom()

	await press(headerButtonOf(ROOM))

	expect(conversationScreenOf(ROOM)).toEqual(ON_GENERAL)
	expect(router.state.location.pathname).toMatch(
		/^\/settings\/conversation\/[^/]+$/,
	)
})

it("opens the conversation settings full-window from the Settings of a sidebar conversation row menu", async () => {
	await mountRouterAt()

	await openSettingsFromRowMenu()

	expect(conversationScreenOf(ROOM)).toEqual(ON_GENERAL)
})

it("brings back the open conversation and its draft on Back", async () => {
	await mountRouterAt()
	await openRoom()
	fireEvent.change(composerOf(), { target: { value: DRAFT } })
	await press(headerButtonOf(ROOM))

	await press(menuEntryOf(i18n.t("settings:screen.back")))

	expect(settingsMenuOf()).toBeNull()
	expect(composerOf().value).toBe(DRAFT)
	expect(headerButtonOf(ROOM)).toBeTruthy()
})

it("paints a rename in the sidebar", async () => {
	await mountRouterAt()
	await openSettingsFromRowMenu()

	await act(async () => {
		fireEvent.change(
			screen.getByRole("textbox", {
				name: i18n.t("chat:conversationSettings.name.label"),
			}),
			{ target: { value: RENAMED } },
		)
	})
	await settle()
	await press(menuEntryOf(i18n.t("settings:screen.back")))

	expect(rosterRowNamed(RENAMED)).not.toBeNull()
})

it("deletes the conversation from the Danger zone and leaves the screen", async () => {
	await mountRouterAt()
	await openSettingsFromRowMenu()

	await deleteFromDangerZone()

	expect(settingsMenuOf()).toBeNull()
	expect(rosterRowNamed(ROOM)).toBeNull()
})

const raisedNoticeTitles = () =>
	[...document.querySelectorAll('[data-slot="toast-title"]')].map(
		(title) => title.textContent,
	)

const refuseRelease = () => {
	harness.refusesRelease = true
}

const refuseStoreDeletion = () => {
	vi.spyOn(
		harness.store as TranscriptStore,
		"deleteConversation",
	).mockRejectedValue(new Error("no record"))
}

it.each([
	["the runtime release", refuseRelease],
	["the store deletion", refuseStoreDeletion],
])(
	"keeps the screen on the Danger zone and reports the failure once when %s is refused",
	async (_, refuse) => {
		await mountRouterAt()
		await openSettingsFromRowMenu()
		refuse()

		await deleteFromDangerZone()

		const failed = i18n.t("chat:conversationSettings.danger.failed")
		expect(raisedNoticeTitles().filter((title) => title === failed)).toEqual([
			failed,
		])
		expect(conversationScreenOf(ROOM)).toEqual({
			...ON_GENERAL,
			entry: i18n.t("chat:conversationSettings.tab.danger"),
		})
	},
)

it("returns to the conversations when the route names no conversation of the Space", async () => {
	await mountRouterAt("/settings/conversation/nowhere")

	expect(settingsMenuOf()).toBeNull()
	expect(conversationsEntryOf().getAttribute("aria-current")).toBe("true")
})

const cmdClickHeaderButton = async () => {
	await openRoom()
	await press(headerButtonOf(ROOM), { metaKey: true })
}

const cmdClickRowMenuSettings = async () =>
	press(await rowMenuSettingsOf(), { metaKey: true })

it.each([
	["the thread header button", cmdClickHeaderButton],
	["the Settings of a sidebar row menu", cmdClickRowMenuSettings],
])(
	"opens the conversation settings in a new background tab on a Cmd-click of %s",
	async (_, cmdClick) => {
		const router = await mountRouterAt()

		await cmdClick()

		expect(tabNames()).toHaveLength(2)
		expect(tabNames()[1]).toBe(i18n.t("settings:screen.subtitle.conversation"))
		expect(settingsMenuOf()).toBeNull()
		expect(router.state.location.pathname).toBe("/")
	},
)
