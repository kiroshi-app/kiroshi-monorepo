// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react"
import { type ComponentProps, createElement } from "react"
import { afterEach, expect, it, vi } from "vitest"

import type { AppBootScreen } from "@workspace/ui/components/app-boot-screen"
import { i18n } from "@workspace/ui/lib/i18n"

import type { Bot } from "@/lib/bindings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { armLaunchRevealSafetyNet } from "@/lib/host/launch-reveal"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

type LaunchLoaderProps = ComponentProps<typeof AppBootScreen>

const harness = vi.hoisted(() => ({
	store: null as TranscriptStore | null,
	revealWindow: vi.fn(async () => undefined),
	loaderRenders: [] as LaunchLoaderProps[],
	warmedLanguages: [] as string[],
}))

vi.mock("@workspace/ui/lib/code-highlight", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/lib/code-highlight")
	>()),
	warmCodeLanguage: (language: string) => {
		harness.warmedLanguages.push(language)
	},
}))

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	revealWindow: harness.revealWindow,
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

vi.mock("@workspace/ui/components/app-boot-screen", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/app-boot-screen")
	>()),
	AppBootScreen: (props: LaunchLoaderProps) => {
		harness.loaderRenders.push(props)
		return createElement("button", {
			"data-phase": props.isExiting ? "leaving" : "running",
			"data-slot": "app-boot-screen",
			onClick: props.onExitComplete,
			type: "button",
		})
	},
}))

const { App } = await import("@/App")

const MOUNT_MS = 200
const LATE_REVEAL_MS = 3000
const IDLE_WARM_UP_MS = 2000

afterEach(() => {
	cleanup()
	harness.revealWindow.mockClear()
	harness.loaderRenders = []
	harness.warmedLanguages = []
	localStorage.clear()
	vi.useRealTimers()
})

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(MOUNT_MS)
	})
}

const mountApp = async (store: TranscriptStore) => {
	vi.useFakeTimers()
	armLaunchRevealSafetyNet()
	harness.store = store
	render(createElement(App), { wrapper: createQueryTestWrapper().wrapper })
	await settle()
}

const holdFirstRosterPage = async (store: TranscriptStore) => {
	const agents = await store.bots()
	let answerFirstRosterPage = () => {}
	const read = new Promise<Bot[]>((resolve) => {
		answerFirstRosterPage = () => resolve(agents)
	})
	vi.spyOn(store, "bots").mockReturnValue(read)
	return { agents, answerFirstRosterPage }
}

const launchLoader = () =>
	document.querySelector<HTMLElement>('[data-slot="app-boot-screen"]')

const shownLaunchLoader = () => {
	const loader = launchLoader()
	if (loader === null) {
		throw new Error("the launch loader is not on screen")
	}
	return loader
}

const withoutExitPhase = ({ isExiting, ...props }: LaunchLoaderProps) => props

const completeLoaderExit = async () => {
	fireEvent.click(shownLaunchLoader())
	await settle()
}

const SIDEBAR = { name: i18n.t("bots:rail.label") }

const sidebar = () => screen.queryByRole("navigation", SIDEBAR)

const shownSidebar = () => within(screen.getByRole("navigation", SIDEBAR))

it("reveals the window once the launch loader is mounted", async () => {
	const store = createFakeTranscriptStore()
	await holdFirstRosterPage(store)

	await mountApp(store)

	expect(launchLoader()).not.toBeNull()
	expect(harness.revealWindow).toHaveBeenCalledExactlyOnceWith()
})

it("leaves the window alone when the late reveal delay passes after the launch loader showed it", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const store = createFakeTranscriptStore()
	await holdFirstRosterPage(store)
	await mountApp(store)

	await act(async () => {
		await vi.advanceTimersByTimeAsync(LATE_REVEAL_MS)
	})

	expect(harness.revealWindow).toHaveBeenCalledOnce()
	expect(logged).not.toHaveBeenCalledWith(
		expect.stringContaining("did not show the window"),
	)
	logged.mockRestore()
})

it("reveals the window on the notice of a Spaces list that failed to load", async () => {
	const store = createFakeTranscriptStore()
	vi.spyOn(store, "spaces").mockRejectedValue(new Error("no record"))

	await mountApp(store)

	expect(
		screen.getByText(i18n.t("common:spaces.unavailable.title")),
	).toBeTruthy()
	expect(launchLoader()).toBeNull()
	expect(harness.revealWindow).toHaveBeenCalledExactlyOnceWith()
})

it("keeps the launch loader running, with no shell behind it, while the first roster page is read", async () => {
	const store = createFakeTranscriptStore()
	await holdFirstRosterPage(store)

	await mountApp(store)

	expect(shownLaunchLoader().dataset.phase).toBe("running")
	expect(sidebar()).toBeNull()
})

it("hands the loader no agents, and the same props but its exit, when the first roster page answers with agents", async () => {
	const store = createFakeTranscriptStore()
	const { agents, answerFirstRosterPage } = await holdFirstRosterPage(store)
	await mountApp(store)

	answerFirstRosterPage()
	await settle()

	expect(agents.length).toBeGreaterThan(0)
	expect(shownLaunchLoader().dataset.phase).toBe("leaving")
	expect(harness.loaderRenders.flatMap(({ agents = [] }) => agents)).toEqual([])
	const [firstRender, ...laterRenders] = harness.loaderRenders
	for (const render of laterRenders) {
		expect(withoutExitPhase(render)).toEqual(withoutExitPhase(firstRender))
	}
})

it("mounts the shell, its agents already in the sidebar, only once the loader reports its exit complete", async () => {
	const store = createFakeTranscriptStore()
	const { agents, answerFirstRosterPage } = await holdFirstRosterPage(store)
	await mountApp(store)
	answerFirstRosterPage()
	await settle()

	expect(sidebar()).toBeNull()

	await completeLoaderExit()

	expect(launchLoader()).toBeNull()
	for (const { name } of agents) {
		expect(shownSidebar().getAllByText(name).length).toBeGreaterThan(0)
	}
})

it("warms no code language once the shell that left the launch loader is unmounted", async () => {
	await mountApp(createFakeTranscriptStore())
	fireEvent.click(shownLaunchLoader())

	cleanup()
	await act(async () => {
		await vi.advanceTimersByTimeAsync(IDLE_WARM_UP_MS)
	})

	expect(harness.warmedLanguages).toEqual([])
})
