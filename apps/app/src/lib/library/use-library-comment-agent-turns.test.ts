// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { TurnAgent } from "./library-comment-turn-failures"
import { libraryQueryKeys } from "./library-query-keys"
import { useLibraryCommentAgentTurns } from "./use-library-comment-agent-turns"

import {
	LIBRARY_COMMENT_AGENT_TURNS_CHANGED_EVENT,
	type LibraryCommentAgentTurn,
	type LibraryCommentAgentTurnsChanged,
} from "../bindings"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

const host = vi.hoisted(() => ({
	invoke: vi.fn(),
	invokeOn: vi.fn(),
	listen: vi.fn(),
	raiseReportedFailure: vi.fn(),
}))

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	invoke: host.invoke,
	invokeOn: host.invokeOn,
	listen: host.listen,
}))

vi.mock("../failure-report", async (importOriginal) => ({
	...(await importOriginal<typeof import("../failure-report")>()),
	raiseReportedFailure: host.raiseReportedFailure,
}))

type Heard = (
	event: { payload: LibraryCommentAgentTurnsChanged },
	hostId: string | null,
) => void

type Mounting = {
	heldOnStart: LibraryCommentAgentTurn[]
	agents?: TurnAgent[]
	wrapping?: ReturnType<typeof createQueryTestWrapper>
	readsOnMount?: number
}

const SPACE_ID = "space-on-screen"
const OTHER_SPACE_ID = "space-off-screen"
const THREAD_ID = "thread-intro"
const ATLAS_ID = "bot-atlas"
const ATLAS: TurnAgent = { id: ATLAS_ID, name: "Atlas" }

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

const ATLAS_TURN_CHANGED: LibraryCommentAgentTurnsChanged = {
	spaceId: SPACE_ID,
	threadId: THREAD_ID,
	agentId: ATLAS_ID,
}

const NAMED_FAILURE =
	"Atlas couldn’t reply to the comment on plan. Mention it again to try again."

const turnsReadCount = () =>
	host.invoke.mock.calls.filter(
		([command]) => command === "library_comment_agent_turns",
	).length

const noticeTitles = () =>
	host.raiseReportedFailure.mock.calls.map(([notice]) => notice.title)

const holdingThePlanThread = () => {
	const wrapping = createQueryTestWrapper()
	wrapping.queryClient.setQueryData(
		libraryQueryKeys.commentThreadsOf(SPACE_ID, "plan.md"),
		[{ id: THREAD_ID, itemName: "plan.md" }],
	)
	wrapping.queryClient.setQueryData(libraryQueryKeys.itemsOf(SPACE_ID), [
		{ name: "plan.md", kind: "document" },
	])
	return wrapping
}

const mountTurns = async ({
	heldOnStart,
	agents = [ATLAS],
	wrapping = createQueryTestWrapper(),
	readsOnMount = 1,
}: Mounting) => {
	let hear: Heard = () => {}
	const unlisten = vi.fn()
	host.listen.mockImplementation((_event: string, heard: Heard) => {
		hear = heard
		return Promise.resolve(unlisten)
	})
	host.invoke.mockResolvedValue(heldOnStart)
	const readBefore = turnsReadCount()
	const hook = renderHook(() => useLibraryCommentAgentTurns(SPACE_ID, agents), {
		wrapper: wrapping.wrapper,
	})
	await waitFor(() => expect(turnsReadCount()).toBe(readBefore + readsOnMount))
	return {
		hook,
		unlisten,
		workingTurns: () => hook.result.current,
		hear: (changed: LibraryCommentAgentTurnsChanged, hostId: string | null) =>
			act(() => hear({ payload: changed }, hostId)),
		hearTurnsNow: async (held: LibraryCommentAgentTurn[]) => {
			host.invoke.mockResolvedValue(held)
			const rereadBefore = turnsReadCount()
			act(() => hear({ payload: ATLAS_TURN_CHANGED }, null))
			await waitFor(() => expect(turnsReadCount()).toBe(rereadBefore + 1))
		},
	}
}

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	vi.clearAllMocks()
})

describe("useLibraryCommentAgentTurns", () => {
	it("reads the turns of the Space and listens to their changes once", async () => {
		const { workingTurns } = await mountTurns({ heldOnStart: [] })

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
		const { workingTurns, hearTurnsNow } = await mountTurns({ heldOnStart: [] })

		await hearTurnsNow([ATLAS_WORKING])

		await waitFor(() => expect(workingTurns()).toEqual([ATLAS_WORKING]))
		expect(noticeTitles()).toEqual([])
	})

	it("drops the agent at work once its reply has landed, with no notice", async () => {
		const { workingTurns, hearTurnsNow } = await mountTurns({
			heldOnStart: [ATLAS_WORKING],
		})
		await waitFor(() => expect(workingTurns()).toEqual([ATLAS_WORKING]))

		await hearTurnsNow([])

		await waitFor(() => expect(workingTurns()).toEqual([]))
		expect(noticeTitles()).toEqual([])
	})

	it("drops the agent at work and names the agent and the item once its turn has failed", async () => {
		const { workingTurns, hearTurnsNow } = await mountTurns({
			heldOnStart: [ATLAS_WORKING],
			wrapping: holdingThePlanThread(),
		})
		await waitFor(() => expect(workingTurns()).toEqual([ATLAS_WORKING]))

		await hearTurnsNow([ATLAS_FAILED])

		await waitFor(() => expect(workingTurns()).toEqual([]))
		expect(noticeTitles()).toEqual([NAMED_FAILURE])
	})

	it("raises the notice of a turn failed after a quit once, whatever the rereads and remounts", async () => {
		const wrapping = holdingThePlanThread()
		const first = await mountTurns({ heldOnStart: [ATLAS_FAILED], wrapping })
		await waitFor(() => expect(noticeTitles()).toEqual([NAMED_FAILURE]))
		expect(first.workingTurns()).toEqual([])

		await first.hearTurnsNow([ATLAS_FAILED])
		first.hook.unmount()
		const second = await mountTurns({
			heldOnStart: [ATLAS_FAILED],
			wrapping,
			readsOnMount: 0,
		})
		await second.hearTurnsNow([ATLAS_FAILED])

		expect(noticeTitles()).toEqual([NAMED_FAILURE])
	})

	it("raises a second notice when the same agent fails again on the thread", async () => {
		const { hearTurnsNow } = await mountTurns({
			heldOnStart: [ATLAS_FAILED],
			wrapping: holdingThePlanThread(),
		})

		await hearTurnsNow([
			{
				...ATLAS_FAILED,
				state: { kind: "failed", reason: "noReply", failedAt: 9_000 },
			},
		])

		await waitFor(() =>
			expect(noticeTitles()).toEqual([NAMED_FAILURE, NAMED_FAILURE]),
		)
	})

	it("still raises the notice when neither the agent nor the item is known", async () => {
		await mountTurns({ heldOnStart: [ATLAS_FAILED], agents: [] })

		await waitFor(() =>
			expect(noticeTitles()).toEqual([
				"An agent couldn’t reply to a comment. Mention it again to try again.",
			]),
		)
	})

	it("raises no notice and logs the failure of a turn in a Space that is not on screen", async () => {
		const logged = vi.spyOn(console, "info").mockImplementation(() => undefined)
		const readOnHost = vi.fn().mockResolvedValue([ATLAS_FAILED])
		host.invokeOn.mockReturnValue(readOnHost)
		const { hear } = await mountTurns({ heldOnStart: [] })

		hear({ ...ATLAS_TURN_CHANGED, spaceId: OTHER_SPACE_ID }, "host-lena")

		await waitFor(() =>
			expect(logged).toHaveBeenCalledExactlyOnceWith(
				"library: the comment turn of agent bot-atlas on thread thread-intro failed in Space space-off-screen, which is not on screen",
			),
		)
		expect(host.invokeOn).toHaveBeenCalledExactlyOnceWith("host-lena")
		expect(readOnHost).toHaveBeenCalledExactlyOnceWith(
			"library_comment_agent_turns",
			{ spaceId: OTHER_SPACE_ID },
		)
		expect(turnsReadCount()).toBe(1)
		expect(noticeTitles()).toEqual([])
	})

	it("stops listening on unmount", async () => {
		const { hook, unlisten } = await mountTurns({ heldOnStart: [] })

		hook.unmount()

		await waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1))
	})

	it("raises a failure notice when the turns cannot be read", async () => {
		host.listen.mockResolvedValue(vi.fn())
		host.invoke.mockRejectedValue({ kind: "unknownSpace", id: SPACE_ID })
		renderHook(() => useLibraryCommentAgentTurns(SPACE_ID, [ATLAS]), {
			wrapper: createQueryTestWrapper().wrapper,
		})

		await waitFor(() =>
			expect(noticeTitles()).toEqual([
				"Couldn’t show which agents are working on comments. Open the item again from the Library.",
			]),
		)
	})
})
