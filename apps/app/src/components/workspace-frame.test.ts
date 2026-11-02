// @vitest-environment happy-dom

import { RouterProvider } from "@tanstack/react-router"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement, useEffect } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import { newBotIdentity } from "@/lib/bots/bot-settings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import type { Invoke } from "@/lib/host/joined-hosts-invoke"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { readMirror, writeMirror } from "@/lib/user/preferences-mirror"

type Harness = {
	store: TranscriptStore | null
	mounts: { rail: number; titleBar: number }
}

const harness = vi.hoisted(
	(): Harness => ({ store: null, mounts: { rail: 0, titleBar: 0 } }),
)

vi.mock("@workspace/ui/components/app-rail", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@workspace/ui/components/app-rail")>()
	const CountedAppRail = (props: Parameters<typeof actual.AppRail>[0]) => {
		useEffect(() => {
			harness.mounts.rail += 1
		}, [])
		return createElement(actual.AppRail, props)
	}
	return { ...actual, AppRail: CountedAppRail }
})

vi.mock("@workspace/ui/components/app-title-bar", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@workspace/ui/components/app-title-bar")
		>()
	const CountedAppTitleBar = (
		props: Parameters<typeof actual.AppTitleBar>[0],
	) => {
		useEffect(() => {
			harness.mounts.titleBar += 1
		}, [])
		return createElement(actual.AppTitleBar, props)
	}
	return { ...actual, AppTitleBar: CountedAppTitleBar }
})

vi.mock("@/lib/conversations/create-store", () => ({
	createTranscriptStore: () => harness.store,
}))

vi.mock("@/lib/host/index", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/host/index")>()
	const invoke: Invoke = <T>(...call: Parameters<Invoke>) =>
		call[0] === "library_list"
			? Promise.resolve([] as T)
			: actual.invoke<T>(...call)
	return { ...actual, invoke, isDesktopHost: () => false }
})

vi.mock("@/lib/chat/create-driver", async () => {
	const { withFakeHostWrites } = await import(
		"@/lib/conversations/fake-host-writes"
	)
	return {
		createChatDriver: (store: TranscriptStore) =>
			withFakeHostWrites(createFakeChatDriver({ stepMs: 1 }), store),
	}
})

vi.mock("@/lib/search/search-port", () => ({
	searchPort: {
		messages: async () => [],
		catalogue: async () => ({ chats: [], missions: [], routines: [] }),
		recent: async () => [],
	},
}))

const { createWorkspaceRouter } = await import("@/workspace-router")

const SETTLE_MS = 200

type RoutedPath = "/" | "/library" | "/settings/user"

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.useRealTimers()
	harness.store = null
	harness.mounts = { rail: 0, titleBar: 0 }
})

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(SETTLE_MS)
	})
}

const mountApp = async () => {
	writeMirror({ ...readMirror(), firstRunDone: true })
	const store = createFakeTranscriptStore()
	const [space] = await store.spaces()
	await store.createBot(newBotIdentity([]), space.id)
	vi.useFakeTimers()
	harness.store = store
	const router = createWorkspaceRouter()
	render(createElement(RouterProvider, { router }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
	return router
}

type WorkspaceRouter = Awaited<ReturnType<typeof mountApp>>

const navigateTo = async (router: WorkspaceRouter, to: RoutedPath) => {
	await act(async () => {
		await router.navigate({ to })
	})
	await settle()
}

const shownFrame = () => ({
	rail: document.querySelector('[data-slot="app-rail"]'),
	titleBar: document.querySelector('[data-slot="app-title-bar"]'),
})

const pressCommandK = async () => {
	await act(async () => {
		fireEvent.keyDown(window, { key: "k", metaKey: true })
	})
	await settle()
}

const railSearch = () =>
	screen.getByRole("button", {
		name: new RegExp(i18n.t("search:open")),
		hidden: true,
	})

describe("the workspace frame", () => {
	it("keeps one rail and one title bar mounted across /, /library and /settings/user", async () => {
		const router = await mountApp()
		const first = shownFrame()

		await navigateTo(router, "/library")
		const onLibrary = shownFrame()
		await navigateTo(router, "/settings/user")
		const onUserSettings = shownFrame()
		await navigateTo(router, "/")

		expect(router.state.location.pathname).toBe("/")
		expect(first.rail).not.toBeNull()
		expect(first.titleBar).not.toBeNull()
		expect(document.querySelectorAll('[data-slot="app-rail"]')).toHaveLength(1)
		expect(
			document.querySelectorAll('[data-slot="app-title-bar"]'),
		).toHaveLength(1)
		for (const shown of [onLibrary, onUserSettings, shownFrame()]) {
			expect(shown.rail).toBe(first.rail)
			expect(shown.titleBar).toBe(first.titleBar)
		}
		expect(harness.mounts).toEqual({ rail: 1, titleBar: 1 })
	})

	it.each<RoutedPath>(["/", "/library", "/settings/user"])(
		"opens the rail search on Cmd K on %s",
		async (path) => {
			const router = await mountApp()
			await navigateTo(router, path)

			await pressCommandK()

			expect(railSearch().getAttribute("aria-expanded")).toBe("true")
		},
	)
})
