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
}

const harness = vi.hoisted((): Harness => ({ store: null }))

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

const OTHER_ROOM = "Back office"

const REFUSED = "hold the north wall"

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

type RefusingStore = TranscriptStore & { refuseNextSend: () => void }

const refusingStoreOf = (store: TranscriptStore): RefusingStore => {
	let isRefusingNextSend = false
	const sendUserMessage: TranscriptStore["sendUserMessage"] = (...args) => {
		if (!isRefusingNextSend) return store.sendUserMessage(...args)
		isRefusingNextSend = false
		return Promise.reject(new Error("refused"))
	}
	return Object.assign(Object.create(store), {
		sendUserMessage,
		refuseNextSend: () => {
			isRefusingNextSend = true
		},
	})
}

const mountTwoRooms = async () => {
	writeMirror({ ...readMirror(), firstRunDone: true })
	const store = refusingStoreOf(createFakeTranscriptStore())
	const [space] = await store.spaces()
	const bot = await store.createBot(newBotIdentity([]), space.id)
	for (const title of [ROOM, OTHER_ROOM]) {
		await store.createConversation({
			botIds: [bot.id],
			sectionId: null,
			spaceId: space.id,
			title,
		})
	}
	vi.useFakeTimers()
	harness.store = store
	const router = createWorkspaceRouter(createWorkspaceTabs("/"))
	render(createElement(RouterProvider, { router }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
	return store
}

const press = async (control: Element) => {
	await act(async () => {
		fireEvent.click(control, { detail: 1 })
	})
	await settle()
}

const rosterRowOf = (name: string) => {
	const row = [...document.querySelectorAll('[data-slot="roster-row-name"]')]
		.find((label) => label.textContent === name)
		?.closest("button")
	if (!row) throw new Error(`no roster row for ${name}`)
	return row
}

const NOT_SENT = i18n.t("bots:roster.conversation.notSent")

const isNotSent = (name: string) =>
	within(rosterRowOf(name)).queryByText(NOT_SENT) !== null

const sendInComposer = async (text: string) => {
	const composer = screen.getByRole("textbox", {
		name: i18n.t("chat:composer.label"),
	})
	await act(async () => {
		fireEvent.change(composer, { target: { value: text } })
	})
	await act(async () => {
		fireEvent.keyDown(composer, { key: "Enter" })
	})
	await settle()
}

const retryOfRefusedMessage = () => {
	const notSent = document.querySelector('[data-slot="turn-not-sent"]')
	if (!(notSent instanceof HTMLElement)) throw new Error("no refused message")
	return within(notSent).getByRole("button", {
		name: i18n.t("chat:turn.retry"),
	})
}

const refuseInRoom = async (store: RefusingStore) => {
	await press(rosterRowOf(ROOM))
	store.refuseNextSend()
	await sendInComposer(REFUSED)
}

it("marks the row of a conversation whose last message was refused Not sent, on screen and once left", async () => {
	const store = await mountTwoRooms()

	await refuseInRoom(store)

	expect(isNotSent(ROOM)).toBe(true)
	expect(isNotSent(OTHER_ROOM)).toBe(false)

	await press(rosterRowOf(OTHER_ROOM))

	expect(isNotSent(ROOM)).toBe(true)
	expect(isNotSent(OTHER_ROOM)).toBe(false)
})

it("returns the row to its normal state once Retry sends the refused message", async () => {
	const store = await mountTwoRooms()
	await refuseInRoom(store)
	expect(isNotSent(ROOM)).toBe(true)

	await press(retryOfRefusedMessage())

	expect(isNotSent(ROOM)).toBe(false)
	expect(screen.getAllByText(REFUSED).length).toBeGreaterThan(0)
})
