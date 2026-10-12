import { afterEach, expect, it, vi } from "vitest"

import { liveSessions } from "./transport"

import { activeJoinedSpaceId, invoke } from "../host"

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
