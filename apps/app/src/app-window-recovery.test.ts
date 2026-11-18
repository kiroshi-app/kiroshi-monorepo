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

import { activateLanguage, i18n } from "@workspace/ui/lib/i18n"

import { commands, type WindowRecovery } from "@/lib/bindings"
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

const OUT_OF_MEMORY_DEATH: WindowRecovery = {
	reason: "outOfMemory",
	deaths: 1,
	exhausted: false,
	occurredAtMs: 1_000,
}

const GAVE_UP_DEATH: WindowRecovery = {
	reason: "crashed",
	deaths: 3,
	exhausted: true,
	occurredAtMs: 2_000,
}

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	localStorage.clear()
	vi.useRealTimers()
	activateLanguage("en")
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

type ReloadAnswer = Awaited<ReturnType<typeof commands.windowRecoveryReload>>

const hostAnswersReload = (answer: ReloadAnswer) =>
	vi.spyOn(commands, "windowRecoveryReload").mockResolvedValue(answer)

const hostNeverAnswersReload = () =>
	vi
		.spyOn(commands, "windowRecoveryReload")
		.mockReturnValue(new Promise(() => {}))

const pressReload = async () => {
	fireEvent.click(
		screen.getByRole("button", {
			name: i18n.t("common:windowRecovery.gaveUp.action"),
		}),
	)
	await settle()
}

const noticeRegion = () =>
	within(screen.getByRole("region", { name: i18n.t("common:notice.label") }))

const expectReloadFailedNotice = () => {
	const notice = noticeRegion()
	expect(
		notice.getByText(i18n.t("common:windowRecovery.gaveUp.reloadFailed.title")),
	).toBeTruthy()
	expect(
		notice.getByText(
			i18n.t("common:windowRecovery.gaveUp.reloadFailed.description"),
		),
	).toBeTruthy()
	expect(
		notice.queryByText(i18n.t("common:windowRecovery.gaveUp.title")),
	).toBeNull()
}

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

it("leaves the recovery screen for the app on Continue", async () => {
	await mountApp(OUT_OF_MEMORY_DEATH)

	await pressContinue()

	expect(isShowingRecoveryScreen()).toBe(false)
	expect(isShowingApp()).toBe(true)
})

it("shows the app and no recovery screen when the host reports no death", async () => {
	await mountApp(null)

	expect(isShowingRecoveryScreen()).toBe(false)
	expect(isShowingApp()).toBe(true)
})

it("shows the gave-up screen in place of the app once the host has exhausted its reloads", async () => {
	await mountApp(GAVE_UP_DEATH)

	expect(
		screen.getByText(i18n.t("common:windowRecovery.gaveUp.description")),
	).toBeTruthy()
	expect(isShowingApp()).toBe(false)
})

it("asks the host for one reload on Reload the window, a second press ignored while it is in flight", async () => {
	const reload = hostNeverAnswersReload()
	await mountApp(GAVE_UP_DEATH)

	await pressReload()
	await pressReload()

	expect(reload).toHaveBeenCalledTimes(1)
})

it.each([
	{
		outcome: "answers an error",
		failReload: () =>
			hostAnswersReload({ status: "error", error: { kind: "reloadFailed" } }),
	},
	{
		outcome: "rejects",
		failReload: () =>
			vi
				.spyOn(commands, "windowRecoveryReload")
				.mockRejectedValue(new Error("host gone")),
	},
])(
	"raises a failure notice over the gave-up screen and takes a new press when the reload $outcome",
	async ({ failReload }) => {
		const reload = failReload()
		await mountApp(GAVE_UP_DEATH)

		await pressReload()

		expectReloadFailedNotice()
		expect(isShowingRecoveryScreen()).toBe(true)

		await pressReload()

		expect(reload).toHaveBeenCalledTimes(2)
	},
)

it("raises the failure notice in fr when the reload fails while the language is fr", async () => {
	hostAnswersReload({ status: "error", error: { kind: "reloadFailed" } })
	activateLanguage("fr")
	await mountApp(GAVE_UP_DEATH)

	await pressReload()

	const notice = noticeRegion()
	expect(notice.getByText("La fenêtre ne s’est pas rechargée")).toBeTruthy()
	expect(
		notice.getByText("Appuyez sur Recharger la fenêtre pour réessayer."),
	).toBeTruthy()
})
