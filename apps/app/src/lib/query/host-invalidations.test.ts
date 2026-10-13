// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, renderHook } from "@testing-library/react"
import { createElement, type PropsWithChildren } from "react"
import { afterEach, expect, it, vi } from "vitest"

import {
	invalidateOnHostReconnect,
	useInvalidateOnHostEvent,
} from "./host-invalidations"
import { createQueryClient } from "./query-client"

import { listen, onHostReconnected } from "@/lib/host"

vi.mock("@/lib/host", () => ({ listen: vi.fn(), onHostReconnected: vi.fn() }))

afterEach(() => {
	cleanup()
	vi.mocked(listen).mockReset()
})

const providing = (queryClient: ReturnType<typeof createQueryClient>) => {
	const Wrapper = ({ children }: PropsWithChildren) =>
		createElement(QueryClientProvider, { client: queryClient }, children)
	return Wrapper
}

it("invalidates the given keys when the host event fires, and stops on unmount", async () => {
	const unlisten = vi.fn()
	vi.mocked(listen).mockResolvedValue(unlisten)
	const queryClient = createQueryClient()
	const invalidate = vi.spyOn(queryClient, "invalidateQueries")

	const { unmount } = renderHook(
		() => useInvalidateOnHostEvent("bots://changed", [["bots", "a"], ["bots"]]),
		{ wrapper: providing(queryClient) },
	)
	const [event, handler] = vi.mocked(listen).mock.calls[0]
	handler({ event, id: 1, payload: null })

	expect(event).toBe("bots://changed")
	expect(invalidate).toHaveBeenCalledWith({ queryKey: ["bots", "a"] })
	expect(invalidate).toHaveBeenCalledWith({ queryKey: ["bots"] })

	unmount()
	await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1))
})

it("invalidates every query when the host reconnects", () => {
	const queryClient = createQueryClient()
	const invalidate = vi.spyOn(queryClient, "invalidateQueries")

	invalidateOnHostReconnect(queryClient)
	const [reconnected] = vi.mocked(onHostReconnected).mock.calls[0]
	reconnected()

	expect(invalidate).toHaveBeenCalledWith()
})
