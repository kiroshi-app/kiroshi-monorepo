import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as Y from "yjs"

import { readBoard } from "@workspace/shared/board/board-doc"

import { boardStateOf, TWO_NOTES_BOARD } from "./library-board-fixtures"
import { applyLibraryBoardIntent } from "./library-board-intents"
import { createLibraryBoardSession } from "./library-board-session"
import { base64Of, bytesOf, SEND_INTERVAL_MS } from "./library-document-session"

const HOST_STATE = boardStateOf(TWO_NOTES_BOARD)

const openSession = (state = HOST_STATE) => {
	const sent: string[] = []
	const send = vi.fn(async (update: string) => {
		sent.push(update)
	})
	const onRefused = vi.fn()
	const session = createLibraryBoardSession({ state, send, onRefused })
	const stopTracking = session.trackHistory()
	return { state, sent, send, onRefused, session, stopTracking }
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
	vi.restoreAllMocks()
})

const idsOf = (session: ReturnType<typeof createLibraryBoardSession>) =>
	session
		.view()
		.objects.map((object) => object.id)
		.sort()

const remoteFieldOf = (
	state: string,
	id: string,
	field: string,
	value: unknown,
) =>
	remoteEdit(state, (doc) =>
		doc.getMap<Y.Map<unknown>>("nodes").get(id)?.set(field, value),
	)

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

	it("keeps the board live when a concurrent delete here and connect there leave an edge dangling", async () => {
		const here = openSession()
		const there = openSession()

		here.session.apply({ type: "delete", id: "second" })
		there.session.apply({
			type: "connect",
			id: "back",
			from: "first",
			fromSide: "right",
			to: "second",
			toSide: "left",
			routing: "straight",
		})
		await here.session.flush()
		await there.session.flush()
		for (const update of there.sent) here.session.receive(update)
		for (const update of here.sent) there.session.receive(update)

		expect(idsOf(here.session)).toEqual(["first"])
		expect(idsOf(there.session)).toEqual(["first"])

		there.session.apply({
			type: "move",
			id: "first",
			position: { x: 70, y: 0 },
		})
		await there.session.flush()
		here.session.receive(there.sent.at(-1) as string)

		expect(positionOf(here.session, "first")).toEqual({ x: 70, y: 0 })
		expect(here.onRefused).not.toHaveBeenCalled()
	})

	it("keeps the last good view and raises one refusal when the state stops parsing", () => {
		const logged = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		const { state, session, onRefused } = openSession()

		session.receive(remoteFieldOf(state, "first", "x", "wide"))
		session.receive(remoteFieldOf(state, "second", "width", "tall"))
		session.apply({ type: "move", id: "second", position: { x: 5, y: 0 } })

		expect(positionOf(session, "first")).toEqual({ x: 0, y: 0 })
		expect(idsOf(session)).toEqual(["first", "link", "second"])
		expect(onRefused).toHaveBeenCalledOnce()
		expect(logged).toHaveBeenCalled()
	})

	it("flushes the pending update, then destroys its doc, on close", async () => {
		const destroyed = vi.spyOn(Y.Doc.prototype, "destroy")
		const { state, sent, send, session } = openSession()

		session.apply({ type: "move", id: "first", position: { x: 9, y: 0 } })
		await session.close()

		expect(boardAfter(state, ...sent).nodes.first).toMatchObject({ x: 9 })
		expect(destroyed).toHaveBeenCalledOnce()
		expect(send.mock.invocationCallOrder[0]).toBeLessThan(
			destroyed.mock.invocationCallOrder[0] ?? 0,
		)
	})
})
