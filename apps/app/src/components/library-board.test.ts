// @vitest-environment happy-dom

import type { Event } from "@tauri-apps/api/event"
import {
	act,
	cleanup,
	createEvent,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as Y from "yjs"

import type { Board } from "@workspace/shared/board/board"
import type { BoardTool } from "@workspace/ui/components/board/board-dock"
import { hueTone } from "@workspace/ui/components/hue-palette"
import { i18n } from "@workspace/ui/lib/i18n"

import { LibraryBoard } from "@/components/library-board"
import {
	type Bot,
	LIBRARY_DOCUMENT_UPDATED_EVENT,
	type LibraryBoardSummary,
	type LibraryDocumentPresence,
	type LibraryDocumentState,
	type LibraryDocumentUpdated,
	type LibraryItem,
	type LibraryWriter,
} from "@/lib/bindings"
import { raiseReportedFailure } from "@/lib/failure-report"
import { invoke, listen } from "@/lib/host"
import { takesPress } from "@/lib/host/fake-window-drag"
import {
	boardStateOf,
	TWO_NOTES_BOARD,
} from "@/lib/library/library-board-fixtures"
import { applyLibraryBoardIntent } from "@/lib/library/library-board-intents"
import { base64Of, bytesOf } from "@/lib/library/library-document-session"
import { LIBRARY_DOCUMENT_PRESENCE_EVENT } from "@/lib/library/library-document-writers"
import { applyLibraryUpdate } from "@/lib/library/library-document-writes"
import { readLinkPreview } from "@/lib/library/library-link-preview"
import {
	importLibraryFile,
	importLibraryUrl,
	openLibraryDocument,
	readLibraryDocument,
	readLibraryItems,
} from "@/lib/library/library-reads"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { useTabKeys } from "@/lib/tabs/use-tab-keys"
import type { WorkspaceTabs } from "@/lib/tabs/workspace-tabs"

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	listen: vi.fn(),
	invoke: vi.fn(),
	currentWindowLabel: () => OWN_WINDOW,
	usesCommandKey: () => true,
}))

vi.mock("@/lib/library/library-reads", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/library/library-reads")>()),
	openLibraryDocument: vi.fn(),
	importLibraryUrl: vi.fn(),
	importLibraryFile: vi.fn(),
	readLibraryItems: vi.fn(),
	readLibraryDocument: vi.fn(),
}))

vi.mock("@/lib/host/tauri", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/tauri")>()),
	convertFileSrc: (path: string) => `asset://${path}`,
}))

vi.mock("@/lib/library/library-link-preview", () => ({
	readLinkPreview: vi.fn(),
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
const OWN_WINDOW = "main"
const ATLAS_ID = "bot-atlas"
const JUNIPER_ID = "bot-juniper"
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
	let heardPresence: ((event: Event<LibraryDocumentPresence>) => void) | null =
		null
	vi.mocked(listen).mockImplementation(async (event, handler) => {
		if (event === LIBRARY_DOCUMENT_UPDATED_EVENT) {
			heard = (update) => handler(update as Parameters<typeof handler>[0], null)
		}
		if (event === LIBRARY_DOCUMENT_PRESENCE_EVENT) {
			heardPresence = (presence) =>
				handler(presence as Parameters<typeof handler>[0], null)
		}
		return unlisten
	})
	vi.mocked(openLibraryDocument).mockImplementation(async () => openedState())
	vi.mocked(readLibraryItems).mockResolvedValue(LIBRARY_ITEMS)
	vi.mocked(readLibraryDocument).mockImplementation(async (_spaceId, name) => ({
		name,
		format: "markdown",
		content: "Agenda",
	}))
	vi.mocked(applyLibraryUpdate).mockResolvedValue(null)
	vi.mocked(invoke).mockResolvedValue(null)
	const announce = (update: string, name = NAME) =>
		act(() =>
			heard?.({
				event: LIBRARY_DOCUMENT_UPDATED_EVENT,
				id: 0,
				payload: { spaceId: SPACE_ID, name, update },
			}),
		)
	const announcePresence = (writers: LibraryWriter[]) =>
		act(() =>
			heardPresence?.({
				event: LIBRARY_DOCUMENT_PRESENCE_EVENT,
				id: 0,
				payload: { spaceId: SPACE_ID, name: NAME, writers },
			}),
		)
	return { unlisten, announce, announcePresence }
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
			() => ({ kind: "person", id: "remote-person" }),
		),
	)

const remoteBreakOf = (id: string) =>
	remoteEditOf((doc) =>
		doc.getMap<Y.Map<unknown>>("nodes").get(id)?.set("x", "unreadable"),
	)

const unparsableState = () => {
	const doc = new Y.Doc()
	Y.applyUpdate(doc, bytesOf(STATE))
	doc.getMap<Y.Map<unknown>>("nodes").get("first")?.set("x", "unreadable")
	return base64Of(Y.encodeStateAsUpdate(doc))
}

const undecodableState = () => base64Of(Uint8Array.of(255, 255, 255, 255))

const listedItemOf = (
	name: string,
	kind: LibraryItem["kind"],
): LibraryItem => ({
	name,
	kind,
	path: `/library/${name}`,
	bytes: 1_024,
	modifiedAt: 0,
	createdAt: null,
})

const LIBRARY_ITEMS: LibraryItem[] = [
	listedItemOf("cover.png", "image"),
	listedItemOf("Notes.md", "document"),
	listedItemOf(NAME, "board"),
]

const BOTS = [
	{ id: ATLAS_ID, name: "Atlas", avatarBlot: 210, avatarImagePath: null },
	{ id: JUNIPER_ID, name: "Juniper", avatarBlot: 130, avatarImagePath: null },
] as Bot[]

type BoardElementOptions = {
	onBack?: () => void
	name?: string
	summary?: LibraryBoardSummary
	isJoined?: boolean
}

const boardElement = ({
	onBack = vi.fn(),
	name = NAME,
	summary = SUMMARY,
	isJoined = false,
}: BoardElementOptions = {}) =>
	createElement(LibraryBoard, {
		spaceId: SPACE_ID,
		isJoined,
		bots: BOTS,
		name,
		title: "Roadmap",
		summary,
		onBack,
		onDelete: vi.fn(),
	})

const mountBoardOpening = (opening: () => Promise<LibraryDocumentState>) => {
	const host = fakeHost()
	vi.mocked(openLibraryDocument).mockImplementation(opening)
	const onBack = vi.fn()
	const { wrapper } = createQueryTestWrapper()
	render(boardElement({ onBack }), { wrapper })
	return { ...host, onBack }
}

const unreadableCard = () =>
	screen.findByRole("group", {
		name: common("library.tab.unavailable.unreadable.title", { name: NAME }),
	})

const closeUnreadableCard = () =>
	fireEvent.click(
		screen.getByRole("button", {
			name: common("library.tab.unavailable.unreadable.action"),
		}),
	)

const expectNeitherSkeletonNorEmptyHint = () => {
	expect(
		screen.queryByRole("region", { name: common("board.canvas.loading") }),
	).toBeNull()
	expect(
		screen.queryByRole("heading", { name: common("board.empty.title") }),
	).toBeNull()
}

type MountedBoardOptions = {
	isJoined?: boolean
}

const mountBoardWith = async ({ isJoined }: MountedBoardOptions) => {
	const host = fakeHost()
	const { wrapper } = createQueryTestWrapper()
	const mounted = render(boardElement({ isJoined }), { wrapper })
	await screen.findByRole("option", { name: textNamed("First") })
	return {
		...host,
		...mounted,
		rerenderBoard: () => mounted.rerender(boardElement({ isJoined })),
	}
}

const mountBoard = () => mountBoardWith({})

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

const CANVAS_SIZE = { width: 1200, height: 800 }
const NOTES_CENTRE = { x: 250, y: 50 }

const onScreen = (x: number, y: number) => ({
	clientX: x + CANVAS_SIZE.width / 2 - NOTES_CENTRE.x,
	clientY: y + CANVAS_SIZE.height / 2 - NOTES_CENTRE.y,
})

beforeEach(() => {
	vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
		CANVAS_SIZE.width,
	)
	vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(
		CANVAS_SIZE.height,
	)
})

afterEach(() => {
	cleanup()
	vi.mocked(listen).mockReset()
	vi.mocked(invoke).mockReset()
	vi.mocked(openLibraryDocument).mockReset()
	vi.mocked(applyLibraryUpdate).mockReset()
	vi.mocked(raiseReportedFailure).mockReset()
	vi.mocked(readLinkPreview).mockReset()
	vi.mocked(importLibraryUrl).mockReset()
	vi.mocked(importLibraryFile).mockReset()
	vi.mocked(readLibraryItems).mockReset()
	vi.mocked(readLibraryDocument).mockReset()
	vi.restoreAllMocks()
	vi.useRealTimers()
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

	it("floats its bar as islands over a canvas starting at the top edge, Back staying clickable", async () => {
		const { onBack } = mountBoardOpening(async () => openedState())
		await screen.findByRole("option", { name: textNamed("First") })
		const header = document.querySelector(
			'[data-slot="screen-layout-floating-header"]',
		) as HTMLElement
		const canvas = document.querySelector(
			'[data-slot="board-canvas"]',
		) as HTMLElement
		const back = within(header).getByRole("button", {
			name: common("library.document.back"),
		})

		expect(back.closest('[data-slot="header-island"]')).not.toBeNull()
		expect(canvas.closest('[data-slot="screen-layout-column"]')).toBeNull()
		expect(takesPress(header)).toBe(false)
		expect(takesPress(canvas)).toBe(true)
		expect(takesPress(back)).toBe(true)

		fireEvent.click(back)

		expect(onBack).toHaveBeenCalledOnce()
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

	it.each([
		["cannot be decoded", undecodableState],
		["cannot be parsed", unparsableState],
	])(
		"shows the board unreadable and raises one notice when its opened state %s",
		async (_, stateOf) => {
			vi.spyOn(console, "error").mockImplementation(() => undefined)
			const { announce, onBack } = mountBoardOpening(async () => ({
				name: NAME,
				update: stateOf(),
			}))

			expect(await unreadableCard()).toBeInstanceOf(HTMLElement)
			expectNeitherSkeletonNorEmptyHint()
			announce(remoteMoveOf("second", 40))

			expect(raiseReportedFailure).toHaveBeenCalledOnce()
			expect(raiseReportedFailure).toHaveBeenCalledWith(
				{ title: common("library.failure.board.open") },
				expect.objectContaining({ space: SPACE_ID }),
			)
			closeUnreadableCard()
			expect(onBack).toHaveBeenCalledOnce()
		},
	)

	it("keeps the unreadable card and its notice when the board fails to open", async () => {
		const { onBack } = mountBoardOpening(() =>
			Promise.reject({ kind: "notFound" }),
		)

		expect(await unreadableCard()).toBeInstanceOf(HTMLElement)
		expectNeitherSkeletonNorEmptyHint()

		await waitFor(() => expect(raiseReportedFailure).toHaveBeenCalledOnce())
		expect(raiseReportedFailure).toHaveBeenCalledWith(
			{ title: common("library.failure.board.open") },
			expect.objectContaining({ raisedIn: "use-library-board-session" }),
		)
		closeUnreadableCard()
		expect(onBack).toHaveBeenCalledOnce()
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

const LINK = "https://example.com/article"

const linkObject = (text: string) =>
	screen.queryByRole("option", {
		name: common("board.object.named", {
			kind: common("board.object.kind.link"),
			text,
		}),
	})

const imageObject = () =>
	screen.queryByRole("option", { name: common("board.object.kind.image") })

const placementOf = (object: HTMLElement | null | undefined) => ({
	left: object?.style.left,
	top: object?.style.top,
})

const libraryItemOf = (name: string, kind: LibraryItem["kind"]) =>
	({ name, kind }) as LibraryItem

const pasteOn = (clipboardData: object) =>
	fireEvent.paste(boardCanvas(), { clipboardData })

const pastedLink = (url: string) => ({
	files: [],
	getData: () => url,
})

const importedNames = () =>
	vi.mocked(importLibraryFile).mock.calls.map(([, name]) => name)

const imageFile = (name: string) =>
	new File(["bytes"], name, { type: "image/png" })

const libraryTool = () =>
	screen
		.getAllByRole("button")
		.find((button) => button.dataset.tool === "library") as HTMLElement

type ClientPoint = { clientX: number; clientY: number }

const dropAt = (dataTransfer: object, at: ClientPoint) => {
	const drop = createEvent.drop(boardCanvas(), { dataTransfer })
	Object.defineProperties(drop, {
		clientX: { value: at.clientX },
		clientY: { value: at.clientY },
	})
	fireEvent(boardCanvas(), drop)
}

const dropFilesAt = (files: File[], at: ClientPoint) =>
	dropAt({ types: ["Files"], files }, at)

const dropUrlAt = (url: string, at: ClientPoint) =>
	dropAt({ types: ["text/uri-list"], files: [], getData: () => url }, at)

const DROP_POINT = onScreen(300, 200)

type WordedReason = "url.unsupportedScheme" | "url.tooLarge" | "unwritable"

const importFailureOf = (url: string, reason: WordedReason) => ({
	title: common("library.failure.import.title", { name: url }),
	description: common(`library.failure.import.${reason}`),
})

const openPicker = () => fireEvent.click(libraryTool())

const pickerTile = (title: string) =>
	screen.getByRole("button", { name: title })

describe("adding to a Library board", () => {
	it("lists the Library items in the dock picker", async () => {
		await mountBoard()

		openPicker()

		expect(pickerTile("cover.png")).toBeInstanceOf(HTMLElement)
		expect(pickerTile("Notes")).toBeInstanceOf(HTMLElement)
	})

	it("leaves the open board out of its own dock picker", async () => {
		await mountBoard()

		openPicker()

		expect(screen.queryByRole("button", { name: "Roadmap" })).toBeNull()
	})

	it("adds a picked Library image as an image at the centre of the visible board", async () => {
		await mountBoard()
		openPicker()

		fireEvent.click(pickerTile("cover.png"))

		expect(placementOf(imageObject())).toEqual({
			left: "140px",
			top: "-23px",
		})
	})

	it("adds a picked Library document as a library card pointing at it", async () => {
		await mountBoard()
		openPicker()

		fireEvent.click(pickerTile("Notes"))

		expect(linkObject("Notes.md")).toBeInstanceOf(HTMLElement)
	})

	it("adds a pasted link as a link card, titled once the preview answers", async () => {
		let answer: (preview: { url: string; title: string }) => void = () =>
			undefined
		vi.mocked(readLinkPreview).mockImplementation(
			() =>
				new Promise((resolve) => {
					answer = resolve
				}),
		)
		await mountBoard()

		pasteOn(pastedLink(LINK))
		expect(linkObject(LINK)).toBeInstanceOf(HTMLElement)

		act(() => answer({ url: LINK, title: "An article" }))

		expect(
			await screen.findByRole("option", { name: /An article/ }),
		).toBeInstanceOf(HTMLElement)
		expect(linkObject(LINK)).toBeNull()
		expect(readLinkPreview).toHaveBeenCalledWith(LINK)
	})

	it("keeps the link card with its URL alone when the preview fails", async () => {
		vi.mocked(readLinkPreview).mockResolvedValue({ url: LINK, title: "" })
		await mountBoard()

		pasteOn(pastedLink(LINK))
		await act(() => Promise.resolve())

		expect(linkObject(LINK)).toBeInstanceOf(HTMLElement)
	})

	it("selects the link card a paste created", async () => {
		vi.mocked(readLinkPreview).mockResolvedValue({ url: LINK, title: "" })
		await mountBoard()

		pasteOn(pastedLink(LINK))

		await waitFor(() =>
			expect(linkObject(LINK)?.getAttribute("aria-selected")).toBe("true"),
		)
	})

	it("imports a pasted image into the Library first, then adds it at the paste point", async () => {
		vi.mocked(importLibraryFile).mockResolvedValue(
			libraryItemOf("pasted.png", "image"),
		)
		await mountBoard()

		pasteOn({ files: [imageFile("pasted.png")], getData: () => "" })

		await waitFor(() => expect(importedNames()).toEqual(["pasted.png"]))
		const image = await waitFor(() => {
			const placed = imageObject()
			expect(placed).toBeInstanceOf(HTMLElement)
			return placed
		})
		expect(placementOf(image)).toEqual({ left: "140px", top: "-23px" })
		expect(image?.getAttribute("aria-selected")).toBe("true")
	})

	it("adds one object per imported dropped file side by side, and nothing for a failed one", async () => {
		vi.mocked(importLibraryFile).mockImplementation(async (_spaceId, name) => {
			if (name === "broken.png") {
				throw { kind: "unwritable" }
			}
			return libraryItemOf(name, name.endsWith(".png") ? "image" : "document")
		})
		await mountBoard()
		const dropped = [
			imageFile("first.png"),
			imageFile("broken.png"),
			new File(["text"], "Brief.pdf"),
		]

		dropFilesAt(dropped, DROP_POINT)

		await waitFor(() =>
			expect(importedNames()).toEqual(["first.png", "broken.png", "Brief.pdf"]),
		)
		await waitFor(() =>
			expect(linkObject("Brief.pdf")).toBeInstanceOf(HTMLElement),
		)
		expect(placementOf(imageObject())).toEqual({
			left: "190px",
			top: "127px",
		})
		expect(placementOf(linkObject("Brief.pdf"))).toEqual({
			left: "442px",
			top: "135px",
		})
		expect(screen.getAllByRole("option")).toHaveLength(4)
	})

	it("imports a dropped image link into the Library and adds it centred on the drop point", async () => {
		vi.mocked(importLibraryUrl).mockResolvedValue(
			libraryItemOf("photo.png", "image"),
		)
		await mountBoard()
		const listingsBeforeDrop = vi.mocked(readLibraryItems).mock.calls.length

		dropUrlAt(LINK, DROP_POINT)

		const image = await waitFor(() => {
			const placed = imageObject()
			expect(placed).toBeInstanceOf(HTMLElement)
			return placed
		})
		expect(importLibraryUrl).toHaveBeenCalledWith(SPACE_ID, LINK)
		expect(placementOf(image)).toEqual({ left: "190px", top: "127px" })
		await waitFor(() =>
			expect(vi.mocked(readLibraryItems).mock.calls.length).toBeGreaterThan(
				listingsBeforeDrop,
			),
		)
	})

	it("adds a dropped page link as a link card at the drop point, titled once the preview answers", async () => {
		vi.mocked(importLibraryUrl).mockRejectedValue({ kind: "notAnImage" })
		vi.mocked(readLinkPreview).mockResolvedValue({
			url: LINK,
			title: "An article",
		})
		await mountBoard()

		dropUrlAt(LINK, DROP_POINT)

		const card = await screen.findByRole("option", { name: /An article/ })
		expect(placementOf(card)).toEqual({ left: "150px", top: "111px" })
		expect(readLinkPreview).toHaveBeenCalledWith(LINK)
		expect(raiseReportedFailure).not.toHaveBeenCalled()
	})

	it("refuses a dropped link that is not http or https without asking the host", async () => {
		const url = "ftp://example.com/photo.png"
		await mountBoard()

		dropUrlAt(url, DROP_POINT)

		await waitFor(() =>
			expect(raiseReportedFailure).toHaveBeenCalledWith(
				importFailureOf(url, "url.unsupportedScheme"),
				expect.anything(),
			),
		)
		expect(importLibraryUrl).not.toHaveBeenCalled()
		expect(screen.getAllByRole("option")).toHaveLength(2)
	})

	it.each([
		["too large", { kind: "tooLarge", limit: 10 }, "url.tooLarge"],
		[
			"unwritable",
			{ kind: "library", error: { kind: "unwritable" } },
			"unwritable",
		],
	] as const)(
		"adds nothing and words the failure when a dropped link is %s",
		async (_case, refusal, reason) => {
			vi.mocked(importLibraryUrl).mockRejectedValue(refusal)
			await mountBoard()

			dropUrlAt(LINK, DROP_POINT)

			await waitFor(() =>
				expect(raiseReportedFailure).toHaveBeenCalledWith(
					importFailureOf(LINK, reason),
					expect.anything(),
				),
			)
			expect(screen.getAllByRole("option")).toHaveLength(2)
		},
	)

	it("adds a Library item picked on the second of two boards to that board, at its point", async () => {
		fakeHost()
		const { wrapper } = createQueryTestWrapper()
		render(boardElement(), { wrapper })
		const second = render(
			boardElement({
				name: "Sketches.canvas",
			}),
			{ wrapper },
		)
		const secondBoard = within(second.container)
		await secondBoard.findByRole("option", { name: textNamed("First") })

		fireEvent.click(
			secondBoard
				.getAllByRole("button")
				.find((button) => button.dataset.tool === "library") as HTMLElement,
		)
		fireEvent.click(pickerTile("cover.png"))

		const image = secondBoard.getByRole("option", {
			name: common("board.object.kind.image"),
		})
		expect(placementOf(image)).toEqual({ left: "140px", top: "-23px" })
		expect(
			screen.getAllByRole("option", {
				name: common("board.object.kind.image"),
			}),
		).toHaveLength(1)
	})

	it("ends the connection when another dock tool is picked", async () => {
		await mountBoard()
		const flyout = () =>
			screen.queryByRole("radiogroup", {
				name: common("board.connectorFlyout.label"),
			})

		fireEvent.click(toolButton("connector"))
		expect(flyout()).toBeInstanceOf(HTMLElement)

		fireEvent.click(toolButton("sticky"))
		expect(flyout()).toBeNull()
	})
})

const atColumn = (column: number, z: string) => ({
	x: column * 260,
	y: 0,
	width: 220,
	height: 146,
	z,
})

const PREVIEW = "https://example.com/og.png"

const KINDS_BOARD: Board = {
	nodes: {
		idea: {
			...atColumn(0, "a0"),
			kind: "sticky",
			text: "Idea",
			fill: "pink",
			author: { kind: "person", id: "person-a" },
		},
		title: { ...atColumn(1, "a1"), kind: "text", text: "Title" },
		box: { ...atColumn(2, "a2"), kind: "shape", text: "Box", shape: "ellipse" },
		cover: {
			...atColumn(3, "a3"),
			kind: "image",
			file: "Library/cover.png",
			item: "cover.png",
			alt: "The cover",
		},
		notes: {
			...atColumn(0, "a4"),
			y: 300,
			kind: "libraryCard",
			file: "Library/Notes.md",
			item: "Notes.md",
		},
		article: {
			...atColumn(1, "a5"),
			y: 300,
			kind: "linkCard",
			url: "https://www.example.com/article",
			title: "An article",
			description: "What it says",
			preview: PREVIEW,
		},
		bare: {
			...atColumn(2, "a6"),
			y: 300,
			kind: "linkCard",
			url: LINK,
		},
	},
	edges: {},
}

const mountKindsBoard = async () => {
	fakeHost()
	vi.mocked(openLibraryDocument).mockImplementation(async () => ({
		name: NAME,
		update: boardStateOf(KINDS_BOARD),
	}))
	const { wrapper } = createQueryTestWrapper()
	render(boardElement(), { wrapper })
	await screen.findByRole("option", { name: textNamed("Title") })
}

type ObjectKind = "sticky" | "text" | "shape" | "image" | "link"

const namedObject = (kind: ObjectKind, text: string) =>
	screen.getByRole("option", {
		name: common("board.object.named", {
			kind: common(`board.object.kind.${kind}`),
			text,
		}),
	})

const slotIn = (object: HTMLElement, slot: string) =>
	object.querySelector<HTMLElement>(`[data-slot="${slot}"]`)

describe("drawing the objects of a Library board", () => {
	it("draws sticky, text and shape nodes as board shapes, as before", async () => {
		await mountKindsBoard()

		const drawnAsShapes: [ObjectKind, string][] = [
			["sticky", "Idea"],
			["text", "Title"],
			["shape", "Box"],
		]
		for (const [kind, text] of drawnAsShapes) {
			expect(slotIn(namedObject(kind, text), "board-shape")).toBeInstanceOf(
				HTMLElement,
			)
		}
	})

	it("draws an image node as a board image with its Library source, alt text and size", async () => {
		await mountKindsBoard()

		const image = slotIn(
			namedObject("image", "The cover"),
			"board-image",
		) as HTMLImageElement

		expect(image.getAttribute("src")).toBe("asset:///library/cover.png")
		expect(image.alt).toBe("The cover")
		expect({ width: image.style.width, height: image.style.height }).toEqual({
			width: "220px",
			height: "146px",
		})
	})

	it("draws a library card node with the title and excerpt of its item", async () => {
		await mountKindsBoard()

		const card = namedObject("link", "Notes.md")

		expect(slotIn(card, "board-library-card")).toBeInstanceOf(HTMLElement)
		expect(slotIn(card, "board-library-card-title")?.textContent).toBe("Notes")
		expect(slotIn(card, "board-library-card-excerpt")?.textContent).toBe(
			"Agenda",
		)
	})

	it("draws a link card node with its title, description, preview and domain", async () => {
		await mountKindsBoard()

		const card = namedObject("link", "An article")

		expect(slotIn(card, "board-link-card")).toBeInstanceOf(HTMLElement)
		expect(slotIn(card, "board-link-card-title")?.textContent).toBe(
			"An article",
		)
		expect(slotIn(card, "board-link-card-description")?.textContent).toBe(
			"What it says",
		)
		expect(slotIn(card, "board-link-card-preview")?.getAttribute("src")).toBe(
			PREVIEW,
		)
		expect(slotIn(card, "board-link-card-source")?.textContent).toContain(
			"www.example.com",
		)
	})

	it("draws a bare link card with its URL as the title and no description", async () => {
		await mountKindsBoard()

		const card = namedObject("link", LINK)

		expect(slotIn(card, "board-link-card-title")?.textContent).toBe(LINK)
		expect(slotIn(card, "board-link-card-description")?.textContent).toBe("")
		expect(slotIn(card, "board-link-card-source")?.textContent).toContain(
			"example.com",
		)
	})
})

const seatOf = (
	id: string,
	kind: LibraryWriter["kind"],
	nodeId: string | null,
	name: string | null = null,
	hue?: number,
): LibraryWriter => ({
	id,
	kind,
	name,
	hue,
	at: { kind: "board", point: { x: 40, y: 20 }, nodeId },
})

const pointerNames = () =>
	[...document.querySelectorAll('[data-slot="board-pointer-name"]')].map(
		(pointer) => pointer.textContent,
	)

const outlinedTexts = () =>
	[...document.querySelectorAll('[data-slot="board-object-outline"]')].map(
		(outline) => outline.textContent,
	)

const drawingChip = (count: number) =>
	screen.queryByText(common("board.presence.drawing", { count }))

const stopAllButton = () =>
	screen.getByRole("button", {
		name: common("library.document.agents.stopAll"),
	})

const presenceStyleOf = (slot: string) =>
	(document.querySelector(`[data-slot="${slot}"]`) as HTMLElement).style

const presenceInkOf = (slot: string) =>
	presenceStyleOf(slot).getPropertyValue("--board-presence")

const hueAccentOf = (slot: string) =>
	presenceStyleOf(slot).getPropertyValue("--hue-light-accent")

const stopCalls = () =>
	vi
		.mocked(invoke)
		.mock.calls.filter(([command]) => command === "library_stop_writers")

describe("presence on a Library board", () => {
	it("shows another person's pointer with their name and outlines the object they selected", async () => {
		const { announcePresence } = await mountBoard()

		announcePresence([seatOf("window-2", "person", "first", "Lena")])

		expect(pointerNames()).toEqual(["Lena"])
		expect(outlinedTexts()).toEqual(["First"])
		expect(drawingChip(1)).toBeNull()
	})

	it("never shows the own window's pointer or selection", async () => {
		const { announcePresence } = await mountBoard()

		announcePresence([seatOf(OWN_WINDOW, "person", "first", "Me")])

		expect(pointerNames()).toEqual([])
		expect(outlinedTexts()).toEqual([])
	})

	it("shows each drawing agent's pointer, outline and the drawing chip with their count", async () => {
		const { announcePresence } = await mountBoard()

		announcePresence([
			seatOf(ATLAS_ID, "agent", "first"),
			seatOf(JUNIPER_ID, "agent", "second"),
		])

		expect(pointerNames()).toEqual(["Atlas", "Juniper"])
		expect(outlinedTexts()).toEqual(["First", "Second"])
		expect(drawingChip(2)).toBeInstanceOf(HTMLElement)
	})

	it("removes the chip, pointers and outlines once the agents are gone", async () => {
		const { announcePresence } = await mountBoard()

		announcePresence([seatOf(ATLAS_ID, "agent", "first")])
		announcePresence([])

		expect(drawingChip(1)).toBeNull()
		expect(pointerNames()).toEqual([])
		expect(outlinedTexts()).toEqual([])
	})

	it("stops every agent drawing on the board on Stop all", async () => {
		const { announcePresence } = await mountBoard()
		vi.mocked(invoke).mockResolvedValue({ kind: "cancelled" })
		announcePresence([
			seatOf(ATLAS_ID, "agent", "first"),
			seatOf(JUNIPER_ID, "agent", "second"),
		])

		fireEvent.click(stopAllButton())

		await waitFor(() =>
			expect(stopCalls()).toEqual([
				[
					"library_stop_writers",
					{ spaceId: SPACE_ID, name: NAME, agentId: null },
				],
			]),
		)
		expect(raiseReportedFailure).not.toHaveBeenCalled()
	})

	it("draws a person's pointer and outline in the hue their presence carries", async () => {
		const { announcePresence } = await mountBoard()

		announcePresence([seatOf("window-2", "person", "first", "Lena", 210)])

		const accent = hueTone(210, "light", "accent").hex
		expect(presenceInkOf("board-pointer")).toBe(accent)
		expect(presenceInkOf("board-object-outline")).toBe(accent)
	})

	it("leaves a person with no hue untinted", async () => {
		const { announcePresence } = await mountBoard()

		announcePresence([seatOf("window-2", "person", "first", "Lena")])

		expect(hueAccentOf("board-pointer")).toBe("")
		expect(hueAccentOf("board-object-outline")).toBe("")
	})

	it("raises the board notice when Stop all fails", async () => {
		const { announcePresence } = await mountBoard()
		vi.mocked(invoke).mockRejectedValue({ kind: "unreachable" })
		announcePresence([seatOf(ATLAS_ID, "agent", "first")])

		fireEvent.click(stopAllButton())

		await waitFor(() =>
			expect(raiseReportedFailure).toHaveBeenCalledWith(
				{ title: common("library.failure.board.stopAll") },
				expect.objectContaining({ raisedIn: "use-stop-library-writers" }),
			),
		)
	})
})

const sharedSeats = () =>
	vi
		.mocked(invoke)
		.mock.calls.filter(([command]) => command === "library_share_presence")
		.map(([, args]) => (args as { at: unknown }).at)

const seatAt = (x: number, y: number, nodeId: string | null = null) => ({
	kind: "board",
	point: { x, y },
	nodeId,
})

const movePointer = (x: number, y: number) =>
	fireEvent.pointerMove(boardCanvas(), onScreen(x, y))

const leaveCanvas = () => fireEvent.pointerLeave(boardCanvas())

const waitPointerInterval = (ms = 50) =>
	act(() => {
		vi.advanceTimersByTime(ms)
	})

const mountSharingBoard = async (isJoined = false) => {
	const mounted = await mountBoardWith({ isJoined })
	vi.useFakeTimers()
	return mounted
}

describe("sharing the own pointer and selection on a Library board", () => {
	it("shares the pointer at most once every 50 ms and always sends the last position", async () => {
		const { rerenderBoard } = await mountSharingBoard()

		movePointer(10, 20)
		movePointer(11, 21)
		rerenderBoard()
		movePointer(12, 22)
		expect(sharedSeats()).toEqual([seatAt(10, 20)])

		await waitPointerInterval(49)
		expect(sharedSeats()).toEqual([seatAt(10, 20)])

		await waitPointerInterval(1)
		expect(sharedSeats()).toEqual([seatAt(10, 20), seatAt(12, 22)])

		await waitPointerInterval(200)
		expect(sharedSeats()).toHaveLength(2)
	})

	it("shares a selection at once with the last pointer position, outside the throttle", async () => {
		await mountSharingBoard()
		movePointer(10, 20)
		movePointer(30, 40)

		focusObject("First")

		expect(sharedSeats()).toEqual([seatAt(10, 20), seatAt(30, 40, "first")])
		await waitPointerInterval(200)
		expect(sharedSeats()).toHaveLength(2)
	})

	it("shares no position once the pointer leaves with nothing selected", async () => {
		await mountSharingBoard()
		movePointer(10, 20)

		leaveCanvas()
		await waitPointerInterval()

		expect(sharedSeats()).toEqual([seatAt(10, 20), null])
	})

	it("keeps the seat at the last position with the selected object once the pointer leaves", async () => {
		await mountSharingBoard()
		movePointer(10, 20)
		focusObject("First")

		leaveCanvas()
		await waitPointerInterval()

		expect(sharedSeats().at(-1)).toEqual(seatAt(10, 20, "first"))
	})

	it("shares no position once on unmount and nothing after", async () => {
		const { unmount } = await mountSharingBoard()
		movePointer(10, 20)
		movePointer(30, 40)

		unmount()
		await waitPointerInterval(200)

		expect(sharedSeats()).toEqual([seatAt(10, 20), null])
	})

	it("shares nothing on unmount when the pointer never reached the board", async () => {
		const { unmount } = await mountSharingBoard()

		unmount()

		expect(sharedSeats()).toEqual([])
	})

	it("saves a board edit on its own schedule while a pointer share waits", async () => {
		const { unmount } = await mountSharingBoard()
		movePointer(10, 20)
		movePointer(30, 40)

		fireEvent.keyDown(focusObject("Second"), { key: "Delete" })
		unmount()

		await vi.waitFor(() => expect(applyLibraryUpdate).toHaveBeenCalledOnce())
		expect(sharedSeats()).toEqual([
			seatAt(10, 20),
			seatAt(30, 40, "second"),
			seatAt(30, 40),
			null,
		])
	})

	it("logs a failed share without a notice", async () => {
		await mountSharingBoard()
		const logged = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		vi.mocked(invoke).mockRejectedValue({ kind: "unreachable" })

		movePointer(10, 20)
		await act(() => Promise.resolve())

		expect(logged).toHaveBeenCalledWith(
			"library: the board pointer could not be shared",
			{ kind: "unreachable" },
		)
		expect(raiseReportedFailure).not.toHaveBeenCalled()
	})

	it("shares the pointer the same way in a joined Space", async () => {
		await mountSharingBoard(true)

		movePointer(10, 20)

		expect(vi.mocked(invoke)).toHaveBeenCalledWith("library_share_presence", {
			spaceId: SPACE_ID,
			name: NAME,
			at: seatAt(10, 20),
		})
	})
})
