// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

const harness = vi.hoisted((): { store: TranscriptStore | null } => ({
	store: null,
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

const { App } = await import("@/App")

const MOUNT_MS = 200

afterEach(() => {
	cleanup()
	vi.useRealTimers()
})

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(MOUNT_MS)
	})
}

const isShowing = (slot: string) =>
	document.querySelector(`[data-slot="${slot}"]`) !== null

const mountApp = async (store: TranscriptStore) => {
	vi.useFakeTimers()
	harness.store = store
	render(createElement(App), { wrapper: createQueryTestWrapper().wrapper })
	await settle()
}

it("holds the startup screen while the roster is read", async () => {
	const store = createFakeTranscriptStore()
	vi.spyOn(store, "bots").mockReturnValue(new Promise(() => undefined))

	await mountApp(store)

	expect(isShowing("app-boot-screen")).toBe(true)
	expect(isShowing("app-boot-notice")).toBe(false)
})

it("offers a retry when the roster fails at launch and reads it again on retry", async () => {
	const store = createFakeTranscriptStore()
	const reads = vi
		.spyOn(store, "bots")
		.mockRejectedValueOnce(new Error("no record"))

	await mountApp(store)
	expect(isShowing("app-boot-notice")).toBe(true)

	fireEvent.click(screen.getByRole("button", { name: "Retry" }))
	await settle()

	expect(reads).toHaveBeenCalledTimes(2)
	expect(isShowing("app-boot-notice")).toBe(false)
	expect(isShowing("app-boot-screen")).toBe(false)
})

it("offers a retry when the space list fails at launch and reads it again on retry", async () => {
	const store = createFakeTranscriptStore()
	const reads = vi
		.spyOn(store, "spaces")
		.mockRejectedValueOnce(new Error("no record"))

	await mountApp(store)
	expect(isShowing("app-boot-notice")).toBe(true)

	fireEvent.click(screen.getByRole("button", { name: "Retry" }))
	await settle()

	expect(reads).toHaveBeenCalledTimes(2)
	expect(isShowing("app-boot-notice")).toBe(false)
})
