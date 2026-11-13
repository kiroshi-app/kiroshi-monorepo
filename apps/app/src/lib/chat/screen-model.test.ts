import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import { promptWithAttachments } from "./attachments"
import { type ChatState, initialChatState } from "./chat-state"
import { storedAttachmentPath } from "./message-attachments"
import {
	claimsComposerFocus,
	emptyStateStatusFor,
	markedRunsOf,
	needsFreshSession,
	noticeTitleFor,
	opensNewDay,
	quotedMessageIdsIn,
	quotedTargetsIn,
	repliesBeingWrittenIn,
	replyTargetOfReference,
	runPresentationsOf,
	sidebarActivityFor,
	type TranscriptRow,
	toRuns,
	toTranscriptRows,
	workingStateFor,
} from "./screen-model"

import type { ActivityEvent, TransportError } from "../agent/contract"
import type {
	TranscriptCompletion,
	TranscriptMessage,
} from "../conversations/transcript-contract"
import { message as storedMessage } from "../conversations/transcript-fixtures"

const t = i18n.getFixedT(null, "chat")

const ATTACHMENT = storedAttachmentPath({
	root: "/tmp/kiroshi",
	conversationId: "c-1",
	submittedName: "shot.png",
})

function activity(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
	return {
		id: "act-1",
		title: "Bash · npm test",
		kind: "tool",
		status: "running",
		...overrides,
	}
}

function message(
	overrides: Partial<TranscriptMessage> = {},
): TranscriptMessage {
	return storedMessage({ id: "msg-1", completion: "streaming", ...overrides })
}

function prompt(overrides: Partial<TranscriptMessage> = {}): TranscriptMessage {
	return message({
		role: "user",
		content: "And?",
		completion: "complete",
		...overrides,
	})
}

function bubbles(
	content: string,
	completion: TranscriptCompletion = "complete",
): string[] {
	return toTranscriptRows([message({ content, completion })]).map(
		(row) => row.text,
	)
}

function chatState(overrides: Partial<ChatState> = {}): ChatState {
	return { ...initialChatState, turn: "running", ...overrides }
}

describe("toTranscriptRows", () => {
	it("renders a whole answer of paragraphs, a list and code as one bubble", () => {
		const answer =
			"Intro.\n\n- one\n\n- two\n\n```ts\nconst a = 1\n\nconst b = 2\n```\n\nDone."

		expect(bubbles(answer)).toEqual([answer])
	})

	it("grows a streaming answer inside its single bubble", () => {
		const rows = toTranscriptRows([
			message({ content: "First paragraph.\n\nSecond one, still bei" }),
		])

		expect(rows.map((row) => row.text)).toEqual([
			"First paragraph.\n\nSecond one, still bei",
		])
		expect(rows[0].completion).toBe("streaming")
	})

	it("shows a streaming answer from its first character", () => {
		expect(bubbles("I", "streaming")).toEqual(["I"])
		expect(bubbles("\n", "streaming")).toEqual([])
	})

	it("hands back the same rows for a message that has not moved", () => {
		const settled = message({
			id: "a",
			content: "One.",
			completion: "complete",
		})
		const live = message({ id: "b", content: "Two.\n\n" })

		const first = toTranscriptRows([settled, live])
		const second = toTranscriptRows([
			settled,
			{ ...live, content: "Two.\n\nThr" },
		])

		expect(second[0]).toBe(first[0])
	})

	it("drops the trailing blank lines of an answer", () => {
		expect(bubbles("One.\n\nTwo.\n\n")).toEqual(["One.\n\nTwo."])
	})

	it("carries how the turn ended on its bubble", () => {
		const rows = toTranscriptRows([
			message({
				content: "Half an answer.\n\nStopped here.",
				completion: "cancelled",
			}),
		])

		expect(rows.map((row) => row.completion)).toEqual(["cancelled"])
		expect(rows.map((row) => row.text)).toEqual([
			"Half an answer.\n\nStopped here.",
		])
	})

	it("keeps a row for a turn that failed before writing anything", () => {
		const stopped = toTranscriptRows([message({ completion: "failed" })])

		expect(stopped).toHaveLength(1)
		expect(stopped[0].text).toBe("")
		expect(stopped[0].completion).toBe("failed")
		expect(
			toTranscriptRows([message({ completion: "complete" })]),
		).toHaveLength(0)
		expect(toTranscriptRows([message()])).toHaveLength(0)
	})

	it("drops the row of a turn stopped before writing anything", () => {
		expect(
			toTranscriptRows([message({ id: "a", completion: "cancelled" })]),
		).toEqual([])
		expect(
			toTranscriptRows([message({ id: "b", completion: "interrupted" })]),
		).toEqual([])
	})

	it("never splits the reader's own prompt", () => {
		const rows = toTranscriptRows([
			message({
				id: "local-1",
				role: "user",
				content: "One.\n\nTwo.",
				completion: "complete",
			}),
		])

		expect(rows).toHaveLength(1)
		expect(rows[0].text).toBe("One.\n\nTwo.")
	})
})

describe("toRuns", () => {
	it("gathers consecutive rows from the same speaker", () => {
		const runs = toRuns(
			toTranscriptRows([
				message({ id: "a", content: "One.", completion: "complete" }),
				message({ id: "a2", content: "Two.", completion: "complete" }),
				message({
					id: "local-1",
					role: "user",
					content: "And?",
					completion: "complete",
				}),
				message({ id: "b", content: "Three.", completion: "complete" }),
				message({ id: "c", content: "Four.", completion: "complete" }),
			]),
		)

		expect(runs.map((run) => run.length)).toEqual([2, 1, 2])
		expect(runs.map((run) => run[0].role)).toEqual([
			"assistant",
			"user",
			"assistant",
		])
	})

	it("gathers prompts sent within minutes of each other", () => {
		const runs = toRuns(
			toTranscriptRows([
				prompt({ id: "local-1", createdAt: 0 }),
				prompt({ id: "local-2", createdAt: 60_000 }),
			]),
		)

		expect(runs.map((run) => run.length)).toEqual([2])
	})

	it("splits prompts wherever the author account changes", () => {
		const runs = toRuns(
			toTranscriptRows([
				prompt({ id: "local-1", authorAccountId: "account-lea" }),
				prompt({ id: "local-2", authorAccountId: "account-lea" }),
				prompt({ id: "local-3", authorAccountId: "account-tom" }),
				prompt({ id: "local-4", authorAccountId: null }),
			]),
		)

		expect(runs.map((run) => run.map((row) => row.messageId))).toEqual([
			["local-1", "local-2"],
			["local-3"],
			["local-4"],
		])
	})

	it("splits a relayed prompt from one written here by the same account", () => {
		const runs = toRuns(
			toTranscriptRows([
				prompt({
					id: "here-1",
					authorAccountId: "account-lea",
					writtenFrom: "here",
				}),
				prompt({
					id: "relay-1",
					authorAccountId: "account-lea",
					writtenFrom: "relay",
				}),
			]),
		)

		expect(runs.map((run) => run.map((row) => row.messageId))).toEqual([
			["here-1"],
			["relay-1"],
		])
	})

	it("keeps a pending prompt in the run of one written here by the same account", () => {
		const runs = toRuns(
			toTranscriptRows([
				prompt({
					id: "here-1",
					authorAccountId: "account-lea",
					writtenFrom: "here",
				}),
				prompt({ id: "local-1", authorAccountId: "account-lea" }),
			]),
		)

		expect(runs.map((run) => run.map((row) => row.messageId))).toEqual([
			["here-1", "local-1"],
		])
	})

	it("opens a new block after a long pause", () => {
		const runs = toRuns(
			toTranscriptRows([
				prompt({ id: "local-1", createdAt: 0 }),
				prompt({ id: "local-2", createdAt: 6 * 60_000 }),
			]),
		)

		expect(runs.map((run) => run.length)).toEqual([1, 1])
	})

	it("holds a long burst together while every pause stays short", () => {
		const runs = toRuns(
			toTranscriptRows([
				prompt({ id: "local-1", createdAt: 0 }),
				prompt({ id: "local-2", createdAt: 4 * 60_000 }),
				prompt({ id: "local-3", createdAt: 8 * 60_000 }),
			]),
		)

		expect(runs.map((run) => run.length)).toEqual([3])
	})

	it("keeps the paragraphs of one answer in a single row", () => {
		const runs = toRuns(
			toTranscriptRows([
				message({ content: "One.\n\nTwo.\n\nThree.", completion: "complete" }),
			]),
		)

		expect(runs.map((run) => run.length)).toEqual([1])
	})

	it("keeps an empty transcript empty", () => {
		expect(toRuns([])).toEqual([])
	})
})

describe("day changes in Tokyo", () => {
	const TOKYO_MIDNIGHT = Date.UTC(2026, 9, 9, 15)
	const A_MINUTE = 60_000

	const daySeparatorsIn = (runs: TranscriptRow[][]) =>
		runs.filter((_, runIndex) => opensNewDay(runs, runIndex)).length

	beforeAll(() => {
		vi.stubEnv("TZ", "Asia/Tokyo")
	})

	afterAll(() => {
		vi.unstubAllEnvs()
	})

	it("splits a run at local midnight and opens one new day there", () => {
		const runs = toRuns(
			toTranscriptRows([
				prompt({ id: "local-1", createdAt: TOKYO_MIDNIGHT - A_MINUTE }),
				prompt({ id: "local-2", createdAt: TOKYO_MIDNIGHT + A_MINUTE }),
			]),
		)

		expect(runs.map((run) => run.map((row) => row.messageId))).toEqual([
			["local-1"],
			["local-2"],
		])
		expect(daySeparatorsIn(runs)).toBe(1)
		expect(opensNewDay(runs, 1)).toBe(true)
	})

	it("opens one head row on each side of local midnight", () => {
		const runs = toRuns(
			toTranscriptRows([
				prompt({ id: "local-1", createdAt: TOKYO_MIDNIGHT - 2 * A_MINUTE }),
				prompt({ id: "local-2", createdAt: TOKYO_MIDNIGHT - A_MINUTE }),
				prompt({ id: "local-3", createdAt: TOKYO_MIDNIGHT + A_MINUTE }),
			]),
		)

		expect(daySeparatorsIn(runs)).toBe(1)
		expect(runs.map((run) => run[0].messageId)).toEqual(["local-1", "local-3"])
	})

	it("opens no new day between two messages of the same local day across UTC midnight", () => {
		const utcMidnight = Date.UTC(2026, 9, 10)
		const runs = toRuns(
			toTranscriptRows([
				prompt({ id: "local-1", createdAt: utcMidnight - A_MINUTE }),
				prompt({ id: "local-2", createdAt: utcMidnight + A_MINUTE }),
			]),
		)

		expect(runs.map((run) => run.length)).toEqual([2])
		expect(daySeparatorsIn(runs)).toBe(0)
	})

	it("opens no new day above the first message", () => {
		const runs = toRuns(
			toTranscriptRows([prompt({ createdAt: TOKYO_MIDNIGHT + A_MINUTE })]),
		)

		expect(opensNewDay(runs, 0)).toBe(false)
	})
})

describe("workingStateFor", () => {
	it("says nothing once the turn is over", () => {
		expect(workingStateFor(chatState({ turn: "idle" }))).toBeNull()
	})

	it("reads the kind of work off the newest unfinished step", () => {
		const state = chatState({
			activities: [
				activity({ id: "a", title: "Bash · npm test", status: "succeeded" }),
				activity({ id: "b", title: "Grep · driver", status: "running" }),
			],
		})

		expect(workingStateFor(state)).toEqual({
			kind: "searching",
			label: "Grep · driver",
		})
	})

	it("separates writing tools from the rest", () => {
		const running = (title: string) =>
			workingStateFor(chatState({ activities: [activity({ title })] }))?.kind

		expect(running("Write · chat-turn.tsx")).toBe("writing")
		expect(running("Bash · npm test")).toBe("working")
	})

	it("waits on the reader before anything else", () => {
		const state = chatState({
			activities: [activity()],
			permission: {
				id: "req-1",
				toolName: "Bash",
				title: "Run npm test",
				detail: null,
			},
		})

		expect(workingStateFor(state)).toEqual({
			kind: "waiting",
			label: "Run npm test",
		})
	})

	it("waits on the first question asked, not its header", () => {
		const state = chatState({
			question: {
				id: "ask-1",
				questions: [
					{
						header: "Walls",
						question: "Which wall?",
						options: [],
						multiSelect: false,
					},
				],
			},
		})

		expect(workingStateFor(state)).toEqual({
			kind: "waiting",
			label: "Which wall?",
		})
	})

	it("carries the instant the turn went busy", () => {
		expect(
			workingStateFor(chatState({ turnStartedAt: 1_700 }))?.startedAt,
		).toBe(1_700)
	})

	it("thinks until the first token, then writes", () => {
		expect(workingStateFor(chatState())?.kind).toBe("thinking")
		expect(
			workingStateFor(chatState({ messages: [message({ content: "Well" })] }))
				?.kind,
		).toBe("writing")
	})
})

describe("sidebarActivityFor", () => {
	it("goes quiet once the turn is over, kind and all", () => {
		expect(sidebarActivityFor(chatState({ turn: "idle" }))).toEqual({
			isWorking: false,
		})
		expect(sidebarActivityFor(chatState({ turn: "failed" }))).toEqual({
			isWorking: false,
		})
	})

	it("stays awake for every stage of a busy turn", () => {
		expect(
			sidebarActivityFor(chatState({ turn: "submitting" })).isWorking,
		).toBe(true)
		expect(sidebarActivityFor(chatState({ turn: "running" })).isWorking).toBe(
			true,
		)
		expect(sidebarActivityFor(chatState({ turn: "stopping" })).isWorking).toBe(
			true,
		)
	})

	it("thinks when the turn has nothing to show yet", () => {
		expect(sidebarActivityFor(chatState())).toEqual({
			isWorking: true,
			kind: "thinking",
		})
	})

	it("carries the background task count a held turn waits on", () => {
		const state = chatState({
			activities: [activity({ title: "Grep · driver" })],
			hold: { reason: "backgroundTasks", count: 2 },
		})

		expect(sidebarActivityFor(state)).toEqual({
			isWorking: true,
			kind: "working",
			backgroundTasks: 2,
		})
	})

	it("drops the count once the hold is released", () => {
		expect(
			sidebarActivityFor(chatState({ hold: null })).backgroundTasks,
		).toBeUndefined()
	})

	it("carries the pose read off the running step", () => {
		const state = chatState({
			activities: [activity({ title: "Grep · driver" })],
		})

		expect(sidebarActivityFor(state)).toEqual({
			isWorking: true,
			kind: "searching",
		})
	})

	it("keeps waiting on the reader as a busy state", () => {
		const state = chatState({
			activities: [activity()],
			permission: {
				id: "req-1",
				toolName: "Bash",
				title: "Run npm test",
				detail: null,
			},
		})

		expect(sidebarActivityFor(state)).toEqual({
			isWorking: true,
			kind: "waiting",
		})
	})
})

describe("emptyStateStatusFor", () => {
	it("says nothing while the preflight is still running", () => {
		expect(emptyStateStatusFor("checking", undefined)).toBeNull()
		expect(emptyStateStatusFor("ready", undefined)).toBe("ready")
		expect(emptyStateStatusFor("unavailable", undefined)).toBe("unavailable")
		expect(emptyStateStatusFor("crashed", undefined)).toBe("unavailable")
	})

	it("draws not connected when the latest error says nobody is signed in", () => {
		const signedOut = { kind: "notAuthenticated" } as const

		expect(emptyStateStatusFor("unavailable", signedOut)).toBe("notConnected")
		expect(emptyStateStatusFor("crashed", signedOut)).toBe("notConnected")
	})

	it("keeps the ready empty state while the connection is ready, even signed out", () => {
		expect(emptyStateStatusFor("ready", { kind: "notAuthenticated" })).toBe(
			"ready",
		)
	})

	it("keeps today's state when the latest error is anything else", () => {
		const missing: TransportError = { kind: "binaryNotFound", searched: [] }
		const failed: TransportError = { kind: "authCheckFailed", detail: "t/o" }

		expect(emptyStateStatusFor("unavailable", missing)).toBe("unavailable")
		expect(emptyStateStatusFor("unavailable", failed)).toBe("unavailable")
		expect(emptyStateStatusFor("ready", failed)).toBe("ready")
	})
})

describe("notices", () => {
	it("separates errors that killed the session from the rest", () => {
		expect(needsFreshSession({ kind: "crashed", code: 1, detail: null })).toBe(
			true,
		)
		expect(needsFreshSession({ kind: "turnAlreadyRunning" })).toBe(false)

		expect(
			noticeTitleFor(t, { kind: "crashed", code: null, detail: null }),
		).toBe("The agent stopped")
		expect(noticeTitleFor(t, { kind: "binaryNotFound", searched: [] })).toBe(
			"Couldn’t reach the agent",
		)
		expect(noticeTitleFor(t, { kind: "noActiveTurn" })).toBe(
			"Couldn’t send that request",
		)
	})

	it("titles a signed-out notice on the missing sign-in", () => {
		expect(noticeTitleFor(t, { kind: "notAuthenticated" })).toBe(
			"You’re not signed in",
		)
	})

	it("keeps a left-out server out of the session-ending errors", () => {
		const leftOut = {
			kind: "serverEnvRejected",
			detail:
				'the server "linear" was left out: LINEAR_KEY is defined by no scope',
		} as const
		expect(needsFreshSession(leftOut)).toBe(false)
		expect(noticeTitleFor(t, leftOut)).toBe("Couldn’t start an application")
	})

	it("keeps a refused resume out of the session-ending errors", () => {
		const refused = { kind: "resumeFailed", forgotSessionId: true } as const
		expect(needsFreshSession(refused)).toBe(false)
		expect(noticeTitleFor(t, refused)).toBe("Couldn’t resume the conversation")
	})
})

describe("quoted messages", () => {
	it("carries the reply of a prompt and drops the bookkeeping of an answer", () => {
		const rows = toTranscriptRows([
			prompt({ id: "p-2", repliedToMessageId: "m-9" }),
			message({
				id: "a-2",
				content: "Sure.",
				completion: "complete",
				repliedToMessageId: "p-2",
			}),
		])

		expect(rows.map((row) => row.quotedMessageId)).toEqual(["m-9", null])
	})

	it("names the messages a prompt points at, once each", () => {
		expect(
			quotedMessageIdsIn([
				prompt({ id: "p-1", repliedToMessageId: "m-9" }),
				prompt({ id: "p-2", repliedToMessageId: "m-9" }),
				prompt({ id: "p-3" }),
				message({ id: "a-1", repliedToMessageId: "p-1" }),
			]),
		).toEqual(["m-9"])
	})

	it("quotes a loaded message without its attachment markers", () => {
		const quoted = message({
			id: "m-9",
			content: promptWithAttachments("Look at this", [ATTACHMENT], new Date()),
		})
		const targets = quotedTargetsIn(
			[quoted, prompt({ id: "p-1", repliedToMessageId: "m-9" })],
			["m-9"],
		)

		expect(targets.get("m-9")).toEqual({
			messageId: "m-9",
			role: "assistant",
			excerpt: "Look at this",
			authorBotId: null,
			authorAccountId: null,
			authorName: null,
		})
	})

	it("leaves a message nobody points at out of the quotes", () => {
		expect(quotedTargetsIn([message({ id: "m-9" })], []).size).toBe(0)
	})

	it("quotes a message that was paged out from its stored reference", () => {
		expect(
			replyTargetOfReference({
				uri: "kiroshi://c-1/m-9",
				conversationId: "c-1",
				messageId: "m-9",
				role: "user",
				seq: 3,
				createdAt: 0,
				excerpt: "Look at this",
				runtimeSessionId: null,
				providerSessionId: null,
			}),
		).toEqual({
			messageId: "m-9",
			role: "user",
			excerpt: "Look at this",
			authorBotId: null,
			authorAccountId: null,
			authorName: null,
		})
	})
})

describe("claimsComposerFocus", () => {
	const claim = {
		threadId: "conversation-1",
		focusedThreadId: null,
		isPromptPending: false,
		isOverlayOpen: false,
	}

	it("claims the caret when a conversation opens", () => {
		expect(claimsComposerFocus(claim)).toBe(true)
	})

	it("claims the caret again when another thread opens", () => {
		expect(
			claimsComposerFocus({ ...claim, focusedThreadId: "conversation-2" }),
		).toBe(true)
	})

	it("leaves the caret alone on the thread it already claimed", () => {
		expect(
			claimsComposerFocus({ ...claim, focusedThreadId: "conversation-1" }),
		).toBe(false)
	})

	it("yields to a card that waits for the reader", () => {
		expect(claimsComposerFocus({ ...claim, isPromptPending: true })).toBe(false)
	})

	it("yields to an open overlay", () => {
		expect(claimsComposerFocus({ ...claim, isOverlayOpen: true })).toBe(false)
	})
})

describe("markedRunsOf", () => {
	const spoken = (id: string, authorBotId: string) =>
		message({ id, authorBotId, content: "Said.", completion: "complete" })

	it("marks the last run of every companion that stopped working", () => {
		const runs = toRuns(
			toTranscriptRows([
				spoken("a", "bot-1"),
				spoken("b", "bot-2"),
				spoken("c", "bot-1"),
			]),
		)

		expect([...markedRunsOf(runs, [null])].toSorted()).toEqual([1, 2])
	})

	it("leaves a companion unmarked while it is still working", () => {
		const runs = toRuns(
			toTranscriptRows([spoken("a", "bot-1"), spoken("b", "bot-2")]),
		)

		expect([...markedRunsOf(runs, ["bot-2"])]).toEqual([0])
	})
})

describe("runPresentationsOf", () => {
	const soloRuns = toRuns(
		toTranscriptRows([
			message({ id: "a", content: "One.", completion: "complete" }),
			message({ id: "a2", content: "Two.", completion: "complete" }),
			prompt({ id: "local-1", createdAt: 6 * 60_000 }),
			message({
				id: "b",
				content: "Three.",
				completion: "complete",
				createdAt: 7 * 60_000,
			}),
		]),
	)
	const solo = (isWorking: boolean) =>
		runPresentationsOf({
			runs: soloRuns,
			workingBotIds: [],
			hasSingleBot: true,
			isWorking,
		})

	it("marks the newest run alone in a single companion thread", () => {
		expect(solo(false).map((run) => run.isMarked)).toEqual([false, false, true])
	})

	it("marks no run of a single companion thread while the companion works", () => {
		expect(solo(true).map((run) => run.isMarked)).toEqual([false, false, false])
	})

	it("renders tables bare in a single companion thread", () => {
		expect(solo(false).every((run) => run.hasBareTables)).toBe(true)
	})

	it("marks the runs of the companions that stopped working in a conversation", () => {
		const spoken = (id: string, authorBotId: string) =>
			message({ id, authorBotId, content: "Said.", completion: "complete" })
		const runs = toRuns(
			toTranscriptRows([spoken("a", "bot-1"), spoken("b", "bot-2")]),
		)

		const presentations = runPresentationsOf({
			runs,
			workingBotIds: ["bot-2"],
			hasSingleBot: false,
			isWorking: true,
		})

		expect(presentations.map((run) => run.isMarked)).toEqual([true, false])
		expect(presentations.some((run) => run.hasBareTables)).toBe(false)
	})

	describe("head row", () => {
		const said = (id: string, authorBotId: string, minute: number) =>
			message({
				id,
				authorBotId,
				content: "Said.",
				completion: "complete",
				createdAt: minute * 60_000,
			})
		const headRowsOf = (runs: TranscriptRow[][]) =>
			runs.map((run) => run.map((row) => row === run[0]))
		const headRowsIn = (rows: TranscriptRow[]) => headRowsOf(toRuns(rows))

		it("opens one head row on the first of three same-author messages", () => {
			const rows = toTranscriptRows([
				said("a", "bot-1", 0),
				said("b", "bot-1", 1),
				said("c", "bot-1", 2),
			])

			expect(headRowsIn(rows)).toEqual([[true, false, false]])
		})

		it("opens one head row for each run of two authors", () => {
			const rows = toTranscriptRows([
				said("a", "bot-1", 0),
				said("b", "bot-2", 1),
			])

			expect(headRowsIn(rows)).toEqual([[true], [true]])
		})

		it("opens one head row on the first prompt of a user run", () => {
			const rows = toTranscriptRows([
				prompt({ id: "local-1", createdAt: 0 }),
				prompt({ id: "local-2", createdAt: 60_000 }),
			])

			expect(headRowsIn(rows)).toEqual([[true, false]])
		})

		it("opens one head row on each run of a single companion thread", () => {
			expect(headRowsOf(soloRuns)).toEqual([[true, false], [true], [true]])
		})
	})

	it("returns nothing for an empty transcript", () => {
		expect(
			runPresentationsOf({
				runs: [],
				workingBotIds: [],
				hasSingleBot: true,
				isWorking: false,
			}),
		).toEqual([])
	})
})

describe("repliesBeingWrittenIn", () => {
	const written = (id: string, authorBotId: string | null, minute: number) =>
		message({
			id,
			authorBotId,
			content: "Writing",
			completion: "streaming",
			createdAt: minute * 60_000,
		})
	const repliesOf = (messages: TranscriptMessage[], soloBotId: string | null) =>
		Object.fromEntries(
			repliesBeingWrittenIn(toRuns(toTranscriptRows(messages)), soloBotId),
		)

	it("names the reply each companion of a conversation is writing", () => {
		expect(
			repliesOf([written("a", "bot-1", 0), written("b", "bot-2", 1)], null),
		).toEqual({ "bot-1": "a", "bot-2": "b" })
	})

	it("hands a reply with no author to the companion of a single companion thread", () => {
		expect(repliesOf([written("a", null, 0)], "bot-1")).toEqual({
			"bot-1": "a",
		})
	})

	it("leaves out a reply that ended and a prompt still being sent", () => {
		expect(
			repliesOf(
				[
					message({ id: "a", content: "Done.", completion: "complete" }),
					prompt({ id: "local-1", completion: "pending", createdAt: 60_000 }),
				],
				"bot-1",
			),
		).toEqual({})
	})

	it("keeps the newest reply of a companion writing two", () => {
		expect(
			repliesOf([written("a", "bot-1", 0), written("b", "bot-1", 1)], null),
		).toEqual({ "bot-1": "b" })
	})

	it("leaves out a reply no companion claims", () => {
		expect(repliesOf([written("a", null, 0)], null)).toEqual({})
	})
})

describe("continuation turns", () => {
	const asked = prompt({ id: "p1", turnId: "t1", createdAt: 0 })
	const answered = message({
		id: "m1",
		turnId: "t1",
		content: "Started the build.",
		completion: "complete",
		createdAt: 1_000,
	})
	const followedUp = prompt({
		id: "p2",
		turnId: "t2",
		content: "Thanks",
		createdAt: 2_000,
	})
	const continued = message({
		id: "m2",
		turnId: "c1",
		continuesTurnId: "t1",
		content: "The build passed.",
		completion: "complete",
		createdAt: 3_000,
	})

	const idsOf = (messages: TranscriptMessage[]) =>
		toRuns(toTranscriptRows(messages)).map((run) =>
			run.map((row) => row.messageId),
		)

	it("renders a continuation as its own bubble group under the reply it continues", () => {
		expect(idsOf([asked, answered, continued])).toEqual([
			["p1"],
			["m1"],
			["m2"],
		])
	})

	it("places the continuation under the reply of its turn, before later prompts", () => {
		expect(idsOf([asked, answered, followedUp, continued])).toEqual([
			["p1"],
			["m1"],
			["m2"],
			["p2"],
		])
	})

	it("keeps every message of a continuation turn together, in their order", () => {
		const closing = message({
			id: "m3",
			turnId: "c1",
			continuesTurnId: "t1",
			content: "And the tests too.",
			completion: "complete",
			createdAt: 4_000,
		})

		expect(idsOf([asked, answered, followedUp, continued, closing])).toEqual([
			["p1"],
			["m1"],
			["m2", "m3"],
			["p2"],
		])
	})

	it("leaves a continuation where it was stored when its turn is not loaded", () => {
		expect(idsOf([followedUp, continued])).toEqual([["p2"], ["m2"]])
	})
})
