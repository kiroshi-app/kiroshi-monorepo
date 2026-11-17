// @vitest-environment happy-dom

import { act } from "@testing-library/react"
import { expect, it, vi } from "vitest"

import { CODE_LANGUAGES } from "@workspace/ui/lib/code-highlight"

import type { Bot } from "@/lib/bindings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"

type LanguageWarmUp = { language: string; isLoaderShown: boolean }

const harness = vi.hoisted(() => ({
	store: null as TranscriptStore | null,
	warmUps: [] as LanguageWarmUp[],
}))

const isShowingLaunchLoader = () =>
	document.querySelector('[data-slot="app-boot-screen"]') !== null

vi.mock("@workspace/ui/lib/code-highlight", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/lib/code-highlight")
	>()),
	warmCodeLanguage: (language: string) => {
		harness.warmUps.push({ language, isLoaderShown: isShowingLaunchLoader() })
	},
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

const answerFirstRosterPage = await launch()

it("warms no code language while the launch loader plays, and every one once the shell has replaced it", async () => {
	await passTime(IDLE_WARM_UP_MS)

	expect(isShowingLaunchLoader()).toBe(true)
	expect(harness.warmUps).toEqual([])

	answerFirstRosterPage()
	await passTime(IDLE_WARM_UP_MS)

	expect(harness.warmUps.map(({ language }) => language)).toEqual(
		CODE_LANGUAGES,
	)
	expect(harness.warmUps.filter(({ isLoaderShown }) => isLoaderShown)).toEqual(
		[],
	)
})
