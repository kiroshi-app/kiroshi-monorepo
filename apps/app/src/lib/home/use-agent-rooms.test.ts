// @vitest-environment happy-dom

import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import { useAgentRooms } from "@/lib/home/use-agent-rooms"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseFailureNotice: vi.fn(() => "notice"),
}))

afterEach(() => {
	cleanup()
	vi.clearAllMocks()
})

describe("the agent rooms read", () => {
	it("names the failed read and how to retry when the host refuses it", async () => {
		const store = {
			agentRooms: () => Promise.reject(new Error("host gone")),
		}

		const rooms = renderHook(() => useAgentRooms(store, "space-a", "agent"), {
			wrapper: createQueryTestWrapper().wrapper,
		})

		await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledOnce())
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Couldn’t load this agent’s conversations",
				description: "Restart Kiroshi to retry.",
			}),
		)
		expect(rooms.result.current).toEqual([])
	})
})
