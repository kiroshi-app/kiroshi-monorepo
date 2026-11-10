// @vitest-environment happy-dom

import { RouterProvider } from "@tanstack/react-router"
import { act, cleanup, render } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, expect, it, vi } from "vitest"

import type { FakeNotificationPort } from "./fake-notification-port"
import type { NotificationTarget } from "./notification-port"

import { newBotIdentity } from "@/lib/bots/bot-settings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { launchPageOf } from "@/lib/tabs/tab-pages"
import {
	createWorkspaceTabs,
	type WorkspaceTabs,
} from "@/lib/tabs/workspace-tabs"
import { readMirror, writeMirror } from "@/lib/user/preferences-mirror"

type Mounted = {
	store: TranscriptStore | null
	port: FakeNotificationPort | null
}

const mounted = vi.hoisted((): Mounted => ({ store: null, port: null }))

vi.mock("@/lib/conversations/create-store", () => ({
	createTranscriptStore: () => mounted.store,
}))

vi.mock("@/lib/notifications/create-notifications", () => ({
	createNotifications: () => mounted.port,
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

const { createFakeNotificationPort } = await import("./fake-notification-port")
const { createWorkspaceRouter } = await import("@/workspace-router")

const SPACE = "personal"

const SETTLE_MS = 200

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(SETTLE_MS)
	})
}

const slot = (name: string) => document.querySelector(`[data-slot='${name}']`)

const isConversationScreenShown = () =>
	slot("chat-layout") !== null && slot("home-layout") === null

afterEach(() => {
	cleanup()
	vi.useRealTimers()
	mounted.store = null
	mounted.port = null
	localStorage.clear()
})

const aWorkspace = async () => {
	writeMirror({ ...readMirror(), firstRunDone: true })
	const store = createFakeTranscriptStore()
	const agent = await store.createBot(newBotIdentity([]), SPACE)
	const room = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Release",
		botIds: [agent.id],
	})
	mounted.store = store
	mounted.port = createFakeNotificationPort()
	return { agent, room, port: mounted.port }
}

const tabCountIn = (tabs: WorkspaceTabs) =>
	tabs.getState().bySpace[SPACE]?.tabs.length

const launch = async (tabs = createWorkspaceTabs()) => {
	vi.useFakeTimers()
	const router = createWorkspaceRouter(tabs)
	render(createElement(RouterProvider, { router }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
	return { tabs, router }
}

const show = async (navigation: () => Promise<void>) => {
	await act(navigation)
	await settle()
}

const coldLaunchOnHome = async () => {
	writeMirror({
		...readMirror(),
		openOn: "newConversation",
		lastSpaceId: SPACE,
	})
	const tabs = createWorkspaceTabs(
		undefined,
		undefined,
		launchPageOf(readMirror()),
	)
	return launch(tabs)
}

const click = async (
	port: FakeNotificationPort,
	target: NotificationTarget,
) => {
	act(() => {
		port.activate(target)
	})
	await settle()
}

it("shows the clicked conversation in the tab that showed the New conversation page", async () => {
	const { room, port } = await aWorkspace()
	const { tabs, router } = await launch()
	await show(() => router.navigate({ to: "/home" }))
	expect(slot("home-layout")).not.toBeNull()

	await click(port, { kind: "conversation", id: room.id })

	expect(router.state.location.pathname).toBe("/")
	expect(router.state.location.search).toEqual({ conversation: room.id })
	expect(isConversationScreenShown()).toBe(true)
	expect(tabCountIn(tabs)).toBe(1)
})

it("shows the conversation of the clicked agent over the New conversation page", async () => {
	const { agent, port } = await aWorkspace()
	const { router } = await launch()
	await show(() => router.navigate({ to: "/", search: { bot: agent.id } }))
	await show(() => router.navigate({ to: "/home" }))
	expect(slot("home-layout")).not.toBeNull()

	await click(port, { kind: "bot", id: agent.id })

	expect(router.state.location.pathname).toBe("/")
	expect(router.state.location.search).toEqual({ bot: agent.id })
	expect(isConversationScreenShown()).toBe(true)
})

it("shows the clicked conversation after a cold launch on the New conversation page", async () => {
	const { room, port } = await aWorkspace()
	const { tabs, router } = await coldLaunchOnHome()
	expect(router.state.location.pathname).toBe("/home")

	await click(port, { kind: "conversation", id: room.id })

	expect(router.state.location.search).toEqual({ conversation: room.id })
	expect(isConversationScreenShown()).toBe(true)
	expect(tabCountIn(tabs)).toBe(1)
})
