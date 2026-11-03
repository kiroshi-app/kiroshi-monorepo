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

const insertedTextOf = (update: string) =>
	Y.decodeUpdate(bytesOf(update))
		.structs.map((struct) =>
			struct instanceof Y.Item && struct.content instanceof Y.ContentString
				? struct.content.str
				: "",
		)
		.join("")

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
