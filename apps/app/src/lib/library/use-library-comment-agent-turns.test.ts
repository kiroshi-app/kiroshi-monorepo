// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useLibraryCommentAgentTurns } from "./use-library-comment-agent-turns"

import {
	LIBRARY_COMMENT_AGENT_TURNS_CHANGED_EVENT,
	type LibraryCommentAgentTurn,
} from "../bindings"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

const host = vi.hoisted(() => ({
	invoke: vi.fn(),
	listen: vi.fn(),
	raiseReportedFailure: vi.fn(),
}))

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	invoke: host.invoke,
	listen: host.listen,
}))

vi.mock("../failure-report", async (importOriginal) => ({
	...(await importOriginal<typeof import("../failure-report")>()),
	raiseReportedFailure: host.raiseReportedFailure,
}))

type Heard = (event: unknown, hostId: string | null) => void

const SPACE_ID = "space-on-screen"
const THREAD_ID = "thread-intro"
const ATLAS_ID = "bot-atlas"

const ATLAS_WORKING: LibraryCommentAgentTurn = {
	threadId: THREAD_ID,
	agentId: ATLAS_ID,
	state: { kind: "working" },
}

const ATLAS_FAILED: LibraryCommentAgentTurn = {
	threadId: THREAD_ID,
	agentId: ATLAS_ID,
	state: { kind: "failed", reason: "turnFailed", failedAt: 2_000 },
}

const turnsReadCount = () =>
	host.invoke.mock.calls.filter(
		([command]) => command === "library_comment_agent_turns",
	).length

const mountTurns = async (heldOnStart: LibraryCommentAgentTurn[]) => {
	let hear: Heard = () => {}
	const unlisten = vi.fn()
	host.listen.mockImplementation((_event: string, heard: Heard) => {
		hear = heard
		return Promise.resolve(unlisten)
	})
	host.invoke.mockResolvedValue(heldOnStart)
	const hook = renderHook(() => useLibraryCommentAgentTurns(SPACE_ID), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await waitFor(() => expect(turnsReadCount()).toBe(1))
	return {
		hook,
		unlisten,
		workingTurns: () => hook.result.current,
		hearTurnsNow: async (held: LibraryCommentAgentTurn[]) => {
			host.invoke.mockResolvedValue(held)
			const readBefore = turnsReadCount()
			act(() =>
				hear(
					{
						payload: {
							spaceId: SPACE_ID,
							threadId: THREAD_ID,
							agentId: ATLAS_ID,
						},
					},
					null,
				),
			)
			await waitFor(() => expect(turnsReadCount()).toBe(readBefore + 1))
		},
	}
}

afterEach(() => {
	cleanup()
	vi.clearAllMocks()
})

describe("useLibraryCommentAgentTurns", () => {
	it("reads the turns of the Space and listens to their changes once", async () => {
		const { workingTurns } = await mountTurns([])

		expect(workingTurns()).toEqual([])
		expect(host.invoke).toHaveBeenCalledWith("library_comment_agent_turns", {
			spaceId: SPACE_ID,
		})
		expect(host.listen).toHaveBeenCalledTimes(1)
		expect(host.listen).toHaveBeenCalledWith(
			LIBRARY_COMMENT_AGENT_TURNS_CHANGED_EVENT,
			expect.any(Function),
		)
	})

	it("holds the agent at work once its turn has started", async () => {
		const { workingTurns, hearTurnsNow } = await mountTurns([])

		await hearTurnsNow([ATLAS_WORKING])

		await waitFor(() => expect(workingTurns()).toEqual([ATLAS_WORKING]))
	})

	it("drops the agent at work once its reply has landed", async () => {
		const { workingTurns, hearTurnsNow } = await mountTurns([ATLAS_WORKING])
		await waitFor(() => expect(workingTurns()).toEqual([ATLAS_WORKING]))

		await hearTurnsNow([])

		await waitFor(() => expect(workingTurns()).toEqual([]))
	})

	it("drops the agent at work once its turn has failed", async () => {
		const { workingTurns, hearTurnsNow } = await mountTurns([ATLAS_WORKING])
		await waitFor(() => expect(workingTurns()).toEqual([ATLAS_WORKING]))

		await hearTurnsNow([ATLAS_FAILED])

		await waitFor(() => expect(workingTurns()).toEqual([]))
	})

	it("holds no agent at work when the app starts on a turn failed after a quit", async () => {
		const { hook, workingTurns } = await mountTurns([ATLAS_FAILED])

		hook.rerender()

		expect(workingTurns()).toEqual([])
	})

	it("stops listening on unmount", async () => {
		const { hook, unlisten } = await mountTurns([])

		hook.unmount()

		await waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1))
	})

	it("raises a failure notice when the turns cannot be read", async () => {
		host.listen.mockResolvedValue(vi.fn())
		host.invoke.mockRejectedValue({ kind: "unknownSpace", id: SPACE_ID })
		renderHook(() => useLibraryCommentAgentTurns(SPACE_ID), {
			wrapper: createQueryTestWrapper().wrapper,
		})

		await waitFor(() =>
			expect(
				host.raiseReportedFailure.mock.calls.map(([notice]) => notice.title),
			).toEqual([
				"Couldn’t show which agents are working on comments. Open the item again from the Library.",
			]),
		)
	})
})
