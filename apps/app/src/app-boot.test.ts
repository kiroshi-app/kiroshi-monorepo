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
	localStorage.clear()
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

const SKELETON_MS = 300

it("stays on the launch loader, never on a sidebar skeleton, while the first roster page is read", async () => {
	const store = createFakeTranscriptStore()
	vi.spyOn(store, "bots").mockReturnValue(new Promise(() => undefined))

	await mountApp(store)
	await act(async () => {
		await vi.advanceTimersByTimeAsync(SKELETON_MS)
	})

	expect(isShowing("app-boot-screen")).toBe(true)
	expect(isShowing("sidebar-list-skeleton")).toBe(false)
})

it("shows a roster failing at launch inside the sidebar, never on the startup screen", async () => {
	const store = createFakeTranscriptStore()
	vi.spyOn(store, "bots").mockRejectedValue(new Error("no record"))

	await mountApp(store)

	expect(isShowing("app-boot-screen")).toBe(false)
	expect(isShowing("app-boot-notice")).toBe(false)
	const sidebar = within(
		screen.getByRole("navigation", { name: i18n.t("bots:rail.label") }),
	)
	expect(sidebar.getByText(i18n.t("bots:roster.failed"))).toBeTruthy()
	expect(
		sidebar.getByRole("button", { name: i18n.t("bots:roster.retry") }),
	).toBeTruthy()
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
