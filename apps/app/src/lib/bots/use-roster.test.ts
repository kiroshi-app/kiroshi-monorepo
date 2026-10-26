// @vitest-environment happy-dom

import { cleanup } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import { newBotIdentity } from "./bot-settings"
import { mountRoster } from "./mounted-roster"
import { createRosterController } from "./roster-controller"

import {
	createFakeTranscriptStore,
	FAKE_CHAT_ID,
} from "../conversations/fake-transcript-store"
import type { TranscriptStore } from "../conversations/store-port"
import { hostOfflineOf } from "../host/host-offline"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(async () => () => undefined),
}))

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal()),
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

afterEach(() => {
	cleanup()
	vi.mocked(raiseFailureNotice).mockClear()
})

const LOCAL = { spaceRowId: "personal", spaceId: "personal" }

const JOINED = { spaceRowId: "joined:garage", spaceId: "garage" }

const withoutSoloThreads = (store: TranscriptStore) => {
	const read = store.conversationPage
	vi.spyOn(store, "conversationPage").mockImplementation(async (...args) => {
		const page = await read(...args)
		const isTopic = ({ soloBotId }: { soloBotId: string | null }) =>
			soloBotId === null
		return {
			...page,
			pinned: page.pinned.filter(isTopic),
			conversations: page.conversations.filter(isTopic),
		}
	})
	vi.spyOn(store, "conversationSoloStates").mockResolvedValue([])
}

it("raises a failure notice for the opened bot whose solo thread it could not read and keeps the roster", async () => {
	const store = createFakeTranscriptStore()
	withoutSoloThreads(store)
	vi.spyOn(store, "mainChat").mockRejectedValue(new Error("no record"))
	const roster = mountRoster(store)

	await roster.load({
		spaces: [LOCAL],
		spaceRowId: "personal",
		lastRowId: null,
	})

	await vi.waitFor(() =>
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Couldn’t load the latest messages. Restart Kiroshi to retry.",
			}),
		),
	)
	expect(roster.getState().bots.map((bot) => bot.id)).toEqual(["default"])
	expect(roster.getState().previews.personal).toEqual({})
})

const neverAnswered = () => new Promise<never>(() => undefined)

const heldRead = () => {
	let release: () => void = () => undefined
	const held = new Promise<void>((resolve) => {
		release = resolve
	})
	return { held, release }
}

it("asks for the second space before the first one answers", async () => {
	const store = createFakeTranscriptStore()
	const other = await store.createSpace("Vocca")
	const read = store.conversationPage
	const { held, release } = heldRead()
	const reads = vi
		.spyOn(store, "conversationPage")
		.mockImplementation(async (spaceId, ...rest) => {
			if (spaceId === LOCAL.spaceId) {
				await held
			}
			return read(spaceId, ...rest)
		})
	const roster = mountRoster(store)

	const opening = roster.load({
		spaces: [LOCAL, { spaceRowId: other.id, spaceId: other.id }],
		spaceRowId: LOCAL.spaceRowId,
		lastRowId: null,
	})

	await vi.waitFor(() =>
		expect(reads).toHaveBeenCalledWith(
			other.id,
			null,
			30,
			expect.any(AbortSignal),
		),
	)
	release()
	await opening
})

it("opens on the local spaces while a joined host never answers", async () => {
	const store = createFakeTranscriptStore()
	const read = store.bots
	vi.spyOn(store, "bots").mockImplementation((spaceId, signal) =>
		spaceId === JOINED.spaceId ? neverAnswered() : read(spaceId, signal),
	)
	const roster = mountRoster(store)

	void roster.load({
		spaces: [LOCAL, JOINED],
		spaceRowId: LOCAL.spaceRowId,
		lastRowId: null,
	})

	await vi.waitFor(() => expect(roster.getState().hasLoaded).toBe(true))
	expect(roster.getState().bots.map((bot) => bot.id)).toEqual(["default"])
})

it("knows the solo threads of the local spaces from their pages while a joined read is still out", async () => {
	const store = createFakeTranscriptStore()
	const read = store.bots
	vi.spyOn(store, "bots").mockImplementation((spaceId, signal) =>
		spaceId === JOINED.spaceId ? neverAnswered() : read(spaceId, signal),
	)
	const soloThreadReads = vi.spyOn(store, "mainChat")
	const roster = createRosterController(store, {
		queryClient: createQueryTestWrapper().queryClient,
	})

	void roster.load({
		spaces: [LOCAL, JOINED],
		spaceRowId: LOCAL.spaceRowId,
		lastRowId: null,
	})

	await vi.waitFor(() =>
		expect(roster.getState().soloThreads[FAKE_CHAT_ID]).toEqual({
			spaceId: LOCAL.spaceRowId,
			botId: "default",
		}),
	)
	expect(soloThreadReads).not.toHaveBeenCalled()
})

it("fills in the roster of a joined host that answers after the launch", async () => {
	const store = createFakeTranscriptStore()
	const garage = await store.createSpace("Garage")
	const late = await store.createBot(newBotIdentity([]), garage.id)
	const joined = { spaceRowId: "joined:garage", spaceId: garage.id }
	const read = store.bots
	const { held, release } = heldRead()
	vi.spyOn(store, "bots").mockImplementation(async (spaceId, signal) => {
		if (spaceId === garage.id) {
			await held
		}
		return read(spaceId, signal)
	})
	const roster = mountRoster(store)

	void roster.load({
		spaces: [LOCAL, joined],
		spaceRowId: LOCAL.spaceRowId,
		lastRowId: null,
	})
	await vi.waitFor(() => expect(roster.getState().hasLoaded).toBe(true))
	release()

	await vi.waitFor(() =>
		expect(
			roster.getState().rosters[joined.spaceRowId]?.map((bot) => bot.id),
		).toEqual([late.id]),
	)
})

it("aborts the read of a joined host once nothing watches its roster", async () => {
	const store = createFakeTranscriptStore()
	const signals: (AbortSignal | undefined)[] = []
	vi.spyOn(store, "conversationPage").mockImplementation(
		(_spaceId, _cursor, _limit, signal) => {
			signals.push(signal)
			return neverAnswered()
		},
	)
	const roster = mountRoster(store)
	void roster.load({
		spaces: [JOINED],
		spaceRowId: JOINED.spaceRowId,
		lastRowId: null,
	})
	await vi.waitFor(() => expect(signals).toHaveLength(1))

	cleanup()

	await vi.waitFor(() => expect(signals[0]?.aborted).toBe(true))
})

it("starts a write while a roster read is still out", async () => {
	const store = createFakeTranscriptStore()
	const roster = mountRoster(store)
	await roster.load({
		spaces: [LOCAL],
		spaceRowId: LOCAL.spaceRowId,
		lastRowId: null,
	})
	const reads = vi
		.spyOn(store, "conversationPage")
		.mockImplementation(neverAnswered)
	const writes = vi.spyOn(store, "createBot")
	void roster.reload()
	await vi.waitFor(() => expect(reads).toHaveBeenCalled())

	void roster.create()

	await vi.waitFor(() => expect(writes).toHaveBeenCalledOnce())
})

it("shows no row of the local space once a joined space opens and while its roster loads", async () => {
	const store = createFakeTranscriptStore()
	const garage = await store.createSpace("Garage")
	await store.createBot(newBotIdentity([]), garage.id)
	const roster = mountRoster({
		...store,
		bots: (spaceId) => store.bots(spaceId === "garage" ? garage.id : spaceId),
		conversations: (spaceId) =>
			store.conversations(spaceId === "garage" ? garage.id : spaceId),
	})
	await roster.load({
		spaces: [LOCAL],
		spaceRowId: "personal",
		lastRowId: null,
	})
	let release: () => void = () => undefined
	const held = new Promise<void>((resolve) => {
		release = resolve
	})
	vi.spyOn(store, "bots").mockImplementationOnce(async (spaceId) => {
		await held
		return createFakeTranscriptStore().bots(spaceId)
	})

	const opening = roster.load({
		spaces: [JOINED],
		spaceRowId: JOINED.spaceRowId,
		lastRowId: null,
	})

	expect(roster.getState().rosters).toEqual({ [JOINED.spaceRowId]: [] })
	expect(roster.getState().bots).toEqual([])
	release()
	await opening
	expect(Object.keys(roster.getState().rosters)).toEqual([JOINED.spaceRowId])
})

const offlineHostFor = (store: TranscriptStore, spaceId: string) => {
	const read = store.bots
	vi.spyOn(store, "bots").mockImplementation((asked) =>
		asked === spaceId ? Promise.reject(hostOfflineOf("gone")) : read(asked),
	)
}

it("opens with the failure flag when the host of the joined space is offline at launch", async () => {
	const store = createFakeTranscriptStore()
	offlineHostFor(store, JOINED.spaceId)
	const roster = mountRoster(store)

	await roster.load({
		spaces: [JOINED],
		spaceRowId: JOINED.spaceRowId,
		lastRowId: null,
	})

	expect(roster.getState()).toMatchObject({
		hasLoaded: true,
		hasFailedToLoad: true,
	})
})

it("opens on the local spaces while the joined space beside them is offline at launch", async () => {
	const store = createFakeTranscriptStore()
	offlineHostFor(store, JOINED.spaceId)
	const roster = mountRoster(store)

	await roster.load({
		spaces: [LOCAL, JOINED],
		spaceRowId: LOCAL.spaceRowId,
		lastRowId: null,
	})

	expect(roster.getState()).toMatchObject({
		hasLoaded: true,
		hasFailedToLoad: true,
	})
	expect(roster.getState().bots.map((bot) => bot.id)).toEqual(["default"])
})

it("holds the launch while the roster of a local space fails beside a joined one", async () => {
	const store = createFakeTranscriptStore()
	offlineHostFor(store, LOCAL.spaceId)
	const roster = mountRoster(store)

	await roster.load({
		spaces: [LOCAL, JOINED],
		spaceRowId: LOCAL.spaceRowId,
		lastRowId: null,
	})

	expect(roster.getState()).toMatchObject({
		hasLoaded: false,
		hasFailedToLoad: true,
	})
})
