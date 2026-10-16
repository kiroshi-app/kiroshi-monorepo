// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react"
import { createElement, StrictMode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { newBotIdentity } from "@/lib/bots/bot-settings"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import type { FailureFacts } from "@/lib/failure-report"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

type Fields = Record<string, unknown>

type Call = { command: string; args: Fields }

type Answer = (call: Call) => Promise<unknown>

const wire = vi.hoisted(() => {
	const held = {
		answerHere: (async () => null) as (call: {
			command: string
			args: Record<string, unknown>
		}) => Promise<unknown>,
		refusalNotices: [] as unknown[][],
		raisedNotices: [] as unknown[],
		invokeHere: (command: string, args?: Record<string, unknown>) =>
			held.answerHere({ command, args: args ?? {} }),
	}
	return held
})

vi.mock("@/lib/host/tauri", () => ({
	invoke: wire.invokeHere,
	listen: async () => () => undefined,
	convertFileSrc: (path: string) => path,
}))

vi.mock("@tauri-apps/api/core", async (original) => ({
	...(await original<object>()),
	invoke: wire.invokeHere,
}))

vi.mock("@tauri-apps/api/event", async (original) => ({
	...(await original<object>()),
	listen: async () => () => undefined,
}))

vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => "macos" }))

vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.25.0" }))

vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: () =>
		new Proxy({}, { get: () => async () => () => undefined }),
}))

vi.mock("@/lib/failure-report", async (original) => ({
	...(await original<object>()),
	raiseReportedFailure: (_notice: unknown, facts: FailureFacts) => {
		wire.raisedNotices.push(facts)
		return `notice-${wire.raisedNotices.length}`
	},
}))

vi.mock("@/lib/host/http", async (original) => ({
	...(await original<object>()),
	raiseRefusalNotice: (...notice: unknown[]) => {
		wire.refusalNotices.push(notice)
	},
}))

const HOST_URL = "http://192.168.1.20:45367"

const OTHER_SPACE_REFUSAL = "this command reaches outside the shared space"

const HELD_UNTIL_THE_SWITCH = new Set([
	"section_list",
	"space_preferences",
	"conversation_main_chat",
])

const READY_CHECK = {
	connection: "ready",
	binaryVersion: "1",
	authenticated: true,
	error: null,
}

const preferencesFor = (lastSpaceId: string, lastBotIdBySpace: Fields) => ({
	displayName: "Steve",
	profilePicturePath: null,
	colorScheme: "system",
	language: null,
	notifyOnQuestion: false,
	notifyOnPermission: false,
	notifyOnFinishedTurn: false,
	notifyWithSound: false,
	sidebarWidth: null,
	firstRunDone: true,
	lastSpaceId,
	lastBotIdBySpace,
})

const textOf = (value: unknown) => value as string

const storeAnswer =
	(store: TranscriptStore, answers: Fields): Answer =>
	async ({ command, args }) => {
		switch (command) {
			case "space_list":
				return store.spaces()
			case "conversation_bots":
				return store.bots(textOf(args.spaceId))
			case "conversation_list":
				return store.conversations(textOf(args.spaceId))
			case "conversation_page":
				return store.conversationPage(
					textOf(args.spaceId),
					null,
					Number(args.limit),
				)
			case "conversation_main_chat":
				return store.mainChat(textOf(args.botId), textOf(args.spaceId))
			case "conversation_message_page":
				return store.loadPage(textOf(args.conversationId), null)
			case "conversation_open_runtime_session":
				return store.openRuntimeSession(
					textOf(args.conversationId),
					textOf(args.botId),
					1,
					null,
					null,
				)
			case "agent_check":
				return READY_CHECK
			case "agent_start_or_resume_session":
				return { resumed: false }
			case "mission_list":
				return { open: [], done: [] }
			case "mission_space_page":
				return { missions: [], nextCursor: null }
			case "check_for_updates":
				return { kind: "upToDate" }
			default:
				return command in answers ? answers[command] : []
		}
	}

const idsNamedIn = (value: unknown, key = ""): string[] => {
	if (Array.isArray(value)) {
		return value.flatMap((inner) => idsNamedIn(inner, key))
	}
	if (typeof value === "string") {
		return /(^id|Id|Ids)$/.test(key) ? [value] : []
	}
	if (typeof value === "object" && value !== null) {
		return Object.entries(value).flatMap(([inner, held]) =>
			idsNamedIn(held, inner),
		)
	}
	return []
}

const idsHeldBy = async (store: TranscriptStore, spaceIds: string[]) => {
	const held = new Set(spaceIds)
	for (const spaceId of spaceIds) {
		for (const bot of await store.bots(spaceId)) {
			held.add(bot.id)
			held.add((await store.mainChat(bot.id, spaceId)).id)
		}
	}
	return held
}

const releasable = () => {
	let release: () => void = () => undefined
	const released = new Promise<void>((resolve) => {
		release = resolve
	})
	return { released, release: () => release() }
}

class OpeningSocket {
	onopen: (() => void) | null = null
	onmessage: (() => void) | null = null
	onclose: (() => void) | null = null

	constructor() {
		setTimeout(() => this.onopen?.(), 0)
	}

	close() {}
}

const macWithLocalSpace = async () => {
	const store = createFakeTranscriptStore()
	const space = await store.createSpace("Mine")
	const bot = await store.createBot(newBotIdentity([]), space.id)
	return { store, space, bot }
}

const hostSharingGarage = async () => {
	const store = createFakeTranscriptStore()
	await store.createSpace("Spare")
	const shared = await store.createSpace("Garage")
	await store.createBot(newBotIdentity([]), null)
	await store.createBot(newBotIdentity([]), null)
	const bot = await store.createBot(newBotIdentity([]), shared.id)
	return { store, shared, bot }
}

const firstOpeningOfGarage = async () => {
	const mac = await macWithLocalSpace()
	const host = await hostSharingGarage()
	const joined = {
		id: "garage",
		hostUrl: HOST_URL,
		remoteSpaceId: host.shared.id,
		name: "Garage",
	}
	const launch = releasable()
	const answerOnMac = storeAnswer(mac.store, {
		joined_spaces_list: [joined],
		joined_space_connect: { ...joined, token: "guest" },
		user_preferences: preferencesFor(mac.space.id, {
			[mac.space.id]: mac.bot.id,
			"joined:garage": host.bot.id,
		}),
		account_state: { kind: "signedOut" },
		conversation_local_ids: [],
		hosting_state: { kind: "stopped" },
	})
	wire.answerHere = async (call) => {
		if (HELD_UNTIL_THE_SWITCH.has(call.command)) {
			await launch.released
		}
		return answerOnMac(call)
	}
	const heldByHost = await idsHeldBy(host.store, [host.shared.id])
	const onlyOnMac = [
		...(await idsHeldBy(
			mac.store,
			(await mac.store.spaces()).map((space) => space.id),
		)),
	].filter((id) => !heldByHost.has(id))
	const answerOnHost = storeAnswer(host.store, {})
	const relayed: Call[] = []
	vi.stubGlobal("WebSocket", OpeningSocket)
	vi.stubGlobal("fetch", async (url: URL, init?: RequestInit) => {
		const call = {
			command: decodeURIComponent(String(url).split("/").at(-1) ?? ""),
			args: JSON.parse(String(init?.body ?? "{}")) as Fields,
		}
		relayed.push(call)
		if (idsNamedIn(call.args).some((id) => onlyOnMac.includes(id))) {
			return new Response(OTHER_SPACE_REFUSAL, { status: 403 })
		}
		return new Response(JSON.stringify(await answerOnHost(call)), {
			headers: { "content-type": "application/json" },
		})
	})
	Object.assign(window, { __TAURI_INTERNALS__: {} })
	const { App } = await import("@/App")
	render(createElement(App), { wrapper: createQueryTestWrapper().wrapper })
	const garage = await screen.findByRole("button", { name: /Garage/ })
	await act(async () => {
		garage.click()
	})
	launch.release()
	await vi.waitFor(
		() =>
			expect(relayed.map(({ command }) => command)).toContain(
				"agent_start_or_resume_session",
			),
		{ timeout: 10_000 },
	)
	await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
	const sharedChat = await host.store.mainChat(host.bot.id, host.shared.id)
	return { relayed, onlyOnMac, sharedChatId: sharedChat.id }
}

beforeEach(() => {
	vi.resetModules()
	wire.refusalNotices.length = 0
	wire.raisedNotices.length = 0
})

afterEach(() => {
	cleanup()
	window.localStorage.clear()
	vi.unstubAllGlobals()
})

it("opens a joined Space for the first time after launch without a refused call", async () => {
	const { relayed, onlyOnMac, sharedChatId } = await firstOpeningOfGarage()

	expect(wire.refusalNotices).toEqual([])
	expect(
		relayed.filter(({ args }) =>
			idsNamedIn(args).some((id) => onlyOnMac.includes(id)),
		),
	).toEqual([])
	expect(
		relayed
			.filter(({ command }) => command === "agent_start_or_resume_session")
			.map(({ args }) => (args.scope as Fields).conversationId),
	).toEqual([sharedChatId])
}, 60_000)

const sharedSpaceCheck =
	(sharedSpaceId: string, answerOnHost: Answer, relayed: Call[]) =>
	async (url: URL, init?: RequestInit) => {
		const call = {
			command: decodeURIComponent(String(url).split("/").at(-1) ?? ""),
			args: JSON.parse(String(init?.body ?? "{}")) as Fields,
		}
		relayed.push(call)
		if ("spaceId" in call.args && call.args.spaceId !== sharedSpaceId) {
			return new Response(OTHER_SPACE_REFUSAL, { status: 403 })
		}
		return new Response(JSON.stringify(await answerOnHost(call)), {
			headers: { "content-type": "application/json" },
		})
	}

const launchOnGarage = async (listedRemoteSpaceId: "unknown" | "known") => {
	const mac = await macWithLocalSpace()
	const host = await hostSharingGarage()
	const joined = {
		id: "garage",
		hostUrl: HOST_URL,
		remoteSpaceId: host.shared.id,
		name: "Garage",
	}
	let isSharedSpaceLearned = listedRemoteSpaceId === "known"
	const answerOnMac = storeAnswer(mac.store, {
		joined_space_connect: { ...joined, token: "guest" },
		user_preferences: preferencesFor("joined:garage", {
			[mac.space.id]: mac.bot.id,
			"joined:garage": host.bot.id,
		}),
		account_state: { kind: "signedOut" },
		conversation_local_ids: [],
		hosting_state: { kind: "stopped" },
	})
	wire.answerHere = async (call) => {
		if (call.command === "joined_spaces_list") {
			return [
				isSharedSpaceLearned ? joined : { ...joined, remoteSpaceId: null },
			]
		}
		if (call.command === "joined_space_connect") {
			isSharedSpaceLearned = true
		}
		return answerOnMac(call)
	}
	const relayed: Call[] = []
	vi.stubGlobal("WebSocket", OpeningSocket)
	vi.stubGlobal(
		"fetch",
		sharedSpaceCheck(host.shared.id, storeAnswer(host.store, {}), relayed),
	)
	window.localStorage.setItem("lastSpaceId", "joined:garage")
	window.localStorage.setItem("firstRunDone", "on")
	Object.assign(window, { __TAURI_INTERNALS__: {} })
	const { App } = await import("@/App")
	render(createElement(StrictMode, null, createElement(App)), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await vi.waitFor(
		() =>
			expect(relayed.map(({ command }) => command)).toContain(
				"agent_start_or_resume_session",
			),
		{ timeout: 10_000 },
	)
	await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
	return { relayed, sharedSpaceId: host.shared.id }
}

const spaceIdsIn = (calls: Call[]) => [
	...new Set(
		calls
			.filter(({ args }) => "spaceId" in args)
			.map(({ args }) => args.spaceId),
	),
]

const FEED_READS = new Set(["mission_space_feed", "mission_space_page"])

const feedReadsIn = (calls: Call[]) =>
	calls.filter(({ command }) => FEED_READS.has(command))

it.each(["unknown", "known"] as const)(
	"launches on a joined Space whose shared Space id is %s to the Mac without a call outside it, nor a notice",
	async (listedRemoteSpaceId) => {
		const { relayed, sharedSpaceId } = await launchOnGarage(listedRemoteSpaceId)

		expect(spaceIdsIn(feedReadsIn(relayed))).toEqual([sharedSpaceId])
		expect(spaceIdsIn(relayed)).toEqual([sharedSpaceId])
		expect(wire.refusalNotices).toEqual([])
		expect(wire.raisedNotices).toEqual([])
	},
	60_000,
)
