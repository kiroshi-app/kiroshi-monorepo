import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as Y from "yjs"

import { readBoard } from "@workspace/shared/board/board-doc"

import { boardStateOf, TWO_NOTES_BOARD } from "./library-board-fixtures"
import { applyLibraryBoardIntent } from "./library-board-intents"
import { createLibraryBoardSession } from "./library-board-session"
import { base64Of, bytesOf, SEND_INTERVAL_MS } from "./library-document-session"

const openSession = () => {
	const state = boardStateOf(TWO_NOTES_BOARD)
	const sent: string[] = []
	const session = createLibraryBoardSession({
		state,
		send: async (update) => {
			sent.push(update)
		},
	})
	const stopTracking = session.trackHistory()
	return { state, sent, session, stopTracking }
}

const boardAfter = (state: string, ...updates: string[]) => {
	const doc = new Y.Doc()
	for (const update of [state, ...updates]) {
		Y.applyUpdate(doc, bytesOf(update))
	}
	return readBoard(doc)
}

const remoteEdit = (state: string, edit: (doc: Y.Doc) => void) => {
	const doc = new Y.Doc()
	Y.applyUpdate(doc, bytesOf(state))
	const before = Y.encodeStateVector(doc)
	edit(doc)
	return base64Of(Y.encodeStateAsUpdate(doc, before))
}

const remoteMoveOf = (state: string, id: string, x: number) =>
	remoteEdit(state, (doc) =>
		applyLibraryBoardIntent(
			doc,
			{ type: "move", id, position: { x, y: 0 } },
			"remote peer",
		),
	)

const itemOf = (
	session: ReturnType<typeof createLibraryBoardSession>,
	id: string,
) => session.view().objects.find((object) => object.id === id)

const positionOf = (
	session: ReturnType<typeof createLibraryBoardSession>,
	id: string,
) => {
	const object = itemOf(session, id)
	return object && "position" in object ? object.position : undefined
}

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	vi.useRealTimers()
})

describe("a Library board session", () => {
	it("opens on the view of the host state", () => {
		const { session } = openSession()

		expect(
			session
				.view()
				.objects.map((object) => object.id)
				.sort(),
		).toEqual(["first", "link", "second"])
	})

	it("sends at most one update every 250 ms while editing", () => {
		const { state, sent, session } = openSession()

		session.apply({ type: "move", id: "first", position: { x: 1, y: 0 } })
		vi.advanceTimersByTime(100)
		session.apply({ type: "move", id: "first", position: { x: 2, y: 0 } })
		expect(sent).toHaveLength(0)

		vi.advanceTimersByTime(SEND_INTERVAL_MS - 100)
		expect(sent).toHaveLength(1)
		expect(boardAfter(state, ...sent).nodes.first).toMatchObject({ x: 2 })
	})

	it("applies a remote update without sending it back", async () => {
		const { state, sent, session } = openSession()
		const onChange = vi.fn()
		session.subscribe(onChange)

		session.receive(remoteMoveOf(state, "second", 900))
		await session.flush()
		vi.runAllTimers()

		expect(positionOf(session, "second")).toEqual({ x: 900, y: 0 })
		expect(onChange).toHaveBeenCalled()
		expect(sent).toHaveLength(0)
	})

	it("undoes only the change made in this window, keeping a concurrent remote one", async () => {
		const { state, sent, session } = openSession()

		session.apply({ type: "move", id: "first", position: { x: 50, y: 0 } })
		session.receive(remoteMoveOf(state, "second", 900))
		session.undo()
		await session.flush()

		expect(positionOf(session, "first")).toEqual({ x: 0, y: 0 })
		expect(positionOf(session, "second")).toEqual({ x: 900, y: 0 })
		expect(boardAfter(state, ...sent).nodes.first).toMatchObject({ x: 0 })
	})

	it("never undoes a remote change alone", () => {
		const { state, session } = openSession()

		session.receive(remoteMoveOf(state, "second", 900))
		session.undo()

		expect(positionOf(session, "second")).toEqual({ x: 900, y: 0 })
	})

	it("redoes an undone change", () => {
		const { session } = openSession()

		session.apply({ type: "edit-text", id: "first", text: "Changed" })
		session.undo()
		session.redo()

		expect(itemOf(session, "first")?.text).toBe("Changed")
	})

	it("brings a deleted node back with its connector on undo", () => {
		const { session } = openSession()

		session.apply({ type: "delete", id: "second" })
		expect(itemOf(session, "second")).toBeUndefined()

		session.undo()

		expect(itemOf(session, "second")).toMatchObject({ text: "Second" })
		expect(itemOf(session, "link")).toMatchObject({ kind: "connector" })
	})

	it("undoes nothing once its history is destroyed", () => {
		const { session, stopTracking } = openSession()

		session.apply({ type: "move", id: "first", position: { x: 50, y: 0 } })
		stopTracking()
		session.undo()

		expect(positionOf(session, "first")).toEqual({ x: 50, y: 0 })
	})

	it("sends the pending update at once on flush", async () => {
		const { state, sent, session } = openSession()

		session.apply({ type: "move", id: "first", position: { x: 7, y: 0 } })
		await session.flush()

		expect(sent).toHaveLength(1)
		expect(boardAfter(state, ...sent).nodes.first).toMatchObject({ x: 7 })
	})
})
