// @vitest-environment happy-dom

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

import { commands } from "@/lib/bindings"
import { newBotIdentity } from "@/lib/bots/bot-settings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { isDesktopHost } from "@/lib/host/index"
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
	isDesktopHost: vi.fn(() => false),
}))

vi.mock("@/lib/bindings", async (importOriginal) => {
	const bindings = await importOriginal<typeof import("@/lib/bindings")>()
	return {
		...bindings,
		commands: { ...bindings.commands, hostingState: vi.fn() },
	}
})

vi.mock("@/lib/chat/create-driver", async () => {
	const { withFakeHostWrites } = await import(
		"@/lib/conversations/fake-host-writes"
	)
	return {
		createChatDriver: (store: TranscriptStore) =>
			withFakeHostWrites(createFakeChatDriver({ stepMs: 1 }), store),
	}
})

const { App } = await import("@/App")

const SETTLE_MS = 200

const CONVERSATION_TITLE = "Round table"

const DRAFT = "half a thought for the room"

afterEach(() => {
	cleanup()
	vi.useRealTimers()
	vi.mocked(isDesktopHost).mockReturnValue(false)
})

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(SETTLE_MS)
	})
}

type Installs = (store: TranscriptStore, spaceId: string) => Promise<unknown>

const ATLAS = { command: "npx", args: ["-y", "@atlas/mcp-server"] }

const LEDGER = { type: "http", url: "https://ledger.internal/mcp" }

const twoSpaceApplications: Installs = async (store, spaceId) => {
	await store.setPluginMcpServer({ kind: "space", id: spaceId }, "atlas", ATLAS)
	await store.setPluginMcpServer(
		{ kind: "space", id: spaceId },
		"ledger",
		LEDGER,
	)
}

const oneUserApplication: Installs = (store) =>
	store.setPluginMcpServer({ kind: "user" }, "atlas", ATLAS)

const mountApp = async (install?: Installs) => {
	writeMirror({ ...readMirror(), firstRunDone: true })
	const store = createFakeTranscriptStore()
	const [space] = await store.spaces()
	await install?.(store, space.id)
	const bot = await store.createBot(newBotIdentity([]), space.id)
	await store.createConversation({
		botIds: [bot.id],
		sectionId: null,
		spaceId: space.id,
		title: CONVERSATION_TITLE,
	})
	vi.useFakeTimers()
	harness.store = store
	render(createElement(App), { wrapper: createQueryTestWrapper().wrapper })
	await settle()
	return space
}

const press = async (control: Element) => {
	await act(async () => {
		fireEvent.click(control)
	})
	await settle()
}

const openConversation = async () => {
	const label = [
		...document.querySelectorAll('[data-slot="roster-row-name"]'),
	].find((name) => name.textContent === CONVERSATION_TITLE)
	await press(label?.closest("button") as HTMLButtonElement)
}

const railOf = () =>
	screen.getByRole("navigation", { name: i18n.t("bots:rail.label") })

const gearOf = () =>
	within(railOf()).getByRole("button", {
		name: i18n.t("bots:rail.spaceSettings"),
	})

const avatarOf = () =>
	within(railOf()).getAllByRole("button").at(-1) as HTMLElement

const conversationsEntryOf = () =>
	within(railOf()).getByRole("button", {
		name: i18n.t("bots:rail.conversations"),
	})

const settingsMenuOf = () =>
	screen.queryByRole("navigation", { name: i18n.t("settings:screen.menu") })

const shownSettingsOf = () => {
	const menu = settingsMenuOf()
	if (!menu) return null
	return {
		subtitle: within(menu).queryByText(i18n.t("settings:screen.subtitle.space"))
			? "space"
			: "user",
		entry: within(menu).getByRole("button", { current: "page" }).textContent,
	}
}

const menuEntryOf = (name: string | RegExp) =>
	within(settingsMenuOf() as HTMLElement).getByRole("button", { name })

const applicationsEntryOf = () =>
	menuEntryOf(i18n.t("settings:rail.applications")).closest("li") as HTMLElement

const applicationsMenuOf = () =>
	within(applicationsEntryOf())
		.getAllByRole("button")
		.map((entry) => entry.textContent)

const openApplications = () =>
	press(menuEntryOf(i18n.t("settings:rail.applications")))

const isMarked = (railItem: HTMLElement) =>
	railItem.getAttribute("aria-current") === "true"

const composerOf = () =>
	screen.getByRole<HTMLTextAreaElement>("textbox", {
		name: i18n.t("chat:composer.label"),
	})

it("opens the space settings in place of the body on the gear, and marks the gear", async () => {
	await mountApp()

	await press(gearOf())

	expect(shownSettingsOf()).toEqual({
		subtitle: "space",
		entry: i18n.t("settings:rail.space"),
	})
	expect(isMarked(gearOf())).toBe(true)
	expect(isMarked(avatarOf())).toBe(false)
	expect(isMarked(conversationsEntryOf())).toBe(false)
})

it("switches between the space and the user settings on the gear and the avatar", async () => {
	await mountApp()
	await press(gearOf())

	await press(avatarOf())

	expect(shownSettingsOf()).toEqual({
		subtitle: "user",
		entry: i18n.t("settings:rail.account"),
	})
	expect(isMarked(avatarOf())).toBe(true)
	expect(isMarked(gearOf())).toBe(false)

	await press(gearOf())

	expect(shownSettingsOf()).toEqual({
		subtitle: "space",
		entry: i18n.t("settings:rail.space"),
	})
})

it("opens the space settings on Members when Share asks for it", async () => {
	vi.mocked(isDesktopHost).mockReturnValue(true)
	vi.mocked(commands.hostingState).mockResolvedValue({ kind: "off" })
	const space = await mountApp()

	await act(async () => {
		fireEvent.contextMenu(
			screen.getByRole("button", {
				name: i18n.t("bots:spaces.switch", { name: space.name }),
			}),
		)
	})
	await settle()
	await press(
		screen.getByRole("menuitem", { name: i18n.t("bots:spaces.share") }),
	)

	expect(shownSettingsOf()).toEqual({
		subtitle: "space",
		entry: i18n.t("settings:rail.members"),
	})
})

it("brings back the open conversation and its draft on Back to conversations", async () => {
	await mountApp()
	await openConversation()
	fireEvent.change(composerOf(), { target: { value: DRAFT } })
	await press(gearOf())

	await press(
		within(settingsMenuOf() as HTMLElement).getByRole("button", {
			name: i18n.t("settings:screen.back"),
		}),
	)

	expect(shownSettingsOf()).toBeNull()
	expect(composerOf().value).toBe(DRAFT)
	expect(isMarked(conversationsEntryOf())).toBe(true)
})

it("closes the settings on the Conversations entry of the rail", async () => {
	await mountApp()
	await openConversation()
	fireEvent.change(composerOf(), { target: { value: DRAFT } })
	await press(avatarOf())

	await press(conversationsEntryOf())

	expect(shownSettingsOf()).toBeNull()
	expect(composerOf().value).toBe(DRAFT)
})

it("opens the user settings again on the first entry once they were closed", async () => {
	await mountApp()
	await press(avatarOf())
	await press(
		within(settingsMenuOf() as HTMLElement).getByRole("button", {
			name: i18n.t("settings:rail.appearance"),
		}),
	)
	await press(conversationsEntryOf())

	await press(avatarOf())

	expect(shownSettingsOf()).toEqual({
		subtitle: "user",
		entry: i18n.t("settings:rail.account"),
	})
})

it("lists one Applications sub-entry per application installed in the open space", async () => {
	await mountApp(twoSpaceApplications)
	await press(gearOf())

	await openApplications()

	expect(applicationsMenuOf()).toEqual([
		i18n.t("settings:rail.applications"),
		expect.stringMatching(/^atlas/),
		expect.stringMatching(/^ledger/),
		i18n.t("bots:applications.add"),
	])
})

it("shows the page of the application its sub-entry selects", async () => {
	await mountApp(twoSpaceApplications)
	await press(gearOf())
	await openApplications()

	await press(menuEntryOf(/^ledger/))

	expect(menuEntryOf(/^ledger/).getAttribute("aria-current")).toBe("page")
	expect(screen.getByRole("heading", { level: 2, name: "ledger" })).toBeTruthy()
})

it("lists the application the person installed under Applications of the user settings", async () => {
	await mountApp(oneUserApplication)
	await press(avatarOf())

	await openApplications()

	expect(applicationsMenuOf()).toEqual([
		i18n.t("settings:rail.applications"),
		expect.stringMatching(/^atlas/),
		i18n.t("bots:applications.add"),
	])
})

it("opens the applications catalogue on Add an application", async () => {
	await mountApp(twoSpaceApplications)
	await press(gearOf())
	await openApplications()

	await press(menuEntryOf(i18n.t("bots:applications.add")))

	expect(
		screen.getByRole("tab", {
			name: i18n.t("bots:applications.catalogue.category.everything"),
		}),
	).toBeTruthy()
})
