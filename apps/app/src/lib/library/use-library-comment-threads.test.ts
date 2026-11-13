// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useLibraryCommentThreads } from "./use-library-comment-threads"

import {
	LIBRARY_COMMENT_THREAD_CHANGED_EVENT,
	type LibraryCommentParty,
	type LibraryCommentThread,
	type LibraryCommentThreadChanged,
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

type Answer = {
	settle: (thread: LibraryCommentThread) => void
	refuse: () => void
}

type Heard = (event: { payload: LibraryCommentThreadChanged }) => void

const SPACE_ID = "space-on-screen"
const PLAN = "plan.md"
const NOTES = "notes.md"
const SELF: LibraryCommentParty = { kind: "person", id: "host" }
const LENA: LibraryCommentParty = { kind: "person", id: "account-lena" }
const ATLAS: LibraryCommentParty = { kind: "agent", id: "bot-atlas" }
const INTRO_BLOCK = { kind: "block", blockId: "intro1" } as const
const REFUSAL = { kind: "unknownThread", id: "thread-intro" }

const threadOf = (
	id: string,
	changes: Partial<LibraryCommentThread> = {},
): LibraryCommentThread => ({
	id,
	spaceId: SPACE_ID,
	itemName: PLAN,
	anchor: INTRO_BLOCK,
	state: "open",
	comments: [
		{
			author: LENA,
			createdAt: 1_000,
			text: "Is this still true?",
			mentions: [],
		},
	],
	targetMissing: false,
	...changes,
})

const INTRO_THREAD = threadOf("thread-intro")

const BUDGET_THREAD = threadOf("thread-budget", {
	anchor: { kind: "block", blockId: "budget" },
})

const answeredLater = (command: string): Answer => {
	let answer: Answer | undefined
	host.invoke.mockImplementation((asked: string) =>
		asked === command
			? new Promise((settle, refuse) => {
					answer = { settle, refuse: () => refuse(REFUSAL) }
				})
			: Promise.resolve([INTRO_THREAD, BUDGET_THREAD]),
	)
	return {
		settle: (thread) => answer?.settle(thread),
		refuse: () => answer?.refuse(),
	}
}

const mountThreads = async () => {
	let hear: Heard = () => {}
	host.listen.mockImplementation((_event: string, heard: Heard) => {
		hear = heard
		return Promise.resolve(vi.fn())
	})
	host.invoke.mockResolvedValue([INTRO_THREAD, BUDGET_THREAD])
	const hook = renderHook(
		() => useLibraryCommentThreads(SPACE_ID, PLAN, SELF),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
	await waitFor(() => expect(hook.result.current.hasLoaded).toBe(true))
	const threads = () => hook.result.current.threads
	return {
		hook,
		threads,
		threadOfId: (id: string) => threads().find((thread) => thread.id === id),
		textsOf: (id: string) =>
			threads()
				.find((thread) => thread.id === id)
				?.comments.map(({ text }) => text),
		hear: (thread: LibraryCommentThread, itemName = PLAN) =>
			act(() => hear({ payload: { spaceId: SPACE_ID, itemName, thread } })),
	}
}

const readCount = () =>
	host.invoke.mock.calls.filter(
		([command]) => command === "library_comment_threads",
	).length

const noticeTitles = () =>
	host.raiseReportedFailure.mock.calls.map(([notice]) => notice.title)

afterEach(() => {
	cleanup()
	vi.clearAllMocks()
})

describe("useLibraryCommentThreads", () => {
	it("loads the threads of the opened item", async () => {
		const { hook, threads } = await mountThreads()

		expect(threads()).toEqual([INTRO_THREAD, BUDGET_THREAD])
		expect(hook.result.current.hasFailedToLoad).toBe(false)
		expect(host.invoke).toHaveBeenCalledWith("library_comment_threads", {
			spaceId: SPACE_ID,
			name: PLAN,
		})
		expect(host.listen).toHaveBeenCalledWith(
			LIBRARY_COMMENT_THREAD_CHANGED_EVENT,
			expect.any(Function),
		)
	})

	it("raises a failure notice when the threads cannot be read", async () => {
		host.listen.mockResolvedValue(vi.fn())
		host.invoke.mockRejectedValue(REFUSAL)
		const hook = renderHook(
			() => useLibraryCommentThreads(SPACE_ID, PLAN, SELF),
			{ wrapper: createQueryTestWrapper().wrapper },
		)

		await waitFor(() => expect(hook.result.current.hasFailedToLoad).toBe(true))
		expect(hook.result.current.hasLoaded).toBe(false)
		expect(noticeTitles()).toEqual([
			"Couldn’t show the comments. Open the item again from the Library.",
		])
	})

	it("shows a sent comment at once, then the thread the host answers", async () => {
		const { hook, threads } = await mountThreads()
		const created = answeredLater("library_comment_create")
		const anchor = { kind: "block", blockId: "outro" } as const

		act(() =>
			hook.result.current.send(
				{ anchor, text: "Ship it @Atlas", mentions: [ATLAS] },
				vi.fn(),
			),
		)

		await waitFor(() => expect(threads()).toHaveLength(3))
		expect(threads()[2]).toMatchObject({
			anchor,
			state: "open",
			comments: [{ author: SELF, text: "Ship it @Atlas", mentions: [ATLAS] }],
		})
		expect(host.invoke).toHaveBeenCalledWith("library_comment_create", {
			spaceId: SPACE_ID,
			name: PLAN,
			anchor,
			text: "Ship it @Atlas",
			mentions: [ATLAS],
		})

		const answered = threadOf("thread-outro", { anchor })
		await act(async () => created.settle(answered))

		await waitFor(() =>
			expect(threads()).toEqual([INTRO_THREAD, BUDGET_THREAD, answered]),
		)
	})

	it("rolls a refused comment back and raises a failure notice", async () => {
		const { hook, threads } = await mountThreads()
		const created = answeredLater("library_comment_create")
		const keepTypedText = vi.fn()

		act(() =>
			hook.result.current.send(
				{ anchor: INTRO_BLOCK, text: "Ship it", mentions: [] },
				keepTypedText,
			),
		)
		await waitFor(() => expect(threads()).toHaveLength(3))
		await act(async () => created.refuse())

		await waitFor(() =>
			expect(threads()).toEqual([INTRO_THREAD, BUDGET_THREAD]),
		)
		expect(keepTypedText).toHaveBeenCalledOnce()
		expect(noticeTitles()).toEqual([
			"Couldn’t send the comment. Press Send to try again.",
		])
	})

	it("shows a reply at once and takes it back when the host refuses it", async () => {
		const { hook, textsOf } = await mountThreads()
		const replied = answeredLater("library_comment_reply")
		const keepTypedText = vi.fn()

		act(() =>
			hook.result.current.reply(
				{ threadId: INTRO_THREAD.id, text: "Yes, checked", mentions: [] },
				keepTypedText,
			),
		)
		await waitFor(() =>
			expect(textsOf(INTRO_THREAD.id)).toEqual([
				"Is this still true?",
				"Yes, checked",
			]),
		)
		await act(async () => replied.refuse())

		await waitFor(() =>
			expect(textsOf(INTRO_THREAD.id)).toEqual(["Is this still true?"]),
		)
		expect(keepTypedText).toHaveBeenCalledOnce()
		expect(noticeTitles()).toEqual([
			"Couldn’t send the reply. Press Send to try again.",
		])
	})

	it("updates a thread in place when the host announces its change", async () => {
		const { threads, hear } = await mountThreads()
		const resolvedElsewhere = threadOf(INTRO_THREAD.id, { state: "resolved" })
		const openedElsewhere = threadOf("thread-elsewhere")

		hear(resolvedElsewhere)
		hear(openedElsewhere)
		hear(threadOf("thread-of-notes", { itemName: NOTES }), NOTES)

		await waitFor(() =>
			expect(threads()).toEqual([
				resolvedElsewhere,
				BUDGET_THREAD,
				openedElsewhere,
			]),
		)
		expect(readCount()).toBe(1)
	})

	it("resolves a thread at once and keeps the host answer", async () => {
		const { hook, threadOfId } = await mountThreads()
		const resolved = answeredLater("library_comment_resolve")

		act(() => hook.result.current.resolve(INTRO_THREAD.id))
		await waitFor(() =>
			expect(threadOfId(INTRO_THREAD.id)?.state).toBe("resolved"),
		)
		expect(host.invoke).toHaveBeenCalledWith("library_comment_resolve", {
			spaceId: SPACE_ID,
			name: PLAN,
			threadId: INTRO_THREAD.id,
		})

		const answered = threadOf(INTRO_THREAD.id, { state: "resolved" })
		await act(async () => resolved.settle(answered))

		await waitFor(() => expect(threadOfId(INTRO_THREAD.id)).toEqual(answered))
		expect(noticeTitles()).toEqual([])
	})

	it("reopens a refused resolve and raises a failure notice", async () => {
		const { hook, threadOfId } = await mountThreads()
		const resolved = answeredLater("library_comment_resolve")

		act(() => hook.result.current.resolve(INTRO_THREAD.id))
		await waitFor(() =>
			expect(threadOfId(INTRO_THREAD.id)?.state).toBe("resolved"),
		)
		await act(async () => resolved.refuse())

		await waitFor(() => expect(threadOfId(INTRO_THREAD.id)?.state).toBe("open"))
		expect(noticeTitles()).toEqual([
			"Couldn’t resolve the comment. Press Resolve to try again.",
		])
	})

	it("reopens a resolved thread at once and resolves it back when refused", async () => {
		const { hook, threadOfId, hear } = await mountThreads()
		hear(threadOf(INTRO_THREAD.id, { state: "resolved" }))
		const reopened = answeredLater("library_comment_reopen")

		act(() => hook.result.current.reopen(INTRO_THREAD.id))
		await waitFor(() => expect(threadOfId(INTRO_THREAD.id)?.state).toBe("open"))
		expect(host.invoke).toHaveBeenCalledWith("library_comment_reopen", {
			spaceId: SPACE_ID,
			name: PLAN,
			threadId: INTRO_THREAD.id,
		})
		await act(async () => reopened.refuse())

		await waitFor(() =>
			expect(threadOfId(INTRO_THREAD.id)?.state).toBe("resolved"),
		)
		expect(noticeTitles()).toEqual([
			"Couldn’t reopen the comment. Press Reopen to try again.",
		])
	})
})
