// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import {
	invalidateOnHostReconnect,
	useInvalidateOnHostEvent,
} from "./host-invalidations"
import { createQueryClient } from "./query-client"
import { createQueryTestWrapper } from "./query-test-wrapper"

import { listen, onHostReconnected } from "@/lib/host"

const shown = vi.hoisted(() => ({ hostId: null as string | null }))

vi.mock("@/lib/host", () => ({
	listen: vi.fn(),
	onHostReconnected: vi.fn(),
	joinedHosts: {
		getState: () => ({
			active: shown.hostId,
			connections: { garage: { status: "up" }, shed: { status: "down" } },
		}),
	},
}))

afterEach(() => {
	cleanup()
	vi.mocked(listen).mockReset()
	shown.hostId = null
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const mountInvalidationOf = (event: string) => {
	const unlisten = vi.fn()
	vi.mocked(listen).mockResolvedValue(unlisten)
	const { queryClient, wrapper } = createQueryTestWrapper()
	const invalidate = vi.spyOn(queryClient, "invalidateQueries")
	const hook = renderHook(
		() => useInvalidateOnHostEvent(event, [["cached", "a"], ["cached"]]),
		{ wrapper },
	)
	const emitFrom = (hostId: string | null) => {
		const [event, handler] = vi.mocked(listen).mock.calls[0]
		handler({ event, id: 1, payload: null }, hostId)
	}
	return { ...hook, unlisten, invalidate, emitFrom }
}

it("invalidates the given keys when the host event fires, and stops on unmount", async () => {
	const { invalidate, emitFrom, unmount, unlisten } =
		mountInvalidationOf("bots://changed")

	emitFrom(null)

	expect(listen).toHaveBeenCalledWith("bots://changed", expect.any(Function))
	await vi.waitFor(() => {
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cached", "a"] })
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cached"] })
	})

	unmount()
	await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1))
})

it("invalidates the keys on an event from the shown joined host", async () => {
	shown.hostId = "garage"
	const { invalidate, emitFrom } = mountInvalidationOf("bots://changed")

	emitFrom("garage")

	await vi.waitFor(() =>
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cached"] }),
	)
})

it("invalidates nothing on an event from a host whose space is not shown", async () => {
	shown.hostId = "garage"
	const { invalidate, emitFrom } = mountInvalidationOf("bots://changed")

	emitFrom(null)
	emitFrom("shed")
	await settle()

	expect(invalidate).not.toHaveBeenCalled()
})

it("invalidates the keys on an app-wide local event while a joined space is shown", async () => {
	shown.hostId = "garage"
	const { invalidate, emitFrom } = mountInvalidationOf("account://changed")

	emitFrom(null)

	await vi.waitFor(() =>
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cached"] }),
	)
})

it("keeps the same subscription when the shown space changes", async () => {
	const { invalidate, emitFrom, rerender, unlisten } =
		mountInvalidationOf("bots://changed")

	shown.hostId = "garage"
	rerender()
	emitFrom("garage")

	await vi.waitFor(() =>
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cached"] }),
	)
	expect(listen).toHaveBeenCalledOnce()
	expect(unlisten).not.toHaveBeenCalled()
})

const isInvalidated = (
	queryClient: ReturnType<typeof createQueryClient>,
	queryKey: string[],
) => queryClient.getQueryState(queryKey)?.isInvalidated

it("invalidates the queries of the reconnected host only, but those that reread themselves", async () => {
	const queryClient = createQueryClient()
	const keys = {
		unnamed: ["plain"],
		ofGarage: ["runs", "routine-1", "garage"],
		inGarage: ["sections", "joined:garage", "space-1"],
		ofShed: ["runs", "routine-1", "shed"],
		inShed: ["sections", "joined:shed", "space-2"],
		local: ["runs", "routine-1", "local"],
		rereadItself: ["feed", "garage"],
	}
	for (const queryKey of Object.values(keys)) {
		await queryClient.prefetchQuery({
			queryKey,
			queryFn: () => 1,
			meta:
				queryKey === keys.rereadItself
					? { rendersErrorInline: true, rereadsItselfOnReconnect: true }
					: undefined,
		})
	}

	invalidateOnHostReconnect(queryClient)
	const [reconnected] = vi.mocked(onHostReconnected).mock.calls[0]
	reconnected("garage")

	expect(isInvalidated(queryClient, keys.unnamed)).toBe(true)
	expect(isInvalidated(queryClient, keys.ofGarage)).toBe(true)
	expect(isInvalidated(queryClient, keys.inGarage)).toBe(true)
	expect(isInvalidated(queryClient, keys.ofShed)).toBe(false)
	expect(isInvalidated(queryClient, keys.inShed)).toBe(false)
	expect(isInvalidated(queryClient, keys.local)).toBe(false)
	expect(isInvalidated(queryClient, keys.rereadItself)).toBe(false)
})
