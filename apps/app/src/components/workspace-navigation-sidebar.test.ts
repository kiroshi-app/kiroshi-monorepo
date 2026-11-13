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

const mounted = vi.hoisted(() => ({ store: null as TranscriptStore | null }))

vi.mock("@/lib/conversations/create-store", () => ({
	createTranscriptStore: () => mounted.store,
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

const NEIGHBOUR_CONVERSATION = "Garage weekly sync"

const SETTLE_MS = 200

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(SETTLE_MS)
	})
}

const seedTwoSpaces = async () => {
	const store = createFakeTranscriptStore()
	const garage = await store.createSpace("Garage")
	const agent = await store.createBot(newBotIdentity([]), garage.id)
	await store.createConversation({
		spaceId: garage.id,
		sectionId: null,
		title: NEIGHBOUR_CONVERSATION,
		botIds: [agent.id],
	})
	return store
}

const mountAppWithSidebar = async (isCollapsed: boolean) => {
	writeMirror({
		...readMirror(),
		firstRunDone: true,
		sidebarCollapsed: isCollapsed,
	})
	mounted.store = await seedTwoSpaces()
	vi.useFakeTimers()
	render(createElement(RouterProvider, { router: createWorkspaceRouter() }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
}

const SELECTED_SPACE = "Personal"

const panelOfUnselectedSpace = () => {
	const panel = document.querySelector<HTMLElement>(
		"[data-slot='space-carousel'] > [data-slot='space-panel'][inert]",
	)
	if (!panel) throw new Error("the panel of the unselected Space is not drawn")
	return within(panel)
}

const sidebar = () =>
	within(screen.getByRole("navigation", { name: i18n.t("bots:rail.label") }))

afterEach(() => {
	cleanup()
	vi.useRealTimers()
	mounted.store = null
})

describe("the sidebar with two Spaces", () => {
	it("draws the second Space's conversation in its panel when expanded", async () => {
		await mountAppWithSidebar(false)

		expect(
			sidebar().queryByRole("button", {
				name: i18n.t("bots:spaces.switch", { name: SELECTED_SPACE }),
			}),
		).not.toBeNull()
		expect(
			panelOfUnselectedSpace().queryByText(NEIGHBOUR_CONVERSATION),
		).not.toBeNull()
	})

	it("draws nothing when collapsed, then the second Space's conversation in its panel once the left edge is rested on", async () => {
		await mountAppWithSidebar(true)

		expect(
			screen.queryByRole("navigation", { name: i18n.t("bots:rail.label") }),
		).toBeNull()

		await act(async () => {
			fireEvent.pointerEnter(
				document.querySelector("[data-slot='sidebar-peek-edge']") as Element,
			)
		})
		await settle()

		expect(
			panelOfUnselectedSpace().queryByText(NEIGHBOUR_CONVERSATION),
		).not.toBeNull()
	})
})
