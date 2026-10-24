// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import type { ScopedEvent } from "./contract"
import { pendingQuestionsInSpace } from "./transport"
import { usePendingQuestions } from "./use-pending-questions"

import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("./transport", () => ({ pendingQuestionsInSpace: vi.fn() }))
vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(() => "notice-1"),
	raiseTransientNotice: vi.fn(),
}))

afterEach(() => {
	cleanup()
	vi.clearAllMocks()
})

const SPACE_OF_CONVERSATION: Record<string, string> = {
	"room-one": "home",
	"room-two": "home",
	"room-far": "work",
}

const roster = {
	hostSpaceIdOf: (spaceRowId: string) => `host-${spaceRowId}`,
	spaceOfConversation: (conversationId: string) =>
		SPACE_OF_CONVERSATION[conversationId],
}

const asked = (
	id: string,
	text: string,
	conversationId: string,
	botId = "atlas",
): ScopedEvent => ({
	scope: {
		conversationId,
		botId,
		runtimeSessionId: `${conversationId}-${botId}`,
		epoch: 1,
	},
	event: {
		type: "questionRequested",
		request: {
			id,
			questions: [
				{ header: "Pick", question: text, options: [], multiSelect: false },
			],
		},
	},
})

const resolved = (id: string): ScopedEvent => ({
	scope: null,
	event: { type: "permissionResolved", id, decision: "allowOnce" },
})

const turnEndedIn = (conversationId: string, botId = "atlas"): ScopedEvent => ({
	scope: {
		conversationId,
		botId,
		runtimeSessionId: `${conversationId}-${botId}`,
		epoch: 1,
	},
	event: {
		type: "turnEnded",
		ended: { sessionId: null, outcome: "completed" },
	},
})

const createFakeDriver = () => {
	const listeners = new Set<(scoped: ScopedEvent) => void>()
	return {
		subscribe: vi.fn(async (onEvent: (scoped: ScopedEvent) => void) => {
			listeners.add(onEvent)
			return () => {
				listeners.delete(onEvent)
			}
		}),
		emit: (scoped: ScopedEvent) =>
			act(() => {
				for (const listener of listeners) {
					listener(scoped)
				}
			}),
	}
}

const hostHolds = (bySpace: Record<string, ScopedEvent[]>) =>
	vi
		.mocked(pendingQuestionsInSpace)
		.mockImplementation(async (spaceId) => bySpace[spaceId] ?? [])

const renderQuestions = (spaceRowId: string | null = "home") => {
	const driver = createFakeDriver()
	const rendered = renderHook(
		({ spaceRowId }) => usePendingQuestions({ driver, roster, spaceRowId }),
		{ initialProps: { spaceRowId }, wrapper: createQueryTestWrapper().wrapper },
	)
	return { driver, ...rendered }
}

const listening = (driver: ReturnType<typeof createFakeDriver>) =>
	waitFor(() => expect(driver.subscribe).toHaveBeenCalled())

describe("usePendingQuestions", () => {
	it("fills from the questions the host holds for the opened space", async () => {
		hostHolds({ "host-home": [asked("q-1", "Which branch?", "room-one")] })

		const { result } = renderQuestions()

		await waitFor(() =>
			expect(result.current.byConversation).toEqual({
				"room-one": "Which branch?",
			}),
		)
		expect(result.current.byBot).toEqual({ atlas: "Which branch?" })
		expect(pendingQuestionsInSpace).toHaveBeenCalledWith("host-home")
	})

	it("adds a question asked in a conversation of the space", async () => {
		hostHolds({})
		const { driver, result } = renderQuestions()
		await listening(driver)
		await waitFor(() => expect(pendingQuestionsInSpace).toHaveBeenCalled())

		driver.emit(asked("q-1", "Deploy now?", "room-two", "beacon"))
		driver.emit(asked("q-2", "Which tag?", "room-far"))

		await waitFor(() =>
			expect(result.current.byConversation).toEqual({
				"room-two": "Deploy now?",
			}),
		)
		expect(result.current.byBot).toEqual({ beacon: "Deploy now?" })
	})

	it("removes a question once any member answers it", async () => {
		hostHolds({
			"host-home": [
				asked("q-1", "Which branch?", "room-one"),
				asked("q-2", "Deploy now?", "room-two", "beacon"),
			],
		})
		const { driver, result } = renderQuestions()
		await waitFor(() =>
			expect(Object.keys(result.current.byConversation)).toHaveLength(2),
		)

		driver.emit(resolved("q-1"))

		await waitFor(() =>
			expect(result.current.byConversation).toEqual({
				"room-two": "Deploy now?",
			}),
		)
		expect(result.current.byBot).toEqual({ beacon: "Deploy now?" })
	})

	it("removes the questions of a run whose turn ended", async () => {
		hostHolds({
			"host-home": [
				asked("q-1", "Which branch?", "room-one"),
				asked("q-2", "Deploy now?", "room-two", "beacon"),
			],
		})
		const { driver, result } = renderQuestions()
		await waitFor(() =>
			expect(Object.keys(result.current.byConversation)).toHaveLength(2),
		)

		driver.emit(turnEndedIn("room-one"))

		await waitFor(() =>
			expect(result.current.byConversation).toEqual({
				"room-two": "Deploy now?",
			}),
		)
	})

	it("rereads the space when an answer lands while the host is read", async () => {
		let answerFirstRead: (events: ScopedEvent[]) => void = () => undefined
		vi.mocked(pendingQuestionsInSpace)
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						answerFirstRead = resolve
					}),
			)
			.mockResolvedValueOnce([])
		const { driver, result } = renderQuestions()
		await listening(driver)

		driver.emit(resolved("q-1"))
		answerFirstRead([asked("q-1", "Which branch?", "room-one")])

		await waitFor(() =>
			expect(pendingQuestionsInSpace).toHaveBeenCalledTimes(2),
		)
		await waitFor(() => expect(result.current.byConversation).toEqual({}))
	})

	it("drops the questions of the previous space and refills from the new one", async () => {
		hostHolds({
			"host-home": [asked("q-1", "Which branch?", "room-one")],
			"host-work": [asked("q-9", "Which tag?", "room-far")],
		})
		const { result, rerender } = renderQuestions()
		await waitFor(() =>
			expect(result.current.byConversation).toEqual({
				"room-one": "Which branch?",
			}),
		)

		rerender({ spaceRowId: "work" })

		expect(result.current.byConversation).toEqual({})
		await waitFor(() =>
			expect(result.current.byConversation).toEqual({
				"room-far": "Which tag?",
			}),
		)
		expect(result.current.spaceRowId).toBe("work")
	})

	it("raises a failure notice and holds no question when the read fails", async () => {
		vi.mocked(pendingQuestionsInSpace).mockRejectedValue(new Error("offline"))

		const { result } = renderQuestions()

		await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalled())
		expect(result.current.byConversation).toEqual({})
		expect(result.current.byBot).toEqual({})
	})
})
