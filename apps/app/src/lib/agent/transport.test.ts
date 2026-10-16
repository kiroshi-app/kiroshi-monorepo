import { afterEach, expect, it, vi } from "vitest"

import type { ScopedEvent } from "./contract"
import { agentTransport, liveSessions } from "./transport"

import { activeJoinedSpaceId, invoke, listen } from "../host"

vi.mock("../host", () => ({
	activeJoinedSpaceId: vi.fn(() => null),
	invoke: vi.fn(async () => []),
	listen: vi.fn(),
}))

afterEach(() => {
	vi.clearAllMocks()
})

it("reads the live sessions of this Mac while no joined space is active", async () => {
	await liveSessions()

	expect(invoke).toHaveBeenCalledWith("agent_live_sessions")
})

it("reads the live sessions of the active joined space on its host", async () => {
	vi.mocked(activeJoinedSpaceId).mockReturnValueOnce("garage")

	await liveSessions()

	expect(invoke).toHaveBeenCalledWith("agent_live_sessions_in_space", {
		spaceId: "garage",
	})
})

it("hands every agent event to its subscriber with the host it came from", async () => {
	const scoped: ScopedEvent = {
		scope: null,
		event: { type: "sessionReady", sessionId: "s-1", resumed: false },
	}
	const heard: [ScopedEvent, string | null | undefined][] = []
	vi.mocked(listen).mockImplementationOnce(async (_event, handler) => {
		handler({ event: "agent://event", id: 1, payload: scoped }, "host-1")
		return () => undefined
	})

	await agentTransport.subscribe((event, hostId) => heard.push([event, hostId]))

	expect(heard).toEqual([[scoped, "host-1"]])
})
