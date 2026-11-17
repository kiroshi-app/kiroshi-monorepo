// @vitest-environment happy-dom

import { act } from "@testing-library/react"
import { expect, it, vi } from "vitest"

import {
	CODE_LANGUAGES,
	isCodeLanguageWarm,
} from "@workspace/ui/lib/code-highlight"

import type { Bot } from "@/lib/bindings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"

const harness = vi.hoisted(() => ({
	store: null as TranscriptStore | null,
}))

vi.mock("@/lib/conversations/create-store", () => ({
	createTranscriptStore: () => harness.store,
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

const IDLE_WARM_UP_MS = 2000

const passTime = async (ms: number) => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms)
	})
}

const isShowingLaunchLoader = () =>
	document.querySelector('[data-slot="app-boot-screen"]') !== null

const warmLanguages = () => CODE_LANGUAGES.filter(isCodeLanguageWarm)

const holdFirstRosterPage = async (store: TranscriptStore) => {
	const agents = await store.bots()
	let answerFirstRosterPage = () => {}
	const read = new Promise<Bot[]>((resolve) => {
		answerFirstRosterPage = () => resolve(agents)
	})
	vi.spyOn(store, "bots").mockReturnValue(read)
	return answerFirstRosterPage
}

const launch = async () => {
	const store = createFakeTranscriptStore()
	const answerFirstRosterPage = await holdFirstRosterPage(store)
	vi.useFakeTimers()
	harness.store = store
	document.body.innerHTML = '<div id="root"></div>'
	await act(async () => {
		await import("@/main")
	})
	return answerFirstRosterPage
}

it("warms no code language while the launch loader plays, and every one once it has left", async () => {
	const answerFirstRosterPage = await launch()
	await passTime(IDLE_WARM_UP_MS)

	expect(isShowingLaunchLoader()).toBe(true)
	expect(warmLanguages()).toEqual([])

	answerFirstRosterPage()
	await passTime(IDLE_WARM_UP_MS)

	expect(isShowingLaunchLoader()).toBe(false)
	expect(warmLanguages()).toEqual(CODE_LANGUAGES)
})
