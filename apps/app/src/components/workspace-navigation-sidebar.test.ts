// @vitest-environment happy-dom

import { RouterProvider } from "@tanstack/react-router"
import { act, cleanup, render, within } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

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

const neighbourPanel = () => {
	const carousel = document.querySelector<HTMLElement>(
		"[data-slot='space-carousel']",
	)
	if (!carousel) throw new Error("the Space carousel is not drawn")
	return within(carousel)
}

afterEach(() => {
	cleanup()
	vi.useRealTimers()
	mounted.store = null
})

describe("the sidebar with two Spaces", () => {
	it("draws the second Space's conversation in its panel when expanded", async () => {
		await mountAppWithSidebar(false)

		expect(neighbourPanel().queryByText(NEIGHBOUR_CONVERSATION)).not.toBeNull()
	})

	it("draws the second Space's conversation in its rail panel when collapsed", async () => {
		await mountAppWithSidebar(true)

		expect(
			neighbourPanel().queryByLabelText(NEIGHBOUR_CONVERSATION),
		).not.toBeNull()
	})
})
