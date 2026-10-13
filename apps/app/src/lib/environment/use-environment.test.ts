// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import { toEnvironmentRows } from "./environment-rows"
import { useEnvironment } from "./use-environment"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { EnvScope } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import {
	joinFakeHost,
	leaveFakeHost,
	reopenFakeRelay,
} from "../host/fake-joined-hosts"
import { invalidateOnHostReconnect } from "../query/host-invalidations"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))
vi.mock("../host", async (importOriginal) => ({
	...(await importOriginal<typeof import("../host")>()),
	...(await import("../host/fake-joined-hosts")).fakeHostModule,
}))

const JOINED = "garage"

afterEach(async () => {
	cleanup()
	vi.mocked(raiseFailureNotice).mockClear()
	await leaveFakeHost(JOINED)
})

const SPACE: EnvScope = { kind: "space", id: "s-1" }

const BOT: EnvScope = { kind: "bot", id: "b-1", spaceId: "s-1" }

const SERVER: EnvScope = { kind: "server", name: "atlas", owner: BOT }

const declaringUnset = (
	store: TranscriptStore,
	scope: EnvScope,
	name: string,
): TranscriptStore => {
	let isUnset = true
	return {
		...store,
		environmentVariables: async (asked) => [
			...(isUnset
				? [{ name, definedIn: scope, servedFrom: scope, isUnset }]
				: []),
			...(await store.environmentVariables(asked)),
		],
		setEnvironmentVariable: (written, writtenName, value) => {
			if (writtenName === name) {
				isUnset = false
			}
			return store.setEnvironmentVariable(written, writtenName, value)
		},
	}
}

const refusing = (
	store: TranscriptStore,
	member:
		| "environmentVariables"
		| "setEnvironmentVariable"
		| "deleteEnvironmentVariable",
) => ({
	...store,
	[member]: () => Promise.reject(new Error("refused")),
})

type OpenedScope = { scope: EnvScope | null }

const rendered = (store: TranscriptStore, scope: EnvScope | null = BOT) => {
	const { wrapper } = createQueryTestWrapper()
	return renderHook(
		({ scope: shown }: OpenedScope) => useEnvironment(store, shown),
		{ wrapper, initialProps: { scope } },
	)
}

const opened = async (store: TranscriptStore, scope: EnvScope = BOT) => {
	const hook = rendered(store, scope)
	await waitFor(() => expect(hook.result.current.isPending).toBe(false))
	return hook
}

describe("useEnvironment", () => {
	it("waits on the first read before it says anything about the list", () => {
		const store = createFakeTranscriptStore()
		store.environmentVariables = () => new Promise(() => undefined)

		const { result } = rendered(store)

		expect(result.current).toMatchObject({
			entries: [],
			isPending: true,
			hasFailedToRead: false,
		})
	})

	it("opens on the names the scope already holds", async () => {
		const store = createFakeTranscriptStore()
		await store.setEnvironmentVariable(BOT, "BOT_SEED", "1")

		const { result } = await opened(store)

		expect(result.current.entries).toEqual([
			{ name: "BOT_SEED", definedIn: BOT, servedFrom: BOT },
		])
	})

	it("lists what the space defines beside what the companion defines", async () => {
		const store = createFakeTranscriptStore()
		await store.setEnvironmentVariable(SPACE, "ATLAS_TOKEN", "sk-1")
		await store.setEnvironmentVariable(BOT, "BOT_SEED", "1")

		const { result } = await opened(store)

		expect(result.current.entries).toEqual([
			{ name: "ATLAS_TOKEN", definedIn: SPACE, servedFrom: SPACE },
			{ name: "BOT_SEED", definedIn: BOT, servedFrom: BOT },
		])
	})

	it("reads a list once for two panels on the same scope", async () => {
		const store = createFakeTranscriptStore()
		const read = vi.spyOn(store, "environmentVariables")
		const { wrapper } = createQueryTestWrapper()

		const { result } = renderHook(
			() => [useEnvironment(store, BOT), useEnvironment(store, { ...BOT })],
			{ wrapper },
		)

		await waitFor(() =>
			expect(result.current.map(({ isPending }) => isPending)).toEqual([
				false,
				false,
			]),
		)
		expect(read).toHaveBeenCalledTimes(1)
	})

	it("writes a variable into the scope it was opened on", async () => {
		const store = createFakeTranscriptStore()
		const { result } = await opened(store)

		await act(() => result.current.set("ATLAS_TOKEN", "sk-1"))

		expect(await store.environmentVariables(BOT)).toEqual([
			{ name: "ATLAS_TOKEN", definedIn: BOT, servedFrom: BOT },
		])
		await waitFor(() => expect(result.current.entries).toHaveLength(1))
	})

	it("takes a removed variable out of the list", async () => {
		const store = createFakeTranscriptStore()
		await store.setEnvironmentVariable(BOT, "ATLAS_TOKEN", "sk-1")
		await store.setEnvironmentVariable(BOT, "BOT_SEED", "1")
		const { result } = await opened(store)

		await act(() => result.current.remove("ATLAS_TOKEN"))

		await waitFor(() =>
			expect(result.current.entries).toEqual([
				{ name: "BOT_SEED", definedIn: BOT, servedFrom: BOT },
			]),
		)
	})

	it.each([
		["space Settings", SPACE],
		["companion Settings", BOT],
		["the MCP server editor", SERVER],
	])(
		"draws an unset name with its value once Replace writes one, in %s",
		async (_, scope) => {
			const store = declaringUnset(
				createFakeTranscriptStore(),
				scope,
				"ATLAS_TOKEN",
			)
			const { result } = await opened(store, scope)
			expect(toEnvironmentRows(result.current.entries)).toEqual([
				expect.objectContaining({ name: "ATLAS_TOKEN", isUnset: true }),
			])

			await act(() => result.current.set("ATLAS_TOKEN", "sk-1"))

			await waitFor(() =>
				expect(toEnvironmentRows(result.current.entries)).toEqual([
					expect.not.objectContaining({ isUnset: true }),
				]),
			)
			const [row] = toEnvironmentRows(result.current.entries)
			expect(row).toMatchObject({ name: "ATLAS_TOKEN" })
			expect(row).not.toHaveProperty("isUnset")
		},
	)

	it("never reads a stored value back into what it lists", async () => {
		const store = createFakeTranscriptStore()
		const { result } = await opened(store)

		await act(() => result.current.set("ATLAS_TOKEN", "sk-1"))

		expect(JSON.stringify(result.current.entries)).not.toContain("sk-1")
	})

	it("hands back a refused write and leaves the list where it was", async () => {
		const store = createFakeTranscriptStore()
		await store.setEnvironmentVariable(BOT, "BOT_SEED", "1")
		const { result } = await opened(refusing(store, "setEnvironmentVariable"))

		await act(() =>
			expect(result.current.set("ATLAS_TOKEN", "sk-1")).rejects.toThrow(
				"refused",
			),
		)
		expect(result.current.entries).toEqual([
			{ name: "BOT_SEED", definedIn: BOT, servedFrom: BOT },
		])
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("hands back a refused removal and leaves the list where it was", async () => {
		const store = createFakeTranscriptStore()
		await store.setEnvironmentVariable(BOT, "BOT_SEED", "1")
		const { result } = await opened(
			refusing(store, "deleteEnvironmentVariable"),
		)

		await act(() =>
			expect(result.current.remove("BOT_SEED")).rejects.toThrow("refused"),
		)
		expect(result.current.entries).toEqual([
			{ name: "BOT_SEED", definedIn: BOT, servedFrom: BOT },
		])
	})

	it("says so inline when the list could not be read", async () => {
		const store = createFakeTranscriptStore()
		const { result } = await opened(refusing(store, "environmentVariables"))

		expect(result.current.hasFailedToRead).toBe(true)
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("keeps the names it already holds when a later read fails", async () => {
		const store = createFakeTranscriptStore()
		await store.setEnvironmentVariable(BOT, "BOT_SEED", "1")
		const { result } = await opened(store)
		const held = result.current.entries

		store.environmentVariables = () => Promise.reject(new Error("refused"))
		await act(() => result.current.set("ATLAS_TOKEN", "sk-1"))

		await waitFor(() => expect(result.current.hasFailedToRead).toBe(true))
		expect(result.current.entries).toEqual(held)
	})

	it("clears the failure once the list can be read again", async () => {
		const store = createFakeTranscriptStore()
		await store.setEnvironmentVariable(BOT, "BOT_SEED", "1")
		const reading = store.environmentVariables
		store.environmentVariables = () => Promise.reject(new Error("refused"))
		const { result } = await opened(store)
		expect(result.current.hasFailedToRead).toBe(true)

		store.environmentVariables = reading
		await act(() => result.current.set("ATLAS_TOKEN", "sk-1"))

		await waitFor(() => expect(result.current.entries).toHaveLength(2))
		expect(result.current.hasFailedToRead).toBe(false)
	})

	it("reads and writes nothing while no scope is open", async () => {
		const store = createFakeTranscriptStore()
		const read = vi.spyOn(store, "environmentVariables")
		const { result } = rendered(store, null)

		await act(() => result.current.set("ATLAS_TOKEN", "sk-1"))

		expect(read).not.toHaveBeenCalled()
		expect(result.current.entries).toEqual([])
		expect(await store.environmentVariables(BOT)).toEqual([])
	})

	it("reads the next scope once the panel moves to it", async () => {
		const store = createFakeTranscriptStore()
		await store.setEnvironmentVariable(SPACE, "SPACE_SEED", "1")
		const { result, rerender } = await opened(store, BOT)

		rerender({ scope: SPACE })

		await waitFor(() =>
			expect(result.current.entries).toEqual([
				{ name: "SPACE_SEED", definedIn: SPACE, servedFrom: SPACE },
			]),
		)
	})

	it("reads the scope again, its rows still on screen, when the host reconnects", async () => {
		const store = createFakeTranscriptStore()
		await store.setEnvironmentVariable(BOT, "BOT_SEED", "1")
		await joinFakeHost(JOINED)
		const { queryClient, wrapper } = createQueryTestWrapper()
		const stopInvalidating = invalidateOnHostReconnect(queryClient)
		const { result } = renderHook(() => useEnvironment(store, BOT), {
			wrapper,
		})
		await waitFor(() => expect(result.current.entries).toHaveLength(1))
		const read = vi.spyOn(store, "environmentVariables")

		reopenFakeRelay(JOINED)

		expect(result.current.entries).toHaveLength(1)
		await waitFor(() => expect(read).toHaveBeenCalledOnce())
		stopInvalidating()
	})
})
