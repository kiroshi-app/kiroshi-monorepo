// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { newBotIdentity } from "@/lib/bots/bot-settings"
import type { FakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import {
	createFakeNotificationPort,
	type FakeNotificationPort,
} from "@/lib/notifications/fake-notification-port"
import { type FakeLayout, fakeLayout } from "@/lib/perf/fake-layout"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

const harness = vi.hoisted(
	(): {
		store: TranscriptStore | null
		driver: FakeChatDriver | null
		notifications: FakeNotificationPort | null
	} => ({
		store: null,
		driver: null,
		notifications: null,
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

vi.mock("@/lib/notifications/create-notifications", () => ({
	createNotifications: () => harness.notifications,
}))

const { App } = await import("@/App")

const HOME = "personal"

const BOT = "default"

const HOME_WORD = "The home thread remembers this."

const AWAY_WORD = "The Vocca thread remembers that."

const MOUNT_MS = 200

const STEP_MS = 1

let layout: FakeLayout | null = null

let said = 0

const saidIn = async (
	store: TranscriptStore,
	conversationId: string,
	content: string,
) => {
	said += 1
	const turnId = `turn-${said}`
	await store.startTurn({ conversationId, id: turnId, startedAt: said })
	await store.appendUserMessage({
		id: `said-${said}`,
		conversationId,
		turnId,
		authorBotId: null,
		repliedToMessageId: null,
		content,
		createdAt: said,
	})
}

const settle = async (ms: number) => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms)
	})
}

const mount = async (store: TranscriptStore) => {
	harness.store = store
	harness.driver = createFakeChatDriver({ stepMs: STEP_MS })
	harness.notifications = createFakeNotificationPort()
	render(createElement(App), { wrapper: createQueryTestWrapper().wrapper })
	await settle(MOUNT_MS)
	return harness.notifications
}

const aSharedBot = async () => {
	layout = fakeLayout()
	const store = createFakeTranscriptStore()
	const elsewhere = await store.createSpace("Vocca")
	await store.addBotToSpace(BOT, elsewhere.id)
	await saidIn(store, (await store.mainChat(BOT, HOME)).id, HOME_WORD)
	await saidIn(store, (await store.mainChat(BOT, elsewhere.id)).id, AWAY_WORD)
	await mount(store)
}

const aBotOfAnotherSpace = async () => {
	layout = fakeLayout()
	const store = createFakeTranscriptStore()
	const elsewhere = await store.createSpace("Vocca")
	const away = await store.createBot(newBotIdentity([]), elsewhere.id)
	await saidIn(store, (await store.mainChat(BOT, HOME)).id, HOME_WORD)
	await saidIn(
		store,
		(await store.mainChat(away.id, elsewhere.id)).id,
		AWAY_WORD,
	)
	const notifications = await mount(store)
	return { away, notifications }
}

const textIn = (slot: string) =>
	[...document.querySelectorAll(`[data-slot="${slot}"]`)]
		.map((held) => held.textContent ?? "")
		.join(" ")

const threadText = () => textIn("chat-turn-group")

const REFUSED_READ = "the transcript store refused it"

const noticeText = () => textIn("chat-notice")

const previewText = () => textIn("roster-row-preview")

const openFirstRow = async () => {
	const row = document
		.querySelector(
			'[data-slot="space-panel"]:not([inert]) [data-slot="roster-row-name"]',
		)
		?.closest("button")
	if (!row) throw new Error("no roster row")
	fireEvent.click(row)
	await settle(MOUNT_MS)
}

const enterSpace = async (name: string) => {
	fireEvent.click(screen.getByRole("button", { name: `Open ${name}` }))
	await settle(MOUNT_MS)
}

afterEach(() => {
	layout?.restore()
	layout = null
	cleanup()
	localStorage.clear()
	vi.useRealTimers()
})

it("opens the solo thread of the space entered and leaves the one it left", async () => {
	vi.useFakeTimers()
	await aSharedBot()
	await openFirstRow()

	expect(threadText()).toContain(HOME_WORD)
	expect(previewText()).toContain(HOME_WORD)

	await enterSpace("Vocca")
	await openFirstRow()

	expect(threadText()).toContain(AWAY_WORD)
	expect(threadText()).not.toContain(HOME_WORD)
	expect(previewText()).toContain(AWAY_WORD)

	await enterSpace("Personal")

	expect(threadText()).toContain(HOME_WORD)
	expect(threadText()).not.toContain(AWAY_WORD)
})

it("opens the thread of the companion's own space when its notification is clicked", async () => {
	vi.useFakeTimers()
	const { away, notifications } = await aBotOfAnotherSpace()

	await enterSpace("Vocca")
	await openFirstRow()
	expect(threadText()).toContain(AWAY_WORD)

	await enterSpace("Personal")
	await openFirstRow()
	expect(threadText()).toContain(HOME_WORD)

	await act(async () => {
		notifications.activate({ kind: "bot", id: away.id })
		await vi.advanceTimersByTimeAsync(MOUNT_MS)
	})

	expect(threadText()).toContain(AWAY_WORD)
	expect(threadText()).not.toContain(HOME_WORD)
	expect(noticeText()).not.toContain(REFUSED_READ)
})
