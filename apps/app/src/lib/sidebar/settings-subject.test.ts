// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { newBotIdentity } from "@/lib/bots/bot-settings"
import type { FakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { type FakeLayout, fakeLayout } from "@/lib/perf/fake-layout"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

const harness = vi.hoisted(
	(): { store: TranscriptStore | null; driver: FakeChatDriver | null } => ({
		store: null,
		driver: null,
	}),
)

vi.mock("@/lib/conversations/create-store", () => ({
	createTranscriptStore: () => harness.store,
}))

vi.mock("@/lib/chat/create-driver", async () => {
	const { withFakeHostWrites } = await import(
		"@/lib/conversations/fake-host-writes"
	)
	return {
		createChatDriver: (store: TranscriptStore) =>
			harness.driver && withFakeHostWrites(harness.driver, store),
	}
})

const { App } = await import("@/App")

const MOUNT_MS = 200

const OPENED = "Atlas"

const ELSEWHERE = "Nova"

const ROOM = "Launch review"

let layout: FakeLayout | null = null

const settle = async (ms: number) => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms)
	})
}

const rowFor = (name: string) => {
	const labels = [...document.querySelectorAll('[data-slot="roster-row-name"]')]
	const row = labels.find((label) => label.textContent === name)
	const button = row?.closest("button")
	if (!button) {
		throw new Error(`no roster row for ${name}`)
	}
	return button
}

const openedThreadHeader = () =>
	document.querySelector('[data-slot="app-header"]')?.textContent ?? ""

const seedRoster = async (store: TranscriptStore) => {
	const [space] = await store.spaces()
	for (const name of [OPENED, ELSEWHERE]) {
		const held = await store.bots(space.id)
		await store.createBot({ ...newBotIdentity(held), name }, space.id)
	}
	const [firstBot] = await store.bots(space.id)
	await store.createConversation({
		spaceId: space.id,
		sectionId: null,
		title: ROOM,
		botIds: [firstBot.id],
	})
}

const mountApp = async () => {
	layout = fakeLayout()
	const store = createFakeTranscriptStore()
	harness.store = store
	harness.driver = createFakeChatDriver({ stepMs: 1 })
	await seedRoster(store)
	render(createElement(App), { wrapper: createQueryTestWrapper().wrapper })
	await settle(MOUNT_MS)
}

const openThread = async (name: string) => {
	await act(async () => {
		fireEvent.click(rowFor(name))
	})
	await settle(MOUNT_MS)
}

const openSettingsFromContextMenu = async (name: string) => {
	await act(async () => {
		fireEvent.contextMenu(rowFor(name))
	})
	await settle(MOUNT_MS)
	await act(async () => {
		fireEvent.click(screen.getByRole("menuitem", { name: "Open settings" }))
	})
	await settle(MOUNT_MS)
}

describe("settings opened from the sidebar", () => {
	afterEach(() => {
		layout?.restore()
		layout = null
		cleanup()
		vi.useRealTimers()
	})

	it("shows the settings of the companion it was asked about and holds the open thread", async () => {
		vi.useFakeTimers()
		await mountApp()
		await openThread(OPENED)

		await openSettingsFromContextMenu(ELSEWHERE)

		expect(
			screen.getByRole("navigation", { name: "Settings" }).textContent,
		).toContain(ELSEWHERE)
		await act(async () => {
			fireEvent.click(
				screen.getByRole("button", { name: "Back to conversations" }),
			)
		})
		await settle(MOUNT_MS)
		expect(openedThreadHeader()).toContain(OPENED)
	})

	it("shows the settings of the conversation it was asked about and holds the open thread", async () => {
		vi.useFakeTimers()
		await mountApp()
		await openThread(OPENED)

		await openSettingsFromContextMenu(ROOM)

		expect(screen.getByRole("dialog").textContent).toContain(ROOM)
		expect(openedThreadHeader()).toContain(OPENED)
	})
})
