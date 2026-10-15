// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useMcpServers } from "./use-mcp-servers"

import { listen } from "../host"
import { INSTALLED_EVENT } from "../applications/application-transport"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { EnvOwner } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("../host", () => ({
	listen: vi.fn(async () => () => undefined),
	onHostReconnected: vi.fn(),
	joinedHosts: { getState: () => ({ active: null, connections: {} }) },
}))

afterEach(() => {
	cleanup()
	vi.mocked(listen).mockClear()
})

const BOT: EnvOwner = { kind: "bot", id: "default", spaceId: "personal" }

const SPACE: EnvOwner = { kind: "space", id: "personal" }

const BOT_PLUGIN = { kind: "bot", id: "default" } as const

const SPACE_PLUGIN = { kind: "space", id: "personal" } as const

const ATLAS = { command: "npx", args: ["-y", "@atlas/mcp-server"] }

const LEDGER = { type: "http", url: "https://ledger.internal/mcp" }

const A_MARK = {
	title: "Ledger",
	logo: "<svg />",
	logoUrl: "https://ledger.internal/logo.png",
}

const rendered = (store: TranscriptStore, owner: EnvOwner | null = BOT) => {
	const { wrapper } = createQueryTestWrapper()
	return renderHook(() => useMcpServers(store, owner), { wrapper })
}

const opened = async (store: TranscriptStore, owner: EnvOwner = BOT) => {
	const hook = rendered(store, owner)
	await waitFor(() => expect(hook.result.current.isPending).toBe(false))
	return hook
}

const installAnnounced = () => {
	const [, announce] =
		vi.mocked(listen).mock.calls.find(([event]) => event === INSTALLED_EVENT) ??
		[]
	announce?.({ event: INSTALLED_EVENT, id: 1, payload: null }, null)
}

describe("useMcpServers", () => {
	it("waits on the first read before it says anything about the servers", () => {
		const store = createFakeTranscriptStore()
		store.pluginMcpServers = () => new Promise(() => undefined)

		const { result } = rendered(store)

		expect(result.current).toMatchObject({
			servers: [],
			isPending: true,
			hasFailedToLoad: false,
		})
	})

	it("opens on the servers the bundle already declares", async () => {
		const store = createFakeTranscriptStore()
		await store.setPluginMcpServer(BOT_PLUGIN, "atlas", ATLAS)

		const { result } = await opened(store)

		expect(result.current.servers).toEqual([{ name: "atlas", config: ATLAS }])
	})

	it("reads the servers once for two panels on the same owner", async () => {
		const store = createFakeTranscriptStore()
		const read = vi.spyOn(store, "pluginMcpServers")
		const { wrapper } = createQueryTestWrapper()

		const { result } = renderHook(
			() => [useMcpServers(store, BOT), useMcpServers(store, { ...BOT })],
			{ wrapper },
		)

		await waitFor(() =>
			expect(result.current.map(({ isPending }) => isPending)).toEqual([
				false,
				false,
			]),
		)
		expect(read).toHaveBeenCalledOnce()
	})

	it("reports a listing it could not read instead of an empty panel", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "pluginMcpServers").mockRejectedValue(
			new Error("no bundle"),
		)

		const { result } = await opened(store)

		expect(result.current.hasFailedToLoad).toBe(true)
	})

	it("clears the reported failure once the listing reads again", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "pluginMcpServers").mockRejectedValueOnce(
			new Error("no bundle"),
		)
		const { result } = await opened(store)

		await act(() => result.current.reread())

		await waitFor(() => expect(result.current.hasFailedToLoad).toBe(false))
	})

	it("writes a server under the name it was given", async () => {
		const store = createFakeTranscriptStore()
		const { result } = await opened(store)

		await act(async () => {
			expect(await result.current.create("atlas", ATLAS)).toBe(true)
		})

		expect(await store.pluginMcpServers(BOT_PLUGIN)).toEqual([
			{ name: "atlas", config: ATLAS },
		])
		await waitFor(() =>
			expect(result.current.servers).toEqual([
				{ name: "atlas", config: ATLAS },
			]),
		)
	})

	it("writes a changed configuration to the server it was opened on", async () => {
		const store = createFakeTranscriptStore()
		await store.setPluginMcpServer(BOT_PLUGIN, "atlas", ATLAS)
		const { result } = await opened(store)

		await act(() => result.current.rename("atlas", "atlas", LEDGER))

		expect(await store.pluginMcpServers(BOT_PLUGIN)).toEqual([
			{ name: "atlas", config: LEDGER },
		])
	})

	it("moves a renamed server rather than leaving a second one behind", async () => {
		const store = createFakeTranscriptStore()
		await store.setPluginMcpServer(BOT_PLUGIN, "ledger", LEDGER)
		const { result } = await opened(store)

		await act(() => result.current.rename("ledger", "books", LEDGER))

		expect(await store.pluginMcpServers(BOT_PLUGIN)).toEqual([
			{ name: "books", config: LEDGER },
		])
		await waitFor(() =>
			expect(result.current.servers).toEqual([
				{ name: "books", config: LEDGER },
			]),
		)
	})

	it("takes a removed server out and leaves the rest where they were", async () => {
		const store = createFakeTranscriptStore()
		await store.setPluginMcpServer(BOT_PLUGIN, "atlas", ATLAS)
		await store.setPluginMcpServer(BOT_PLUGIN, "ledger", LEDGER)
		const { result } = await opened(store)

		await act(() => result.current.remove("atlas"))

		expect(await store.pluginMcpServers(BOT_PLUGIN)).toEqual([
			{ name: "ledger", config: LEDGER },
		])
		await waitFor(() =>
			expect(result.current.servers).toEqual([
				{ name: "ledger", config: LEDGER },
			]),
		)
	})

	it("falls back to what the bundle holds when a write is refused", async () => {
		const store = createFakeTranscriptStore()
		await store.setPluginMcpServer(BOT_PLUGIN, "atlas", ATLAS)
		vi.spyOn(store, "deletePluginMcpServer").mockRejectedValue(
			new Error("refused"),
		)
		const read = vi.spyOn(store, "pluginMcpServers")
		const { result } = await opened(store)

		await act(async () => {
			expect(await result.current.remove("atlas")).toBe(false)
		})

		expect(read).toHaveBeenCalledTimes(2)
		expect(result.current.servers).toEqual([{ name: "atlas", config: ATLAS }])
	})

	it("opens on the servers the space plugin already declares", async () => {
		const store = createFakeTranscriptStore()
		await store.setPluginMcpServer(SPACE_PLUGIN, "atlas", ATLAS)

		const { result } = await opened(store, SPACE)

		expect(result.current.servers).toEqual([{ name: "atlas", config: ATLAS }])
	})

	it("writes a space server into the space plugin and leaves the companions alone", async () => {
		const store = createFakeTranscriptStore()
		const { result } = await opened(store, SPACE)

		await act(() => result.current.create("atlas", ATLAS))

		expect(await store.pluginMcpServers(SPACE_PLUGIN)).toEqual([
			{ name: "atlas", config: ATLAS },
		])
		expect(await store.pluginMcpServers(BOT_PLUGIN)).toEqual([])
	})

	it("keeps the mark of a renamed server under the name it took", async () => {
		const store = createFakeTranscriptStore()
		await store.setPluginMcpServer(BOT_PLUGIN, "ledger", LEDGER, A_MARK)
		const { result } = await opened(store)

		await act(() => result.current.rename("ledger", "books", LEDGER))

		expect(await store.pluginMcpServers(BOT_PLUGIN)).toEqual([
			{ name: "books", config: LEDGER, ...A_MARK },
		])
	})

	it("declares no mark for a renamed server that carried none", async () => {
		const store = createFakeTranscriptStore()
		await store.setPluginMcpServer(BOT_PLUGIN, "ledger", LEDGER)
		const declare = vi.spyOn(store, "setPluginMcpServer")
		const { result } = await opened(store)

		await act(() => result.current.rename("ledger", "books", LEDGER))

		expect(declare).toHaveBeenCalledWith(BOT_PLUGIN, "books", LEDGER, undefined)
	})

	it("declares no mark for a server saved under the name it already had", async () => {
		const store = createFakeTranscriptStore()
		await store.setPluginMcpServer(BOT_PLUGIN, "ledger", LEDGER, A_MARK)
		const declare = vi.spyOn(store, "setPluginMcpServer")
		const { result } = await opened(store)

		await act(() => result.current.rename("ledger", "ledger", LEDGER))

		expect(declare).toHaveBeenCalledWith(
			BOT_PLUGIN,
			"ledger",
			LEDGER,
			undefined,
		)
		expect(await store.pluginMcpServers(BOT_PLUGIN)).toEqual([
			{ name: "ledger", config: LEDGER, ...A_MARK },
		])
	})

	it("takes a removed space server out of the space plugin", async () => {
		const store = createFakeTranscriptStore()
		await store.setPluginMcpServer(SPACE_PLUGIN, "atlas", ATLAS)
		await store.setPluginMcpServer(SPACE_PLUGIN, "ledger", LEDGER)
		const { result } = await opened(store, SPACE)

		await act(() => result.current.remove("atlas"))

		expect(await store.pluginMcpServers(SPACE_PLUGIN)).toEqual([
			{ name: "ledger", config: LEDGER },
		])
	})

	it("reads and writes nothing while nothing is open", async () => {
		const store = createFakeTranscriptStore()
		const read = vi.spyOn(store, "pluginMcpServers")
		const { result } = rendered(store, null)

		await act(async () => {
			expect(await result.current.create("atlas", ATLAS)).toBe(false)
		})

		expect(read).not.toHaveBeenCalled()
		expect(await store.pluginMcpServers(BOT_PLUGIN)).toEqual([])
	})

	it("reads the servers again when the agent installs an application", async () => {
		const store = createFakeTranscriptStore()
		const { result } = await opened(store)
		await store.setPluginMcpServer(BOT_PLUGIN, "atlas", ATLAS)

		installAnnounced()

		await waitFor(() =>
			expect(result.current.servers).toEqual([
				{ name: "atlas", config: ATLAS },
			]),
		)
	})
})
