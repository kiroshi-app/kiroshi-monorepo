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

vi.mock("@/lib/host", () => ({
	listen: vi.fn(),
	onHostReconnected: vi.fn(),
	joinedHosts: {
		getState: () => ({
			active: "garage",
			connections: { garage: { status: "up" }, shed: { status: "down" } },
		}),
	},
}))

afterEach(() => {
	cleanup()
	vi.mocked(listen).mockReset()
})

it("invalidates the given keys when the host event fires, and stops on unmount", async () => {
	const unlisten = vi.fn()
	vi.mocked(listen).mockResolvedValue(unlisten)
	const { queryClient, wrapper } = createQueryTestWrapper()
	const invalidate = vi.spyOn(queryClient, "invalidateQueries")

	const { unmount } = renderHook(
		() => useInvalidateOnHostEvent("bots://changed", [["bots", "a"], ["bots"]]),
		{ wrapper },
	)
	const [event, handler] = vi.mocked(listen).mock.calls[0]
	handler({ event, id: 1, payload: null }, null)

	expect(event).toBe("bots://changed")
	await vi.waitFor(() => {
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ["bots", "a"] })
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ["bots"] })
	})

	unmount()
	await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1))
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
