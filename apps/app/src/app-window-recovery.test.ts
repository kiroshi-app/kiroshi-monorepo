// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import { commands, type WindowRecovery } from "@/lib/bindings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { readWindowRecoveryToShow } from "@/lib/host/window-recovery"
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

const OUT_OF_MEMORY_DEATH: WindowRecovery = {
	reason: "outOfMemory",
	deaths: 1,
	exhausted: false,
	occurredAtMs: 1_000,
}

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.restoreAllMocks()
	vi.useRealTimers()
})

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(MOUNT_MS)
	})
}

const mountApp = async (windowRecovery: WindowRecovery | null) => {
	vi.useFakeTimers()
	harness.store = createFakeTranscriptStore()
	render(createElement(App, { windowRecovery }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
}

const isShowingRecoveryScreen = () =>
	document.querySelector('[data-slot="window-recovery-screen"]') !== null

const isShowingApp = () =>
	screen.queryByRole("navigation", { name: i18n.t("bots:rail.label") }) !== null

const pressContinue = async () => {
	fireEvent.click(
		screen.getByRole("button", {
			name: i18n.t("common:windowRecovery.outOfMemory.action"),
		}),
	)
	await settle()
}

it("shows the recovery screen in place of the app for a death the host reports", async () => {
	await mountApp(OUT_OF_MEMORY_DEATH)

	expect(
		screen.getByText(i18n.t("common:windowRecovery.outOfMemory.description")),
	).toBeTruthy()
	expect(isShowingApp()).toBe(false)
})

it("leaves the recovery screen for the app on Continue, and no longer shows that death on the next page load", async () => {
	await mountApp(OUT_OF_MEMORY_DEATH)

	await pressContinue()

	expect(isShowingRecoveryScreen()).toBe(false)
	expect(isShowingApp()).toBe(true)
	vi.spyOn(commands, "windowRecoveryRead").mockResolvedValue(
		OUT_OF_MEMORY_DEATH,
	)
	expect(await readWindowRecoveryToShow()).toBeNull()
})

it("shows the app and no recovery screen when the host reports no death", async () => {
	await mountApp(null)

	expect(isShowingRecoveryScreen()).toBe(false)
	expect(isShowingApp()).toBe(true)
})
