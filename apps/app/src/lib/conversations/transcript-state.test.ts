import { describe, expect, it } from "vitest"

import {
	type CompanionArrival,
	type TerminalCompletion,
	TRANSCRIPT_PAGE_SIZE,
	TRANSCRIPT_WINDOW_SIZE,
	type TranscriptCompletion,
	type TranscriptDraft,
	type TranscriptMessage,
	type TranscriptPage,
	type TranscriptWindow,
} from "./transcript-contract"
import {
	CONVERSATION,
	message,
	OTHER_CONVERSATION,
} from "./transcript-fixtures"
import {
	initialTranscriptState,
	isTerminalCompletion,
	lastWordIn,
	selectArrivals,
	selectHasMore,
	selectHasNewer,
	selectIsFirstLoadPending,
	selectMessages,
	selectOldestSeq,
	type TranscriptState,
	transcriptReducer,
} from "./transcript-state"

const page = (
	messages: TranscriptMessage[],
	hasMore = false,
	conversationId = CONVERSATION,
): TranscriptPage => ({ conversationId, messages, arrivals: [], hasMore })

const load = (
	state: TranscriptState,
	loaded: TranscriptPage,
): TranscriptState =>
	transcriptReducer(state, { type: "pageLoaded", page: loaded })

const append = (
	state: TranscriptState,
	draft: TranscriptDraft,
	isAtLiveEdge = true,
): TranscriptState =>
	transcriptReducer(state, { type: "messageAppended", draft, isAtLiveEdge })

const idsOf = (
	state: TranscriptState,
	conversationId = CONVERSATION,
): string[] => selectMessages(state, conversationId).map((entry) => entry.id)

const SEEDED = load(
	initialTranscriptState,
	page(
		[message({ id: "o-1", conversationId: OTHER_CONVERSATION })],
		true,
		OTHER_CONVERSATION,
	),
)

const expectOtherUntouched = (state: TranscriptState) => {
	expect(state.conversations[OTHER_CONVERSATION]).toBe(
		SEEDED.conversations[OTHER_CONVERSATION],
	)
}

const NOT_AN_ENDING = "pending" as TranscriptCompletion as TerminalCompletion

const streamingDraft = (id: string) => ({
	id,
	conversationId: CONVERSATION,
	turnId: "t-1",
	role: "assistant" as const,
	content: "",
	completion: "streaming" as const,
	createdAt: 0,
	authorBotId: null,
	authorAccountId: null,
	authorName: null,
	repliedToMessageId: null,
	runtimeSessionId: null,
})

describe("transcriptReducer", () => {
	it("orders a loaded page by seq, never by the timestamps it displays", () => {
		const state = load(
			initialTranscriptState,
			page([
				message({ id: "m-3", seq: 3, createdAt: 10 }),
				message({ id: "m-1", seq: 1, createdAt: 10 }),
				message({ id: "m-2", seq: 2, createdAt: 10 }),
			]),
		)

		expect(idsOf(state)).toEqual(["m-1", "m-2", "m-3"])
	})

	it("keeps a deterministic order when two messages claim the same seq", () => {
		const collided = [
			message({ id: "m-b", seq: 2, createdAt: 5 }),
			message({ id: "m-a", seq: 2, createdAt: 5 }),
		]

		expect(idsOf(load(initialTranscriptState, page(collided)))).toEqual([
			"m-a",
			"m-b",
		])
		expect(
			idsOf(load(initialTranscriptState, page([...collided].reverse()))),
		).toEqual(["m-a", "m-b"])
	})

	it("merges two overlapping pages without duplicating or reordering", () => {
		const tail = load(
			initialTranscriptState,
			page(
				[message({ id: "m-3", seq: 3 }), message({ id: "m-4", seq: 4 })],
				true,
			),
		)
		const older = load(
			tail,
			page([
				message({ id: "m-1", seq: 1 }),
				message({ id: "m-2", seq: 2 }),
				message({ id: "m-3", seq: 3 }),
			]),
		)

		expect(idsOf(older)).toEqual(["m-1", "m-2", "m-3", "m-4"])
		expect(selectHasMore(older, CONVERSATION)).toBe(false)
		expect(selectOldestSeq(older, CONVERSATION)).toBe(1)
	})

	it("re-reads the first page without duplicating or reopening exhausted history", () => {
		const tail = page([message({ id: "m-2", seq: 2 })], true)
		const loaded = load(load(initialTranscriptState, tail), page([]))
		const reloaded = load(loaded, tail)

		expect(idsOf(reloaded)).toEqual(["m-2"])
		expect(selectHasMore(loaded, CONVERSATION)).toBe(false)
		expect(selectHasMore(reloaded, CONVERSATION)).toBe(false)
	})

	it("returns the same state when a page carries nothing new", () => {
		const loaded = load(SEEDED, page([message({ id: "m-1", seq: 1 })]))
		const empty = load(loaded, page([]))

		expect(empty).toBe(loaded)
		expectOtherUntouched(empty)
	})

	it("reconciles an optimistic message with the durable row of the same id", () => {
		const appended = append(
			load(initialTranscriptState, page([message({ id: "m-1", seq: 1 })])),
			{
				id: "local-1",
				conversationId: CONVERSATION,
				turnId: "t-2",
				role: "user",
				content: "hello",
				completion: "pending",
				createdAt: 0,
				authorBotId: null,
				authorAccountId: null,
				authorName: null,
				repliedToMessageId: null,
				runtimeSessionId: null,
			},
		)
		expect(selectMessages(appended, CONVERSATION)[1]).toMatchObject({
			id: "local-1",
			seq: 2,
			completion: "pending",
		})

		const durable = load(
			appended,
			page([
				message({
					id: "local-1",
					seq: 7,
					role: "user",
					content: "hello",
					completion: "complete",
					turnId: "t-2",
					createdAt: 99,
				}),
			]),
		)

		expect(idsOf(durable)).toEqual(["m-1", "local-1"])
		expect(selectMessages(durable, CONVERSATION)[1]).toMatchObject({
			seq: 7,
			completion: "complete",
			createdAt: 99,
		})
	})

	it("ignores a second append of an id already on the transcript", () => {
		const draft = {
			id: "local-1",
			conversationId: CONVERSATION,
			turnId: "t-1",
			role: "user" as const,
			content: "hello",
			completion: "pending" as const,
			createdAt: 0,
			authorBotId: null,
			authorAccountId: null,
			authorName: null,
			repliedToMessageId: null,
			runtimeSessionId: null,
		}
		const appended = append(initialTranscriptState, draft)

		expect(append(appended, draft)).toBe(appended)
	})

	it("accumulates deltas while a message streams", () => {
		const streaming = append(initialTranscriptState, streamingDraft("m-1"))
		const streamed = ["Hello", " world"].reduce(
			(state, text) =>
				transcriptReducer(state, {
					type: "messageStreamed",
					delta: { conversationId: CONVERSATION, id: "m-1", text },
				}),
			streaming,
		)

		expect(selectMessages(streamed, CONVERSATION)[0].content).toBe(
			"Hello world",
		)
	})

	it("ignores a delta for an unknown conversation, an unknown message or a settled one", () => {
		const loaded = load(
			initialTranscriptState,
			page([message({ id: "m-1", seq: 1, completion: "streaming" })]),
		)
		const unknownConversation = transcriptReducer(loaded, {
			type: "messageStreamed",
			delta: { conversationId: OTHER_CONVERSATION, id: "m-1", text: "!" },
		})
		const unknownMessage = transcriptReducer(loaded, {
			type: "messageStreamed",
			delta: { conversationId: CONVERSATION, id: "m-9", text: "!" },
		})
		const settled = transcriptReducer(loaded, {
			type: "messageStreamed",
			delta: { conversationId: CONVERSATION, id: "m-1", text: "!" },
		})

		expect(unknownConversation).toBe(loaded)
		expect(unknownMessage).toBe(loaded)
		expect(settled).toBe(loaded)
	})

	it("brings a message the port still reports as streaming back as interrupted", () => {
		const state = load(
			initialTranscriptState,
			page([
				message({
					id: "m-1",
					seq: 1,
					content: "half",
					completion: "streaming",
				}),
			]),
		)

		expect(selectMessages(state, CONVERSATION)[0]).toMatchObject({
			content: "half",
			completion: "interrupted",
		})
	})

	it("settles a streaming message once and never again", () => {
		const streaming = load(
			SEEDED,
			page([message({ id: "m-1", seq: 1, completion: "pending" })]),
		)
		const cancelled = transcriptReducer(streaming, {
			type: "messageSettled",
			settlement: {
				conversationId: CONVERSATION,
				id: "m-1",
				completion: "cancelled",
			},
		})
		const late = transcriptReducer(cancelled, {
			type: "messageSettled",
			settlement: {
				conversationId: CONVERSATION,
				id: "m-1",
				completion: "complete",
			},
		})

		expect(selectMessages(cancelled, CONVERSATION)[0].completion).toBe(
			"cancelled",
		)
		expect(late).toBe(cancelled)
		expectOtherUntouched(late)
	})

	it("keeps the ending it settled on when a page carries another one", () => {
		const cancelled = transcriptReducer(
			load(
				SEEDED,
				page([
					message({
						id: "m-1",
						seq: 1,
						content: "Hello",
						completion: "pending",
					}),
				]),
			),
			{
				type: "messageSettled",
				settlement: {
					conversationId: CONVERSATION,
					id: "m-1",
					completion: "cancelled",
				},
			},
		)
		const contested = load(
			cancelled,
			page([
				message({
					id: "m-1",
					seq: 1,
					content: "Hello world",
					completion: "complete",
				}),
			]),
		)

		expect(selectMessages(contested, CONVERSATION)[0]).toMatchObject({
			content: "Hello",
			completion: "cancelled",
		})
		expectOtherUntouched(contested)
	})

	it("keeps every settled outcome against a page that disagrees", () => {
		const settled = load(
			SEEDED,
			page([
				message({ id: "m-f", seq: 1, content: "half", completion: "failed" }),
				message({ id: "m-c", seq: 2, content: "done", completion: "complete" }),
			]),
		)
		const contested = load(
			settled,
			page([
				message({
					id: "m-f",
					seq: 1,
					content: "recovered",
					completion: "interrupted",
				}),
				message({ id: "m-c", seq: 2, content: "lost", completion: "failed" }),
			]),
		)

		expect(selectMessages(contested, CONVERSATION)[0]).toMatchObject({
			content: "half",
			completion: "failed",
		})
		expect(selectMessages(contested, CONVERSATION)[1]).toMatchObject({
			content: "done",
			completion: "complete",
		})
		expectOtherUntouched(contested)
	})

	it("takes the stored text when a page replays the ending a message already has", () => {
		const replayed = page([
			message({ id: "m-1", seq: 1, content: "Hello world" }),
		])
		const local = load(
			SEEDED,
			page([message({ id: "m-1", seq: 1, content: "Hello" })]),
		)
		const adopted = load(local, replayed)
		const again = load(adopted, replayed)

		expect(selectMessages(adopted, CONVERSATION)[0]).toMatchObject({
			content: "Hello world",
			completion: "complete",
		})
		expect(selectMessages(again, CONVERSATION)).toEqual(
			selectMessages(adopted, CONVERSATION),
		)
		expectOtherUntouched(again)
	})

	it("ignores a settlement repeating the ending a message already has", () => {
		const complete = transcriptReducer(
			load(
				SEEDED,
				page([message({ id: "m-1", seq: 1, completion: "pending" })]),
			),
			{
				type: "messageSettled",
				settlement: {
					conversationId: CONVERSATION,
					id: "m-1",
					completion: "complete",
				},
			},
		)
		const again = transcriptReducer(complete, {
			type: "messageSettled",
			settlement: {
				conversationId: CONVERSATION,
				id: "m-1",
				completion: "complete",
			},
		})

		expect(again).toBe(complete)
		expectOtherUntouched(again)
	})

	it("ignores a settlement to a state that is not an ending", () => {
		const streaming = append(SEEDED, streamingDraft("m-1"))
		const settled = transcriptReducer(streaming, {
			type: "messageSettled",
			settlement: {
				conversationId: CONVERSATION,
				id: "m-1",
				completion: NOT_AN_ENDING,
			},
		})

		expect(settled).toBe(streaming)
		expect(selectMessages(settled, CONVERSATION)[0].completion).toBe(
			"streaming",
		)
		expectOtherUntouched(settled)
	})

	it("keeps a live stream ahead of the durable row a page brings back late", () => {
		const streaming = append(SEEDED, streamingDraft("a-1"))
		const streamed = transcriptReducer(streaming, {
			type: "messageStreamed",
			delta: { conversationId: CONVERSATION, id: "a-1", text: "Hello" },
		})
		const stale = load(
			streamed,
			page([
				message({ id: "a-1", seq: 4, content: "", completion: "streaming" }),
			]),
		)

		expect(selectMessages(stale, CONVERSATION)[0]).toMatchObject({
			seq: 4,
			content: "Hello",
			completion: "streaming",
		})
		expectOtherUntouched(stale)

		const settled = load(
			stale,
			page([
				message({
					id: "a-1",
					seq: 4,
					content: "Hello world",
					completion: "complete",
				}),
			]),
		)

		expect(idsOf(settled)).toEqual(["a-1"])
		expect(selectMessages(settled, CONVERSATION)[0]).toMatchObject({
			content: "Hello world",
			completion: "complete",
		})
		expectOtherUntouched(settled)
	})

	it("never demotes a message a page still reports as unfinished", () => {
		const complete = load(
			SEEDED,
			page([message({ id: "m-1", seq: 1, content: "Hello world" })]),
		)
		const behind = load(
			complete,
			page([
				message({ id: "m-1", seq: 1, content: "", completion: "pending" }),
			]),
		)

		expect(selectMessages(behind, CONVERSATION)[0]).toMatchObject({
			content: "Hello world",
			completion: "complete",
		})
		expectOtherUntouched(behind)
	})

	it("merges an overlapping page whose messages all share one timestamp", () => {
		const at = (id: string, seq: number): TranscriptMessage =>
			message({ id, seq, createdAt: 7 })
		const tail = load(
			SEEDED,
			page([at("m-b", 2), at("m-a", 2), at("m-c", 3)], true),
		)
		const older = load(tail, page([at("m-1", 1), at("m-b", 2), at("m-a", 2)]))

		expect(idsOf(older)).toEqual(["m-1", "m-a", "m-b", "m-c"])
		expectOtherUntouched(older)
	})

	it("leaves every other conversation byte-identical", () => {
		const both = load(
			SEEDED,
			page([message({ id: "m-1", seq: 1 }), message({ id: "m-2", seq: 2 })]),
		)
		const streamed = append(both, streamingDraft("m-3"))

		expect(idsOf(streamed)).toEqual(["m-1", "m-2", "m-3"])
		expect(idsOf(streamed, OTHER_CONVERSATION)).toEqual(["o-1"])
		expectOtherUntouched(streamed)
		expect(selectHasMore(streamed, OTHER_CONVERSATION)).toBe(true)
	})
})

describe("transcript selectors", () => {
	it("answers for a conversation nothing has ever loaded", () => {
		expect(selectMessages(initialTranscriptState, CONVERSATION)).toEqual([])
		expect(selectHasMore(initialTranscriptState, CONVERSATION)).toBe(false)
		expect(selectOldestSeq(initialTranscriptState, CONVERSATION)).toBeNull()
	})

	it("treats every ending as terminal and nothing else", () => {
		expect(isTerminalCompletion("complete")).toBe(true)
		expect(isTerminalCompletion("cancelled")).toBe(true)
		expect(isTerminalCompletion("failed")).toBe(true)
		expect(isTerminalCompletion("interrupted")).toBe(true)
		expect(isTerminalCompletion("pending")).toBe(false)
		expect(isTerminalCompletion("streaming")).toBe(false)
	})
})

describe("lastWordIn", () => {
	const settled = (
		overrides: Partial<TranscriptMessage> = {},
	): TranscriptMessage => message({ completion: "complete", ...overrides })

	it("has nothing to show for a conversation nobody has spoken in", () => {
		expect(lastWordIn([])).toBeUndefined()
	})

	it("takes the last word whoever said it, and when it was said", () => {
		expect(
			lastWordIn([
				settled({ id: "a", content: "Done", createdAt: 10 }),
				settled({ id: "b", role: "user", content: "And?", createdAt: 20 }),
			]),
		).toEqual({ text: "And?", at: 20 })
	})

	it("carries the companion that said the last word, and nobody for the reader", () => {
		expect(
			lastWordIn([
				settled({ content: "Done", createdAt: 10, authorBotId: "b-1" }),
			]),
		).toEqual({ text: "Done", at: 10, authorBotId: "b-1" })
		expect(
			lastWordIn([settled({ role: "user", content: "And?", createdAt: 20 })]),
		).toEqual({ text: "And?", at: 20, authorBotId: undefined })
	})

	it("keeps the newest message, not the one before it", () => {
		expect(
			lastWordIn([
				settled({ id: "a", content: "First", createdAt: 10 }),
				settled({ id: "b", content: "Second", createdAt: 20 }),
			]),
		).toEqual({ text: "Second", at: 20 })
	})

	it("holds the last settled message while the next one streams", () => {
		expect(
			lastWordIn([
				settled({ id: "a", content: "Done", createdAt: 10 }),
				message({
					id: "b",
					content: "Still wri",
					completion: "streaming",
					createdAt: 20,
				}),
			]),
		).toEqual({ text: "Done", at: 10 })
		expect(
			lastWordIn([
				message({ id: "a", content: "Wri", completion: "streaming" }),
			]),
		).toBeUndefined()
	})

	it("reads a turn that stopped short as settled", () => {
		expect(
			lastWordIn([
				settled({ content: "Half", completion: "cancelled", createdAt: 30 }),
			]),
		).toEqual({ text: "Half", at: 30 })
	})

	it("dates a message that ended without saying anything", () => {
		expect(
			lastWordIn([
				settled({ content: "  ", completion: "failed", createdAt: 40 }),
			]),
		).toEqual({ text: undefined, at: 40 })
	})
})

describe("the transcript window", () => {
	const landing = (overrides: Partial<TranscriptDraft> = {}) => ({
		...streamingDraft("live"),
		turnId: "t-live",
		...overrides,
	})

	const full = load(
		initialTranscriptState,
		page(
			Array.from({ length: TRANSCRIPT_WINDOW_SIZE }, (_, index) =>
				message({ id: `m-${index + 1}`, seq: index + 1 }),
			),
		),
	)

	const sayEach = (state: TranscriptState, drafts: TranscriptDraft[]) =>
		drafts.reduce((held, draft) => append(held, draft), state)

	it("drops the oldest messages down to the window when one lands at the live edge", () => {
		const held = append(full, landing())

		expect(selectMessages(held, CONVERSATION)).toHaveLength(
			TRANSCRIPT_WINDOW_SIZE,
		)
		expect(idsOf(held)).toContain("live")
		expect(idsOf(held)).not.toContain("m-1")
		expect(selectHasMore(held, CONVERSATION)).toBe(true)
	})

	it("drops nothing while the reader sits away from the live edge", () => {
		const held = append(full, landing(), false)

		expect(selectMessages(held, CONVERSATION)).toHaveLength(
			TRANSCRIPT_WINDOW_SIZE + 1,
		)
		expect(idsOf(held)).toContain("m-1")
		expect(selectHasMore(held, CONVERSATION)).toBe(false)
	})

	it("keeps the message still being streamed", () => {
		const held = sayEach(
			append(full, landing()),
			Array.from({ length: TRANSCRIPT_WINDOW_SIZE }, (_, index) =>
				landing({ id: `later-${index}`, turnId: `t-${index}` }),
			),
		)

		expect(idsOf(held)).toContain("live")
	})

	it("keeps the messages of the turn that is running", () => {
		const held = sayEach(
			full,
			Array.from({ length: TRANSCRIPT_WINDOW_SIZE }, (_, index) =>
				landing({ id: `live-${index}`, completion: "complete" }),
			),
		)

		expect(idsOf(held)).toContain("live-0")
		expect(idsOf(held)).not.toContain("m-1")
	})
})

describe("leaving a thread", () => {
	const OVERFLOW = 3

	const leave = (state: TranscriptState, conversationId = CONVERSATION) =>
		transcriptReducer(state, { type: "threadLeft", conversationId })

	const settledDraft = (id: string): TranscriptDraft => ({
		...streamingDraft(id),
		completion: "complete",
	})

	const saidOffTheLiveEdge = (drafts: TranscriptDraft[]) =>
		drafts.reduce((state, draft) => append(state, draft, false), SEEDED)

	const grown = saidOffTheLiveEdge(
		Array.from({ length: TRANSCRIPT_PAGE_SIZE + OVERFLOW }, (_, index) =>
			settledDraft(`m-${index + 1}`),
		),
	)

	it("drops everything the reader loaded above one page", () => {
		const left = leave(grown)

		expect(selectMessages(left, CONVERSATION)).toHaveLength(
			TRANSCRIPT_PAGE_SIZE,
		)
		expect(idsOf(left)).not.toContain(`m-${OVERFLOW}`)
		expect(idsOf(left)).toContain(`m-${OVERFLOW + 1}`)
	})

	it("reports older messages to load for what it dropped", () => {
		expect(selectHasMore(grown, CONVERSATION)).toBe(false)
		expect(selectHasMore(leave(grown), CONVERSATION)).toBe(true)
	})

	it("holds a thread that never grew past one page", () => {
		const short = saidOffTheLiveEdge([settledDraft("m-1")])

		expect(leave(short)).toBe(short)
	})

	it("holds a message that has not settled, and everything after it", () => {
		const streaming = saidOffTheLiveEdge([
			settledDraft("m-1"),
			streamingDraft("live"),
			...Array.from({ length: TRANSCRIPT_PAGE_SIZE + OVERFLOW }, (_, index) =>
				settledDraft(`m-${index + 2}`),
			),
		])

		const left = leave(streaming)

		expect(idsOf(left)).not.toContain("m-1")
		expect(idsOf(left)).toContain("live")
		expect(selectMessages(left, CONVERSATION)).toHaveLength(
			TRANSCRIPT_PAGE_SIZE + OVERFLOW + 1,
		)
	})

	it("leaves every other conversation untouched", () => {
		expectOtherUntouched(leave(grown))
	})

	it("holds a conversation nothing has ever loaded", () => {
		expect(leave(SEEDED, "c-unknown")).toBe(SEEDED)
	})
})
describe("leaving a thread away from its newest end", () => {
	const landed = transcriptReducer(SEEDED, {
		type: "windowLanded",
		window: {
			conversationId: CONVERSATION,
			messages: [message({ id: "m-40", seq: 40 })],
			arrivals: [],
			hasOlder: true,
			hasNewer: true,
		},
	})

	const left = transcriptReducer(landed, {
		type: "threadLeft",
		conversationId: CONVERSATION,
	})

	it("forgets the window it read and still reports older messages", () => {
		expect(selectMessages(left, CONVERSATION)).toEqual([])
		expect(selectHasMore(left, CONVERSATION)).toBe(true)
		expect(selectHasNewer(left, CONVERSATION)).toBe(false)
	})

	it("ignores a message appended onto the window it forgot", () => {
		expect(append(left, streamingDraft("live"))).toBe(left)
	})

	it("reads a newest page onto the window it forgot", () => {
		const reopened = load(left, page([message({ id: "m-80", seq: 80 })], true))

		expect(idsOf(reopened)).toEqual(["m-80"])
		expect(selectHasMore(reopened, CONVERSATION)).toBe(true)
	})
})

describe("the arrivals a conversation holds", () => {
	const arrivalOf = (
		id: string,
		lastMessageSeq: number,
		createdAt = 0,
	): CompanionArrival => ({
		id,
		conversationId: CONVERSATION,
		botId: "bot-2",
		invitedByBotId: null,
		lastMessageSeq,
		createdAt,
	})

	const pageWith = (
		messages: TranscriptMessage[],
		arrivals: CompanionArrival[],
		hasMore = false,
	): TranscriptPage => ({
		conversationId: CONVERSATION,
		messages,
		arrivals,
		hasMore,
	})

	const windowWith = (
		messages: TranscriptMessage[],
		arrivals: CompanionArrival[],
		hasNewer = false,
	): TranscriptWindow => ({
		conversationId: CONVERSATION,
		messages,
		arrivals,
		hasOlder: true,
		hasNewer,
	})

	const arrivalIdsOf = (state: TranscriptState): string[] =>
		selectArrivals(state, CONVERSATION).map(({ id }) => id)

	const announce = (state: TranscriptState, arrival: CompanionArrival) =>
		transcriptReducer(state, { type: "arrivalAnnounced", arrival })

	const HELD = load(
		initialTranscriptState,
		pageWith([message({ id: "m-5", seq: 5 })], [arrivalOf("a-5", 5)], true),
	)

	it("merges the arrivals of an older page by arrival id", () => {
		const moved = { ...arrivalOf("a-5", 5), createdAt: 9 }
		const merged = load(
			HELD,
			pageWith([message({ id: "m-2", seq: 2 })], [arrivalOf("a-2", 2), moved]),
		)

		expect(arrivalIdsOf(merged)).toEqual(["a-2", "a-5"])
		expect(selectArrivals(merged, CONVERSATION)[1]).toEqual(moved)
	})

	it("holds the arrivals of a page carrying no message", () => {
		const merged = load(
			initialTranscriptState,
			pageWith([], [arrivalOf("a-0", 0)]),
		)

		expect(arrivalIdsOf(merged)).toEqual(["a-0"])
	})

	it("merges the arrivals of a newer window", () => {
		const landed = transcriptReducer(initialTranscriptState, {
			type: "windowLanded",
			window: windowWith([message({ id: "m-5", seq: 5 })], [], true),
		})
		const newer = transcriptReducer(landed, {
			type: "newerLoaded",
			window: windowWith(
				[message({ id: "m-6", seq: 6 })],
				[arrivalOf("a-6", 6)],
			),
		})

		expect(arrivalIdsOf(newer)).toEqual(["a-6"])
	})

	it("replaces the arrivals it holds with those of a landed window", () => {
		const landed = transcriptReducer(HELD, {
			type: "windowLanded",
			window: windowWith(
				[message({ id: "m-40", seq: 40 })],
				[arrivalOf("a-40", 40)],
				true,
			),
		})

		expect(arrivalIdsOf(landed)).toEqual(["a-40"])
	})

	it("replaces the arrivals it holds with those of the newest page", () => {
		const latest = transcriptReducer(HELD, {
			type: "latestLoaded",
			page: pageWith([message({ id: "m-9", seq: 9 })], []),
		})

		expect(arrivalIdsOf(latest)).toEqual([])
	})

	it("orders arrivals by the message they follow, then by date, then by id", () => {
		const held = load(
			initialTranscriptState,
			pageWith(
				[message({ id: "m-1", seq: 1 })],
				[
					arrivalOf("c", 3, 1),
					arrivalOf("b", 2, 5),
					arrivalOf("z", 2, 4),
					arrivalOf("a", 2, 4),
				],
			),
		)

		expect(arrivalIdsOf(held)).toEqual(["a", "z", "b", "c"])
	})

	it("holds an announced arrival as a read one, once per arrival id", () => {
		const announced = announce(HELD, arrivalOf("a-4", 4))

		expect(arrivalIdsOf(announced)).toEqual(["a-4", "a-5"])
		expect(announce(announced, arrivalOf("a-4", 4))).toBe(announced)
	})

	it("ignores an announced arrival away from the newest message", () => {
		const landed = transcriptReducer(HELD, {
			type: "windowLanded",
			window: windowWith([message({ id: "m-40", seq: 40 })], [], true),
		})

		expect(announce(landed, arrivalOf("a-99", 99))).toBe(landed)
	})

	it("keeps an arrival below the oldest message when an append drops nothing", () => {
		const held = load(
			initialTranscriptState,
			pageWith([message({ id: "m-1", seq: 1 })], [arrivalOf("a-0", 0)]),
		)

		const grown = append(held, streamingDraft("live"))

		expect(selectMessages(grown, CONVERSATION)).toHaveLength(2)
		expect(arrivalIdsOf(grown)).toEqual(["a-0"])
	})

	it("still holds a companion invited into an empty conversation once a message is appended", () => {
		const invited = announce(initialTranscriptState, arrivalOf("a-0", 0))

		const grown = append(invited, streamingDraft("live"))

		expect(idsOf(grown)).toEqual(["live"])
		expect(arrivalIdsOf(grown)).toEqual(["a-0"])
	})

	it("drops the arrivals below the oldest message kept when the head is trimmed", () => {
		const history = Array.from({ length: TRANSCRIPT_WINDOW_SIZE }, (_, index) =>
			message({ id: `m-${index + 1}`, seq: index + 1, turnId: `t-${index}` }),
		)
		const full = load(
			initialTranscriptState,
			pageWith(history, [arrivalOf("a-1", 1), arrivalOf("a-2", 2)]),
		)

		const grown = append(full, streamingDraft("live"))

		expect(selectOldestSeq(grown, CONVERSATION)).toBe(2)
		expect(arrivalIdsOf(grown)).toEqual(["a-2"])
	})

	it("drops the arrivals below the oldest message kept when the reader leaves", () => {
		const history = Array.from(
			{ length: TRANSCRIPT_PAGE_SIZE + 5 },
			(_, index) => message({ id: `m-${index + 1}`, seq: index + 1 }),
		)
		const held = load(
			initialTranscriptState,
			pageWith(history, [arrivalOf("a-0", 0), arrivalOf("a-6", 6)]),
		)

		const left = transcriptReducer(held, {
			type: "threadLeft",
			conversationId: CONVERSATION,
		})

		expect(arrivalIdsOf(left)).toEqual(["a-6"])
	})
})

describe("the first page of a conversation", () => {
	const isPending = (state: TranscriptState) =>
		selectIsFirstLoadPending(state, CONVERSATION)

	it("waits for a conversation nothing has answered for yet", () => {
		expect(isPending(initialTranscriptState)).toBe(true)
	})

	it("ends once a page with no message answers", () => {
		expect(isPending(load(initialTranscriptState, page([])))).toBe(false)
	})

	it("ends once a page with messages answers", () => {
		expect(isPending(load(initialTranscriptState, page([message()])))).toBe(
			false,
		)
	})

	it("ends once the read of that page fails", () => {
		const failed = transcriptReducer(initialTranscriptState, {
			type: "firstPageFailed",
			conversationId: CONVERSATION,
		})

		expect(isPending(failed)).toBe(false)
		expect(selectMessages(failed, CONVERSATION)).toEqual([])
	})

	it("ends once a landed window answers first", () => {
		const landed = transcriptReducer(initialTranscriptState, {
			type: "windowLanded",
			window: {
				conversationId: CONVERSATION,
				messages: [message({ id: "m-40", seq: 40 })],
				arrivals: [],
				hasOlder: true,
				hasNewer: true,
			},
		})

		expect(isPending(landed)).toBe(false)
	})

	it("keeps waiting while a message is appended before the page answers", () => {
		const appended = append(initialTranscriptState, streamingDraft("live"))

		expect(isPending(appended)).toBe(true)
		expect(idsOf(appended)).toEqual(["live"])
	})

	it("waits for one conversation whatever the page of another does", () => {
		expect(isPending(SEEDED)).toBe(true)
		expect(selectIsFirstLoadPending(SEEDED, OTHER_CONVERSATION)).toBe(false)
	})

	it("does not wait again for a conversation left with its messages", () => {
		const left = transcriptReducer(load(SEEDED, page([message()])), {
			type: "threadLeft",
			conversationId: CONVERSATION,
		})

		expect(isPending(left)).toBe(false)
	})

	it("waits again for a conversation whose landed window was forgotten", () => {
		const landed = transcriptReducer(SEEDED, {
			type: "windowLanded",
			window: {
				conversationId: CONVERSATION,
				messages: [message({ id: "m-40", seq: 40 })],
				arrivals: [],
				hasOlder: true,
				hasNewer: true,
			},
		})
		const left = transcriptReducer(landed, {
			type: "threadLeft",
			conversationId: CONVERSATION,
		})

		expect(isPending(left)).toBe(true)
	})
})
