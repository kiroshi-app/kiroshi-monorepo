// @vitest-environment happy-dom

import type { Event } from "@tauri-apps/api/event"
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as Y from "yjs"

import type { BoardTool } from "@workspace/ui/components/board/board-dock"
import { i18n } from "@workspace/ui/lib/i18n"

import { LibraryBoard } from "@/components/library-board"
import {
	LIBRARY_DOCUMENT_UPDATED_EVENT,
	type LibraryBoardSummary,
	type LibraryDocumentState,
	type LibraryDocumentUpdated,
} from "@/lib/bindings"
import { raiseReportedFailure } from "@/lib/failure-report"
import { listen } from "@/lib/host"
import {
	boardStateOf,
	TWO_NOTES_BOARD,
} from "@/lib/library/library-board-fixtures"
import { applyLibraryBoardIntent } from "@/lib/library/library-board-intents"
import { base64Of, bytesOf } from "@/lib/library/library-document-session"
import { applyLibraryUpdate } from "@/lib/library/library-document-writes"
import { openLibraryDocument } from "@/lib/library/library-reads"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { useTabKeys } from "@/lib/tabs/use-tab-keys"
import type { WorkspaceTabs } from "@/lib/tabs/workspace-tabs"

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	listen: vi.fn(),
	usesCommandKey: () => true,
}))

vi.mock("@/lib/library/library-reads", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/library/library-reads")>()),
	openLibraryDocument: vi.fn(),
}))

vi.mock("@/lib/library/library-document-writes", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@/lib/library/library-document-writes")
	>()),
	applyLibraryUpdate: vi.fn(),
}))

vi.mock("@/lib/failure-report", async (importOriginal) => {
	const raiseReportedFailure = vi.fn()
	return {
		...(await importOriginal<typeof import("@/lib/failure-report")>()),
		raiseReportedFailure,
		failureReporterIn:
			(raisedIn: string) =>
			(...[notice, facts]: Parameters<typeof raiseReportedFailure>) =>
				raiseReportedFailure(notice, { ...facts, raisedIn }),
	}
})

const SPACE_ID = "space-on-screen"
const NAME = "Roadmap.canvas"
const STATE = boardStateOf(TWO_NOTES_BOARD)

const SUMMARY: LibraryBoardSummary = {
	name: NAME,
	nodeCount: 2,
	nodes: [],
	bounds: { x: 0, y: 0, width: 500, height: 100 },
}

const common = i18n.getFixedT(null, "common")

const textNamed = (text: string) =>
	common("board.object.named", {
		kind: common("board.object.kind.text"),
		text,
	})

const objectNamed = (text: string) =>
	screen.queryByRole("option", { name: textNamed(text) })

const boardCanvas = () =>
	screen.getByRole("application", { name: common("board.canvas.label") })

const toolButton = (tool: BoardTool) =>
	screen.getByRole("button", { name: common(`board.dock.tool.${tool}`) })

const zoomLevel = () =>
	screen.getByRole("group", { name: common("board.zoom.controls") }).textContent

const pressedTool = () =>
	screen
		.getAllByRole("button")
		.find(
			(button) =>
				button.dataset.slot === "board-dock-tool" &&
				button.getAttribute("aria-pressed") === "true",
		)?.dataset.tool

const openedState = (): LibraryDocumentState => ({ name: NAME, update: STATE })

const fakeHost = () => {
	const unlisten = vi.fn()
	let heard: ((event: Event<LibraryDocumentUpdated>) => void) | null = null
	vi.mocked(listen).mockImplementation(async (event, handler) => {
		if (event === LIBRARY_DOCUMENT_UPDATED_EVENT) {
			heard = (update) => handler(update as Parameters<typeof handler>[0], null)
		}
		return unlisten
	})
	vi.mocked(openLibraryDocument).mockImplementation(async () => openedState())
	vi.mocked(applyLibraryUpdate).mockResolvedValue(null)
	const announce = (update: string, name = NAME) =>
		act(() =>
			heard?.({
				event: LIBRARY_DOCUMENT_UPDATED_EVENT,
				id: 0,
				payload: { spaceId: SPACE_ID, name, update },
			}),
		)
	return { unlisten, announce }
}

const remoteEditOf = (edit: (doc: Y.Doc) => void) => {
	const doc = new Y.Doc()
	Y.applyUpdate(doc, bytesOf(STATE))
	const before = Y.encodeStateVector(doc)
	edit(doc)
	return base64Of(Y.encodeStateAsUpdate(doc, before))
}

const remoteMoveOf = (id: string, x: number) =>
	remoteEditOf((doc) =>
		applyLibraryBoardIntent(
			doc,
			{ type: "move", id, position: { x, y: 0 } },
			"remote peer",
		),
	)

const remoteBreakOf = (id: string) =>
	remoteEditOf((doc) =>
		doc.getMap<Y.Map<unknown>>("nodes").get(id)?.set("x", "unreadable"),
	)

const boardElement = () =>
	createElement(LibraryBoard, {
		spaceId: SPACE_ID,
		name: NAME,
		title: "Roadmap",
		summary: SUMMARY,
		onBack: vi.fn(),
		onDelete: vi.fn(),
	})

const mountBoard = async () => {
	const host = fakeHost()
	const { wrapper } = createQueryTestWrapper()
	const mounted = render(boardElement(), { wrapper })
	await screen.findByRole("option", { name: textNamed("First") })
	return {
		...host,
		...mounted,
		rerenderBoard: () => mounted.rerender(boardElement()),
	}
}

const focusObject = (text: string) => {
	const object = objectNamed(text) as HTMLElement
	act(() => object.focus())
	return object
}

const pressUndo = (target: HTMLElement, isRedo = false) =>
	fireEvent.keyDown(target, { key: "z", metaKey: true, shiftKey: isRedo })

const startEditing = (text: string) => {
	fireEvent.keyDown(focusObject(text), { key: "Enter" })
	return screen.getByRole("textbox", { name: common("board.object.editText") })
}

beforeEach(() => {
	vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200)
	vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800)
})

afterEach(() => {
	cleanup()
	vi.mocked(listen).mockReset()
	vi.mocked(openLibraryDocument).mockReset()
	vi.mocked(applyLibraryUpdate).mockReset()
	vi.mocked(raiseReportedFailure).mockReset()
	vi.restoreAllMocks()
})

describe("a Library board on its live session", () => {
	it("shows the board loading, never the empty hint, until its state opens", async () => {
		fakeHost()
		let open: (state: LibraryDocumentState) => void = () => undefined
		vi.mocked(openLibraryDocument).mockImplementation(
			() =>
				new Promise((resolve) => {
					open = resolve
				}),
		)
		const { wrapper } = createQueryTestWrapper()
		render(boardElement(), { wrapper })

		expect(
			await screen.findByRole("region", {
				name: common("board.canvas.loading"),
			}),
		).toBeInstanceOf(HTMLElement)
		expect(
			screen.queryByRole("heading", { name: common("board.empty.title") }),
		).toBeNull()

		act(() => open(openedState()))

		expect(
			await screen.findByRole("option", { name: textNamed("First") }),
		).toBeInstanceOf(HTMLElement)
	})

	it("deletes the focused object through the session and brings it back on undo", async () => {
		await mountBoard()

		fireEvent.keyDown(focusObject("Second"), { key: "Delete" })
		expect(objectNamed("Second")).toBeNull()

		pressUndo(boardCanvas())
		expect(objectNamed("Second")).toBeInstanceOf(HTMLElement)

		pressUndo(boardCanvas(), true)
		expect(objectNamed("Second")).toBeNull()
	})

	it("undoes its own change and keeps a concurrent remote one", async () => {
		const { announce } = await mountBoard()

		fireEvent.keyDown(focusObject("Second"), { key: "Backspace" })
		announce(remoteMoveOf("first", 40))
		pressUndo(boardCanvas())

		expect(objectNamed("Second")).toBeInstanceOf(HTMLElement)
		expect((objectNamed("First") as HTMLElement).style.left).toBe("40px")
	})

	it("re-renders a remote update keeping the local zoom and tool", async () => {
		const { announce } = await mountBoard()
		fireEvent.click(toolButton("sticky"))
		fireEvent.click(
			screen.getByRole("button", { name: common("board.zoom.zoomIn") }),
		)
		const zoom = zoomLevel()

		announce(remoteMoveOf("first", 40))

		expect((objectNamed("First") as HTMLElement).style.left).toBe("40px")
		expect(zoomLevel()).toBe(zoom)
		expect(pressedTool()).toBe("sticky")
	})

	it("keeps the last good board and raises one notice when the state stops parsing", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		const { announce } = await mountBoard()

		announce(remoteBreakOf("first"))
		announce(remoteBreakOf("second"))

		expect(objectNamed("First")).toBeInstanceOf(HTMLElement)
		expect(objectNamed("Second")).toBeInstanceOf(HTMLElement)
		expect(raiseReportedFailure).toHaveBeenCalledOnce()
		expect(raiseReportedFailure).toHaveBeenCalledWith(
			{ title: common("library.failure.board.refused") },
			expect.objectContaining({ space: SPACE_ID }),
		)
	})

	it("ignores an update of another board", async () => {
		const { announce } = await mountBoard()

		announce(remoteMoveOf("first", 40), "Other.canvas")

		expect((objectNamed("First") as HTMLElement).style.left).toBe("0px")
	})

	it("holds the hand tool while Space is down and gives the previous tool back on release", async () => {
		const { rerenderBoard } = await mountBoard()
		fireEvent.click(toolButton("sticky"))

		fireEvent.keyDown(boardCanvas(), { key: " " })
		rerenderBoard()
		expect(pressedTool()).toBe("hand")

		fireEvent.keyUp(boardCanvas(), { key: " " })
		rerenderBoard()
		expect(pressedTool()).toBe("sticky")
	})

	it("acts on no board key while a text field has focus", async () => {
		await mountBoard()
		fireEvent.keyDown(focusObject("Second"), { key: "Delete" })
		const editor = startEditing("First")

		const isUndoLeftToTheField = pressUndo(editor)
		fireEvent.keyDown(editor, { key: " " })

		expect(isUndoLeftToTheField).toBe(true)
		expect(objectNamed("Second")).toBeNull()
		expect(pressedTool()).toBe("select")
	})

	it("acts on no board key outside the board", async () => {
		await mountBoard()
		fireEvent.keyDown(focusObject("Second"), { key: "Delete" })

		pressUndo(document.body)
		fireEvent.keyDown(document.body, { key: " " })

		expect(objectNamed("Second")).toBeNull()
		expect(pressedTool()).toBe("select")
	})

	it("leaves the tab chords working with focus in the board", async () => {
		const tabs = {
			openEmptyTab: vi.fn(),
			closeActive: vi.fn(),
			reopenClosed: vi.fn(),
		}
		const host = fakeHost()
		const TabbedBoard = () => {
			useTabKeys(tabs as unknown as WorkspaceTabs)
			return boardElement()
		}
		const { wrapper } = createQueryTestWrapper()
		render(createElement(TabbedBoard), { wrapper })
		await screen.findByRole("option", { name: textNamed("First") })
		const object = focusObject("First")

		fireEvent.keyDown(object, { key: "t", metaKey: true })
		fireEvent.keyDown(object, { key: "w", metaKey: true })
		fireEvent.keyDown(object, { key: "t", metaKey: true, shiftKey: true })

		expect(tabs.openEmptyTab).toHaveBeenCalledOnce()
		expect(tabs.closeActive).toHaveBeenCalledOnce()
		expect(tabs.reopenClosed).toHaveBeenCalledOnce()
		expect(objectNamed("First")).toBeInstanceOf(HTMLElement)
		expect(host.unlisten).not.toHaveBeenCalled()
	})

	it("sends a local edit to the host batched, and the pending one on unmount before destroying its doc", async () => {
		const { unmount, unlisten } = await mountBoard()
		const destroyed = vi.spyOn(Y.Doc.prototype, "destroy")

		fireEvent.keyDown(focusObject("Second"), { key: "Delete" })
		expect(applyLibraryUpdate).not.toHaveBeenCalled()
		unmount()

		await waitFor(() => expect(applyLibraryUpdate).toHaveBeenCalledOnce())
		expect(vi.mocked(applyLibraryUpdate).mock.calls[0]?.slice(0, 2)).toEqual([
			SPACE_ID,
			NAME,
		])
		expect(unlisten).toHaveBeenCalled()
		expect(destroyed).toHaveBeenCalledOnce()
	})

	it("raises a notice and reloads the board when the host refuses an update", async () => {
		await mountBoard()
		vi.mocked(applyLibraryUpdate).mockRejectedValue({ kind: "tooLarge" })

		fireEvent.keyDown(focusObject("Second"), { key: "Delete" })

		await waitFor(() =>
			expect(raiseReportedFailure).toHaveBeenCalledWith(
				{ title: common("library.failure.board.save") },
				expect.objectContaining({ raisedIn: "use-library-board-session" }),
			),
		)
		await waitFor(() =>
			expect(objectNamed("Second")).toBeInstanceOf(HTMLElement),
		)
		expect(openLibraryDocument).toHaveBeenCalledTimes(2)
	})

	it("destroys the replaced session's doc on reload and edits on the new one", async () => {
		await mountBoard()
		const destroyed = vi.spyOn(Y.Doc.prototype, "destroy")
		vi.mocked(applyLibraryUpdate).mockRejectedValueOnce({ kind: "tooLarge" })
		fireEvent.keyDown(focusObject("Second"), { key: "Delete" })
		await waitFor(() =>
			expect(objectNamed("Second")).toBeInstanceOf(HTMLElement),
		)

		fireEvent.keyDown(focusObject("Second"), { key: "Delete" })

		expect(destroyed).toHaveBeenCalledOnce()
		expect(objectNamed("Second")).toBeNull()
	})
})
