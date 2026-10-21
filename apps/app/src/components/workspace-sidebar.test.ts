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

const STEP_MS = 5_000

const SETTLE_MS = 200

const CONVERSATION_TITLE = "Round table"

let layout: FakeLayout | null = null

const settle = async (ms: number) => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms)
	})
}

const mountApp = async () => {
	layout = fakeLayout()
	const store = createFakeTranscriptStore()
	const [space] = await store.spaces()
	const bot = await store.createBot(newBotIdentity([]), space.id)
	const conversation = await store.createConversation({
		botIds: [bot.id],
		sectionId: null,
		spaceId: space.id,
		title: CONVERSATION_TITLE,
	})
	const driver = createFakeChatDriver({ stepMs: STEP_MS })
	const cancelTurn = vi.spyOn(driver, "cancelTurn")
	harness.store = store
	harness.driver = driver
	render(createElement(App), { wrapper: createQueryTestWrapper().wrapper })
	await settle(SETTLE_MS)
	const cancelledScopes = () =>
		cancelTurn.mock.calls.map(([{ botId, conversationId }]) => ({
			botId,
			conversationId,
		}))
	return { bot, conversation, cancelledScopes }
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

const open = async (name: string) => {
	await act(async () => {
		fireEvent.click(rowFor(name))
	})
	await settle(SETTLE_MS)
}

const send = async (text: string) => {
	fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
		target: { value: text },
	})
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Send" }))
	})
	await settle(SETTLE_MS)
}

const rosterStopFor = (name: string) =>
	screen
		.queryAllByRole("button", { name: `Stop ${name}` })
		.find((button) => button.closest('[data-slot="sidebar"]')) ?? null

const pressRosterStop = async (name: string) => {
	const stop = rosterStopFor(name)
	if (!stop) {
		throw new Error(`no roster Stop for ${name}`)
	}
	await act(async () => {
		fireEvent.click(stop)
	})
	await settle(SETTLE_MS)
}

describe("the roster Stop", () => {
	afterEach(() => {
		layout?.restore()
		layout = null
		cleanup()
		vi.useRealTimers()
	})

	it("stops the solo thread of a working companion row", async () => {
		vi.useFakeTimers()
		const { bot, conversation, cancelledScopes } = await mountApp()

		await open(bot.name)
		await send("map the repository")

		expect(rosterStopFor(CONVERSATION_TITLE)).toBeNull()

		await pressRosterStop(bot.name)

		const [cancelled, ...others] = cancelledScopes()
		expect(others).toEqual([])
		expect(cancelled.botId).toBe(bot.id)
		expect(cancelled.conversationId).not.toBe(conversation.id)
		expect(rosterStopFor(bot.name)).toBeNull()
	})

	it("stops every companion speaking in a working conversation row", async () => {
		vi.useFakeTimers()
		const { bot, conversation, cancelledScopes } = await mountApp()

		await open(CONVERSATION_TITLE)
		await send("map the repository")

		expect(rosterStopFor(bot.name)).toBeNull()

		await pressRosterStop(CONVERSATION_TITLE)

		expect(cancelledScopes()).toEqual([
			{ botId: bot.id, conversationId: conversation.id },
		])
		expect(rosterStopFor(CONVERSATION_TITLE)).toBeNull()
	})
})
