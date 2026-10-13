// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { MockInstance } from "vitest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	createFakeConnectionPort,
	type FakeConnectionPort,
} from "./fake-connection-port"
import { useConnections } from "./use-connections"

import type { EnvOwner } from "../conversations/store-contract"
import {
	joinFakeHost,
	leaveFakeHost,
	reopenFakeRelay,
} from "../host/fake-joined-hosts"
import { invalidateOnHostReconnect } from "../query/host-invalidations"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("../host", async (importOriginal) => ({
	...(await importOriginal<typeof import("../host")>()),
	...(await import("../host/fake-joined-hosts")).fakeHostModule,
}))

const SPACE: EnvOwner = { kind: "space", id: "s-1" }

const URL = "https://mcp.atlas.test/mcp"

const DENIED = { kind: "denied", detail: "access_denied" }

const JOINED = "garage"

const ATLAS_CONNECTED = [{ name: "atlas", status: "connected" as const }]

const commandsOf = (port: FakeConnectionPort) =>
	port.calls.map((call) => call.command)

const rendered = (port: FakeConnectionPort, owner: EnvOwner | null = SPACE) => {
	const query = createQueryTestWrapper()
	const hook = renderHook(() => useConnections(port, owner), {
		wrapper: query.wrapper,
	})
	return { ...hook, queryClient: query.queryClient }
}

const opened = async (port: FakeConnectionPort) => {
	const hook = rendered(port)
	await waitFor(() => expect(hook.result.current.isPending).toBe(false))
	return hook
}

let reported: MockInstance<typeof console.error>

beforeEach(() => {
	reported = vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(async () => {
	cleanup()
	vi.restoreAllMocks()
	await leaveFakeHost(JOINED)
})

describe("useConnections", () => {
	it("waits on the first status read before it says anything about the rows", () => {
		const port = createFakeConnectionPort()
		port.status = () => new Promise(() => undefined)

		const { result } = rendered(port)

		expect(result.current).toMatchObject({ rows: [], isPending: true })
	})

	it("reads the status of the owner it opens on", async () => {
		const port = createFakeConnectionPort()
		port.rows.space = [{ name: "atlas", status: "needsAuthorization" }]

		const { result } = await opened(port)

		expect(port.calls).toEqual([{ command: "status", owner: SPACE }])
		expect(result.current.rows).toEqual(port.rows.space)
	})

	it("reads the status once for two panels on the same owner", async () => {
		const port = createFakeConnectionPort()
		const { wrapper } = createQueryTestWrapper()

		const { result } = renderHook(
			() => [useConnections(port, SPACE), useConnections(port, { ...SPACE })],
			{ wrapper },
		)

		await waitFor(() =>
			expect(result.current.map(({ isPending }) => isPending)).toEqual([
				false,
				false,
			]),
		)
		expect(commandsOf(port)).toEqual(["status"])
	})

	it("holds a connection as connecting until its grant lands, then reads again", async () => {
		const port = createFakeConnectionPort()
		const { result } = await opened(port)

		act(() => {
			void result.current.connect("atlas", URL)
		})

		await waitFor(() => expect(result.current.connecting).toBe("atlas"))
		expect(port.calls.at(-1)).toEqual({
			command: "connect",
			owner: SPACE,
			name: "atlas",
			url: URL,
		})
		act(() => result.current.cancel())
	})

	it("hands back the rows read once the grant lands", async () => {
		const port = createFakeConnectionPort()
		const { result } = await opened(port)
		const connecting = result.current.connect("atlas", URL)
		await waitFor(() => expect(result.current.connecting).toBe("atlas"))

		port.rows.space = ATLAS_CONNECTED
		port.grant()

		await expect(connecting).resolves.toEqual({
			rows: ATLAS_CONNECTED,
			failure: null,
		})
		await waitFor(() => expect(result.current.connecting).toBeNull())
		expect(result.current.rows).toEqual(ATLAS_CONNECTED)
		expect(commandsOf(port)).toEqual(["status", "connect", "status"])
	})

	it("cancels a running flow and reads again without calling it a failure", async () => {
		const port = createFakeConnectionPort()
		const { result } = await opened(port)
		const connecting = result.current.connect("atlas", URL)
		await waitFor(() => expect(result.current.connecting).toBe("atlas"))

		act(() => result.current.cancel())

		await expect(connecting).resolves.toEqual({ rows: [], failure: null })
		await waitFor(() => expect(result.current.connecting).toBeNull())
		expect(result.current.failure).toBeNull()
		expect(commandsOf(port).slice(0, 3)).toEqual([
			"status",
			"connect",
			"cancel",
		])
		expect(commandsOf(port).slice(3)).toContain("status")
		expect(reported).not.toHaveBeenCalled()
	})

	it("disconnects a connection of the open owner, then reads again", async () => {
		const port = createFakeConnectionPort()
		const { result } = await opened(port)

		await act(() => result.current.disconnect("atlas", URL))

		expect(port.calls.slice(1)).toEqual([
			{ command: "disconnect", owner: SPACE, name: "atlas", url: URL },
			{ command: "status", owner: SPACE },
		])
	})

	it("keeps the reason a refused connect gave", async () => {
		const port = createFakeConnectionPort()
		port.refusals.connect = DENIED
		const { result } = await opened(port)

		await act(async () => {
			expect(await result.current.connect("atlas", URL)).toEqual({
				rows: [],
				failure: { command: "connect", name: "atlas", reason: DENIED },
			})
		})

		await waitFor(() =>
			expect(result.current.failure).toEqual({
				command: "connect",
				name: "atlas",
				reason: DENIED,
			}),
		)
		expect(result.current.connecting).toBeNull()
	})

	it("keeps the reason a refused disconnect gave", async () => {
		const port = createFakeConnectionPort()
		port.refusals.disconnect = { kind: "alreadyRunning" }
		const { result } = await opened(port)

		await act(() => result.current.disconnect("atlas", URL))

		await waitFor(() =>
			expect(result.current.failure).toEqual({
				command: "disconnect",
				name: "atlas",
				reason: { kind: "alreadyRunning" },
			}),
		)
	})

	it("clears the kept reason once the next connect starts", async () => {
		const port = createFakeConnectionPort()
		port.refusals.connect = DENIED
		const { result } = await opened(port)
		await act(() => result.current.connect("atlas", URL))
		await waitFor(() => expect(result.current.failure).not.toBeNull())

		delete port.refusals.connect
		act(() => {
			void result.current.connect("atlas", URL)
		})

		await waitFor(() => expect(result.current.connecting).toBe("atlas"))
		expect(result.current.failure).toBeNull()
		act(() => result.current.cancel())
	})

	it("reports the refusal it kept, once, naming the command and the application", async () => {
		const port = createFakeConnectionPort()
		port.refusals.connect = DENIED
		const { result } = await opened(port)

		await act(() => result.current.connect("atlas", URL))

		expect(reported).toHaveBeenCalledOnce()
		expect(reported).toHaveBeenCalledWith(
			"connections: connect was refused for atlas",
			DENIED,
		)
	})

	it("reports a refused status read against the owner it read", async () => {
		const port = createFakeConnectionPort()
		port.refusals.status = { kind: "io", detail: "locked" }
		await opened(port)

		expect(reported).toHaveBeenCalledWith(
			"connections: status was refused for space",
			port.refusals.status,
		)
	})

	it("reports nothing when every command lands", async () => {
		const port = createFakeConnectionPort()
		const { result } = await opened(port)

		await act(() => result.current.disconnect("atlas", URL))

		expect(reported).not.toHaveBeenCalled()
	})

	it("sends nothing while no owner is open", async () => {
		const port = createFakeConnectionPort()
		const { result } = rendered(port, null)

		await act(async () => {
			await result.current.connect("atlas", URL)
			result.current.cancel()
			await result.current.disconnect("atlas", URL)
		})

		expect(port.calls).toEqual([])
	})

	it("keeps a connect in flight and its rows on screen when the host reconnects", async () => {
		const port = createFakeConnectionPort()
		port.rows.space = [{ name: "atlas", status: "needsAuthorization" }]
		await joinFakeHost(JOINED)
		const { result, queryClient } = await opened(port)
		const stopInvalidating = invalidateOnHostReconnect(queryClient)
		act(() => {
			void result.current.connect("atlas", URL)
		})
		await waitFor(() => expect(result.current.connecting).toBe("atlas"))

		reopenFakeRelay(JOINED)

		expect(result.current).toMatchObject({
			rows: port.rows.space,
			connecting: "atlas",
		})
		await waitFor(() =>
			expect(commandsOf(port)).toEqual(["status", "connect", "status"]),
		)
		act(() => result.current.cancel())
		stopInvalidating()
	})
})
