import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as Y from "yjs"

import {
	base64Of,
	bytesOf,
	createLibraryDocumentSession,
	SEND_INTERVAL_MS,
	seedUpdateOf,
} from "./library-document-session"

const stateOf = (markdown: string) => {
	const doc = new Y.Doc()
	doc.getText("markdown").insert(0, markdown)
	return base64Of(Y.encodeStateAsUpdate(doc))
}

const markdownAfter = (state: string, ...updates: string[]) => {
	const doc = new Y.Doc()
	for (const update of [state, ...updates]) {
		Y.applyUpdate(doc, bytesOf(update))
	}
	return doc.getText("markdown").toString()
}

const insertedPiecesOf = (update: string) =>
	Y.decodeUpdate(bytesOf(update)).structs.flatMap((struct) =>
		struct instanceof Y.Item && struct.content instanceof Y.ContentString
			? [struct.content.str]
			: [],
	)

const insertedTextOf = (update: string) => insertedPiecesOf(update).join("")

const deletedLengthOf = (update: string) =>
	[...Y.decodeUpdate(bytesOf(update)).ds.clients.values()]
		.flat()
		.reduce((total, { len }) => total + len, 0)

const openSession = (markdown: string) => {
	const state = stateOf(markdown)
	const sent: string[] = []
	const session = createLibraryDocumentSession({
		state,
		send: async (update) => {
			sent.push(update)
		},
	})
	return { state, sent, session }
}

const OPENING = "Intro line\n\n## Rollout\n\nWe ship in May."

const OPENING_WITH_IDS =
	"Intro line ^aaaaaa\n\n## Rollout ^bbbbbb\n\nWe ship in May. ^cccccc"

const LONE_SURROGATE = /\p{Cs}/u

const PIECES = ["a", "b", " ", "\n", "😀", "😁", "é", "^", "x1", "."]

const seededRandom = (seed: number) => {
	let state = seed
	return () => {
		state = (state * 1103515245 + 12345) % 2147483648
		return state / 2147483648
	}
}

const randomTextOf = (random: () => number, maxLength: number) =>
	Array.from(
		{ length: Math.floor(random() * maxLength) },
		() => PIECES[Math.floor(random() * PIECES.length)],
	).join("")

const editedTextOf = (random: () => number, current: string) => {
	if (random() < 0.1) {
		return randomTextOf(random, 40)
	}
	const characters = [...current]
	const edits = 1 + Math.floor(random() * 6)
	for (let i = 0; i < edits; i++) {
		const at = Math.floor(random() * (characters.length + 1))
		const removed = random() < 0.5 ? Math.floor(random() * 4) : 0
		characters.splice(at, removed, ...randomTextOf(random, 5))
	}
	return characters.join("")
}

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	vi.useRealTimers()
})

describe("a Library document session", () => {
	it("opens on the markdown of the host", () => {
		const { session } = openSession("# Plan")

		expect(session.markdown()).toBe("# Plan")
	})

	it("sends an edit as the smallest replaced range", async () => {
		const { state, sent, session } = openSession("Hello world")

		session.edit("Hello brave world")
		await session.flush()

		expect(sent).toHaveLength(1)
		expect(insertedTextOf(sent[0] as string)).toBe("brave ")
		expect(deletedLengthOf(sent[0] as string)).toBe(0)
		expect(markdownAfter(state, ...sent)).toBe("Hello brave world")
	})

	it("replaces only the changed middle of the text", async () => {
		const { state, sent, session } = openSession("one two three")

		session.edit("one 2 three")
		await session.flush()

		expect(insertedTextOf(sent[0] as string)).toBe("2")
		expect(deletedLengthOf(sent[0] as string)).toBe(3)
		expect(markdownAfter(state, ...sent)).toBe("one 2 three")
	})

	it("keeps a surrogate pair whole when two emoji share their first half", async () => {
		const { state, sent, session } = openSession("Mood 😀")

		session.edit("Mood 😁")
		await session.flush()

		expect(insertedTextOf(sent[0] as string)).toBe("😁")
		expect(markdownAfter(state, ...sent)).toBe("Mood 😁")
	})

	it("replaces each separate change on its own and leaves the text between them in place", async () => {
		const { state, sent, session } = openSession("one two three four")

		session.edit("1 two three 4")
		await session.flush()

		expect(insertedPiecesOf(sent[0] as string)).toEqual(["4", "1"])
		expect(deletedLengthOf(sent[0] as string)).toBe(7)
		expect(markdownAfter(state, ...sent)).toBe("1 two three 4")
	})

	it("writes the ids of a first edit as inserts only", async () => {
		const { state, sent, session } = openSession(OPENING)

		session.edit(OPENING_WITH_IDS)
		await session.flush()

		expect(insertedPiecesOf(sent[0] as string).sort()).toEqual([
			" ^aaaaaa",
			" ^bbbbbb",
			" ^cccccc",
		])
		expect(deletedLengthOf(sent[0] as string)).toBe(0)
		expect(markdownAfter(state, ...sent)).toBe(OPENING_WITH_IDS)
	})

	it("inserts a new paragraph whole beside the ids of a first edit", async () => {
		const { state, sent, session } = openSession(OPENING)
		const paragraph = "We roll out in June. ^dddddd"
		const next = OPENING_WITH_IDS.replace(
			" ^bbbbbb",
			` ^bbbbbb\n\n${paragraph}`,
		)

		session.edit(next)
		await session.flush()

		expect(
			insertedPiecesOf(sent[0] as string).some((piece) =>
				piece.includes(paragraph),
			),
		).toBe(true)
		expect(deletedLengthOf(sent[0] as string)).toBe(0)
		expect(markdownAfter(state, ...sent)).toBe(next)
	})

	it("keeps every surrogate pair whole across separate changes", async () => {
		const { state, sent, session } = openSession("😀 one 😀 two 😀")

		session.edit("😁 one 😀 two 😂!")
		await session.flush()

		expect(
			insertedPiecesOf(sent[0] as string).some((piece) =>
				LONE_SURROGATE.test(piece),
			),
		).toBe(false)
		expect(markdownAfter(state, ...sent)).toBe("😁 one 😀 two 😂!")
	})

	it("ends on the edited markdown for any pair of texts", () => {
		const random = seededRandom(7)
		for (let i = 0; i < 500; i++) {
			const current = randomTextOf(random, 40)
			const next = editedTextOf(random, current)
			const { state, session } = openSession(current)

			session.edit(next)

			expect(session.markdown()).toBe(next)
			expect(markdownAfter(state, seedUpdateOf(state, next))).toBe(next)
		}
	})

	it("sends at most one update every 250 ms while typing", () => {
		const { state, sent, session } = openSession("")

		session.edit("a")
		vi.advanceTimersByTime(100)
		session.edit("ab")
		vi.advanceTimersByTime(100)
		session.edit("abc")
		expect(sent).toHaveLength(0)

		vi.advanceTimersByTime(SEND_INTERVAL_MS - 200)
		expect(sent).toHaveLength(1)

		session.edit("abcd")
		vi.advanceTimersByTime(SEND_INTERVAL_MS - 1)
		expect(sent).toHaveLength(1)
		vi.advanceTimersByTime(1)
		expect(sent).toHaveLength(2)
		expect(markdownAfter(state, ...sent)).toBe("abcd")
	})

	it("sends the pending update at once on flush", () => {
		const { sent, session } = openSession("")

		session.edit("draft")
		void session.flush()

		expect(sent).toHaveLength(1)
		vi.advanceTimersByTime(SEND_INTERVAL_MS)
		expect(sent).toHaveLength(1)
	})

	it("shows a received update without sending it back, and ignores its echo", async () => {
		const host = openSession("Shared")
		const other = openSession("")
		const editing = createLibraryDocumentSession({
			state: host.state,
			send: async (update) => {
				other.sent.push(update)
			},
		})
		editing.edit("Shared notes")
		await editing.flush()
		const update = other.sent[0] as string

		expect(host.session.receive(update)).toBe(true)
		expect(host.session.markdown()).toBe("Shared notes")
		expect(host.session.receive(update)).toBe(false)
		vi.advanceTimersByTime(SEND_INTERVAL_MS)
		expect(host.sent).toHaveLength(0)
	})
})

describe("the seed of a new Library document", () => {
	it("writes the starting body into the opened document", () => {
		const state = stateOf("")

		expect(markdownAfter(state, seedUpdateOf(state, "## Agenda\n\n- "))).toBe(
			"## Agenda\n\n- ",
		)
	})
})

const hostDocOf = (markdown: string) => {
	const doc = new Y.Doc()
	doc.getText("markdown").insert(0, markdown)
	return doc
}

const caretIn = (doc: Y.Doc, index: number) =>
	base64Of(
		Y.encodeRelativePosition(
			Y.createRelativePositionFromTypeIndex(doc.getText("markdown"), index, -1),
		),
	)

const changeOn = (doc: Y.Doc, change: (text: Y.Text) => void) => {
	const before = Y.encodeStateVector(doc)
	change(doc.getText("markdown"))
	return base64Of(Y.encodeStateAsUpdate(doc, before))
}

describe("a caret the host shares in a Library document", () => {
	it("stands at the offset it sticks to, and moves with text arriving before it", () => {
		const host = hostDocOf("Hello world")
		const session = createLibraryDocumentSession({
			state: base64Of(Y.encodeStateAsUpdate(host)),
			send: async () => null,
		})
		const caret = caretIn(host, 5)

		expect(session.offsetOf(caret)).toBe(5)

		session.receive(
			changeOn(host, (text) => {
				text.insert(0, ">> ")
				text.insert(text.length, "!")
			}),
		)

		expect(session.offsetOf(caret)).toBe(8)
	})

	it("stands nowhere until the text it sticks to has arrived", () => {
		const host = hostDocOf("Hello")
		const session = createLibraryDocumentSession({
			state: base64Of(Y.encodeStateAsUpdate(host)),
			send: async () => null,
		})
		const arriving = changeOn(host, (text) => text.insert(5, " world"))
		const caret = caretIn(host, 11)

		expect(session.offsetOf(caret)).toBeNull()

		session.receive(arriving)

		expect(session.offsetOf(caret)).toBe(11)
	})
})

const RUN = " early"

const RUN_AT = OPENING.indexOf(" in May")

const agentRunOn = (host: Y.Doc) =>
	changeOn(host, (text) => text.insert(RUN_AT, RUN))

const FIRST_EDIT = OPENING_WITH_IDS.replace("Intro line", "Intro line, edited")

const CONVERGED = FIRST_EDIT.replace("We ship", `We ship${RUN}`)

const sessionOn = (host: Y.Doc, sent: string[]) =>
	createLibraryDocumentSession({
		state: base64Of(Y.encodeStateAsUpdate(host)),
		send: async (update) => {
			sent.push(update)
		},
	})

const offsetOnHost = (host: Y.Doc, caret: string) =>
	Y.createAbsolutePositionFromRelativePosition(
		Y.decodeRelativePosition(bytesOf(caret)),
		host,
	)?.index

describe("an agent writing while a person makes the first edit of a document without ids", () => {
	it("keeps every character the agent wrote, in place, on both sides", async () => {
		const host = hostDocOf(OPENING)
		const sent: string[] = []
		const session = sessionOn(host, sent)

		session.edit(FIRST_EDIT)
		session.receive(agentRunOn(host))
		await session.flush()
		for (const update of sent) {
			Y.applyUpdate(host, bytesOf(update))
		}

		expect(session.markdown()).toBe(CONVERGED)
		expect(host.getText("markdown").toString()).toBe(CONVERGED)
	})

	it("keeps the caret and the anchors of the agent inside its run", async () => {
		const host = hostDocOf(OPENING)
		const sent: string[] = []
		const session = sessionOn(host, sent)
		session.receive(agentRunOn(host))
		const anchor = caretIn(host, RUN_AT + 1)
		const caret = caretIn(host, RUN_AT + RUN.length)

		session.edit(CONVERGED)
		await session.flush()
		for (const update of sent) {
			Y.applyUpdate(host, bytesOf(update))
		}

		const runStart = CONVERGED.indexOf(RUN)
		expect(session.offsetOf(anchor)).toBe(runStart + 1)
		expect(session.offsetOf(caret)).toBe(runStart + RUN.length)
		expect(offsetOnHost(host, anchor)).toBe(runStart + 1)
		expect(offsetOnHost(host, caret)).toBe(runStart + RUN.length)
	})
})
