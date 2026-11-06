// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as Y from "yjs"

import {
	DOCUMENT_PANEL_MAX_WIDTH,
	DOCUMENT_PANEL_MIN_WIDTH,
	THREAD_MIN_WIDTH,
} from "@workspace/ui/components/document-panel"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	ThreadBoardPanel,
	ThreadDocumentPanel,
	ThreadDocumentsContext,
	ThreadOpenedItemPanel,
} from "@/components/thread-documents"
import { accountQueryKeys } from "@/lib/account/account-query-keys"
import type { Bot, LibraryItem, LibraryWriter } from "@/lib/bindings"
import type { HostEventCallback } from "@/lib/host/joined-hosts-listen"
import {
	boardStateOf,
	TWO_NOTES_BOARD,
} from "@/lib/library/library-board-fixtures"
import { base64Of } from "@/lib/library/library-document-session"
import { LIBRARY_DOCUMENT_PRESENCE_EVENT } from "@/lib/library/library-document-writers"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

type LibraryCall = { spaceId: string; name: string }

const libraryHost = vi.hoisted(() => ({
	answers: new Map<string, (call: LibraryCall) => unknown>(),
	invoked: [] as [string, unknown][],
	listeners: new Map<string, Set<HostEventCallback<unknown>>>(),
}))

vi.mock("@/lib/host", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/host")>()
	const invoke = (async <T>(...call: Parameters<typeof actual.invoke>) => {
		const [command, args] = call
		libraryHost.invoked.push([command, args])
		const answer = libraryHost.answers.get(command)
		if (!answer) {
			throw new Error(`no fake answer for ${command}`)
		}
		return answer(args as LibraryCall) as T
	}) as typeof actual.invoke
	const listen: typeof actual.listen = async (event, handler) => {
		const heard = libraryHost.listeners.get(event) ?? new Set()
		heard.add(handler as HostEventCallback<unknown>)
		libraryHost.listeners.set(event, heard)
		return () => {
			heard.delete(handler as HostEventCallback<unknown>)
		}
	}
	return {
		...actual,
		invoke,
		listen,
		currentWindowLabel: () => OWN_WINDOW,
	}
})

vi.mock("@/lib/host/tauri", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/tauri")>()),
	convertFileSrc: (path: string) => `asset://${path}`,
}))

const openInItsTab = vi.hoisted(() => vi.fn())

vi.mock("@/lib/navigation/use-open-library-document", () => ({
	useOpenLibraryDocument: () => () => undefined,
	useOpenLibraryItemInItsTab: () => openInItsTab,
}))

const measuredRoom = vi.hoisted(() => ({ width: null as number | null }))

vi.mock("@workspace/ui/hooks/use-rendered-width", () => ({
	useRenderedWidth: () => measuredRoom.width,
}))

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseFailureNotice: vi.fn(),
}))

const PLAN = "plan.md"
const SPACE_ID = "space-on-screen"

const DOCUMENTS = {
	spaceId: SPACE_ID,
	isJoined: false,
	opened: null,
	open: () => undefined,
	close: () => undefined,
	boardOf: () => undefined,
}

const planItem = {
	name: PLAN,
	kind: "document",
	path: `/library/${PLAN}`,
	bytes: 10,
	modifiedAt: 0,
	createdAt: null,
}

const GALLERY_IMAGES = [
	{ name: "sofa-green.jpg", alt: "Green velvet sofa" },
	{ name: "sofa-grey.jpg", alt: "Grey linen sofa" },
]

const GALLERY_PLAN = [
	"The sofas we kept for the lobby.",
	[
		"```gallery",
		...GALLERY_IMAGES.map(({ name, alt }) => `- image: ${name}\n  alt: ${alt}`),
		"```",
	].join("\n"),
].join("\n\n")

const imageItemOf = (name: string) => ({
	...planItem,
	name,
	kind: "image",
	path: `/library/${name}`,
})

const openedStateOf = (name: string, markdown: string) => {
	const doc = new Y.Doc()
	doc.getText("markdown").insert(0, markdown)
	return { name, update: base64Of(Y.encodeStateAsUpdate(doc)) }
}

const joinedSourceOf = (name: string) => `data:image/jpeg;base64,${name}`

const renderGalleryPlan = (isJoined: boolean) =>
	render(
		createElement(
			ThreadDocumentsContext,
			{ value: { ...DOCUMENTS, isJoined } },
			createElement(ThreadDocumentPanel, {
				spaceId: SPACE_ID,
				isJoined,
				name: PLAN,
				onClose: () => undefined,
			}),
		),
		{ wrapper: createQueryTestWrapper().wrapper },
	)

const galleryIn = (root: HTMLElement) => {
	const gallery = root.querySelector<HTMLElement>(
		'[data-slot="library-document-block"][data-type="gallery"]',
	)
	if (!gallery) {
		throw new Error("No gallery block")
	}
	return gallery
}

const openGalleryIn = async (root: HTMLElement) => {
	galleryIn(root).querySelector<HTMLElement>("[tabindex]")?.focus()
	await waitFor(() => {
		if (
			!galleryIn(root).querySelector(
				'[data-slot="library-document-block-editing"]',
			)
		) {
			throw new Error("The gallery is still closed")
		}
	})
}

const expectGalleryShown = (
	root: HTMLElement,
	sourceOf: (name: string) => string,
) =>
	waitFor(() => {
		for (const { name, alt } of GALLERY_IMAGES) {
			expect(
				within(root)
					.getByRole<HTMLImageElement>("img", { name: alt })
					.getAttribute("src"),
			).toBe(sourceOf(name))
		}
	})

const panelOf = () => screen.getByRole("complementary")

describe("a gallery in a document opened from a conversation", () => {
	const imageReads: LibraryCall[] = []

	beforeEach(() => {
		libraryHost.answers.set("library_list", () => [
			planItem,
			...GALLERY_IMAGES.map(({ name }) => imageItemOf(name)),
		])
		libraryHost.answers.set("library_read_document", ({ name }) => ({
			name,
			format: "markdown",
			content: GALLERY_PLAN,
		}))
		libraryHost.answers.set("library_open_document", ({ name }) =>
			openedStateOf(name, GALLERY_PLAN),
		)
		libraryHost.answers.set("library_share_presence", () => null)
		libraryHost.answers.set("library_read_image", (call) => {
			imageReads.push(call)
			return { name: call.name, mimeType: "image/jpeg", content: call.name }
		})
	})

	afterEach(() => {
		cleanup()
		libraryHost.answers.clear()
		imageReads.length = 0
	})

	it("reads each image of a joined Space once across the closed gallery and the opened one", async () => {
		renderGalleryPlan(true)

		await expectGalleryShown(panelOf(), joinedSourceOf)
		await openGalleryIn(panelOf())
		await expectGalleryShown(galleryIn(panelOf()), joinedSourceOf)

		expect(imageReads).toEqual(
			GALLERY_IMAGES.map(({ name }) => ({ spaceId: SPACE_ID, name })),
		)
	})

	it("shows each image of the host from its Library file", async () => {
		renderGalleryPlan(false)
		const hostSourceOf = (name: string) => `asset:///library/${name}`

		await expectGalleryShown(panelOf(), hostSourceOf)
		await openGalleryIn(panelOf())
		await expectGalleryShown(galleryIn(panelOf()), hostSourceOf)

		expect(imageReads).toEqual([])
	})
})

const renderPlanPanel = () =>
	render(
		createElement(ThreadDocumentPanel, {
			spaceId: SPACE_ID,
			isJoined: false,
			name: PLAN,
			onClose: () => undefined,
		}),
		{ wrapper: createQueryTestWrapper().wrapper },
	)

const dragPanelEdgeBy = (distance: number) => {
	const handle = screen.getByRole("separator")
	const originX = 1000
	fireEvent.pointerDown(handle, { button: 0, clientX: originX })
	fireEvent.pointerMove(window, { clientX: originX + distance })
	fireEvent.pointerUp(window, { clientX: originX + distance })
}

const widthOfPanel = () => panelOf().style.width

describe("the width of a document opened beside a conversation", () => {
	beforeEach(() => {
		libraryHost.answers.set("library_list", () => [planItem])
		libraryHost.answers.set("library_read_document", ({ name }) => ({
			name,
			format: "markdown",
			content: "# Plan",
		}))
		libraryHost.answers.set("library_open_document", ({ name }) =>
			openedStateOf(name, "# Plan"),
		)
		libraryHost.answers.set("library_share_presence", () => null)
	})

	afterEach(() => {
		cleanup()
		libraryHost.answers.clear()
		localStorage.clear()
		measuredRoom.width = null
	})

	it("opens at the widest width the panel allows when no width was ever dragged", () => {
		renderPlanPanel()

		expect(widthOfPanel()).toBe(`${DOCUMENT_PANEL_MAX_WIDTH}px`)
	})

	it("opens the next document at the width the edge was dragged to", () => {
		const keptWidth = DOCUMENT_PANEL_MAX_WIDTH - 200
		const first = renderPlanPanel()
		dragPanelEdgeBy(200)
		first.unmount()

		renderPlanPanel()

		expect(widthOfPanel()).toBe(`${keptWidth}px`)
	})

	describe("in a room narrower than the widest panel and the thread", () => {
		const reachableWidth = DOCUMENT_PANEL_MIN_WIDTH + 100

		beforeEach(() => {
			measuredRoom.width = THREAD_MIN_WIDTH + reachableWidth
		})

		it("opens at the widest width the room allows when no width was ever dragged", () => {
			renderPlanPanel()

			expect(widthOfPanel()).toBe(`${reachableWidth}px`)
		})

		it("keeps the width the panel reached when the edge is dragged past it", () => {
			const first = renderPlanPanel()
			dragPanelEdgeBy(-DOCUMENT_PANEL_MAX_WIDTH)
			first.unmount()
			measuredRoom.width = null

			renderPlanPanel()

			expect(widthOfPanel()).toBe(`${reachableWidth}px`)
		})
	})
})

const common = i18n.getFixedT(null, "common")

const LAUNCH_BOARD = "Launch week.canvas"

const launchBoardItem: LibraryItem = {
	name: LAUNCH_BOARD,
	kind: "board",
	path: `/library/${LAUNCH_BOARD}`,
	bytes: 2_048,
	modifiedAt: 0,
	createdAt: null,
}

const boardDocumentsOf = (close: () => void) => ({
	...DOCUMENTS,
	opened: { kind: "board" as const, name: LAUNCH_BOARD },
	close,
	boardOf: (name: string) =>
		name === LAUNCH_BOARD ? launchBoardItem : undefined,
})

const ATLAS_ID = "bot-atlas"
const JUNIPER_ID = "bot-juniper"

const BOTS = [
	{ id: ATLAS_ID, name: "Atlas", avatarBlot: 210, avatarImagePath: null },
	{ id: JUNIPER_ID, name: "Juniper", avatarBlot: 130, avatarImagePath: null },
] as Bot[]

const renderLaunchBoardPanel = (close: () => void = () => undefined) =>
	render(
		createElement(ThreadBoardPanel, {
			documents: boardDocumentsOf(close),
			bots: BOTS,
			name: LAUNCH_BOARD,
		}),
		{ wrapper: createQueryTestWrapper().wrapper },
	)

describe("a board opened beside a conversation", () => {
	beforeEach(() => {
		libraryHost.answers.set("library_list", () => [planItem, launchBoardItem])
		libraryHost.answers.set("library_read_document", ({ name }) => ({
			name,
			format: "markdown",
			content: "# Plan",
		}))
		libraryHost.answers.set("library_open_document", ({ name }) => ({
			name,
			update:
				name === LAUNCH_BOARD
					? boardStateOf(TWO_NOTES_BOARD)
					: openedStateOf(name, "# Plan").update,
		}))
		libraryHost.answers.set("library_board_summary", ({ name }) => ({
			name,
			nodeCount: 2,
			nodes: [],
			bounds: { x: 0, y: 0, width: 500, height: 100 },
		}))
		libraryHost.answers.set("library_share_presence", () => null)
	})

	afterEach(() => {
		cleanup()
		libraryHost.answers.clear()
		localStorage.clear()
		openInItsTab.mockClear()
	})

	it("shows the board live in the panel with its dock and zoom", async () => {
		renderLaunchBoardPanel()

		expect(
			screen.getByRole("complementary", { name: "Launch week" }),
		).toBeTruthy()
		expect(
			await screen.findByRole("application", {
				name: common("board.canvas.label"),
			}),
		).toBeTruthy()
		expect(
			screen.getByRole("button", { name: common("board.dock.tool.select") }),
		).toBeTruthy()
		expect(
			screen.getByRole("group", { name: common("board.zoom.controls") }),
		).toBeTruthy()
	})

	it("closes the panel and shows the board in its own tab on Open in tab", () => {
		const close = vi.fn()
		renderLaunchBoardPanel(close)

		fireEvent.click(
			screen.getByRole("button", { name: common("board.panel.openInTab") }),
		)

		expect(close).toHaveBeenCalledOnce()
		expect(openInItsTab).toHaveBeenCalledWith({
			kind: "board",
			name: LAUNCH_BOARD,
		})
	})

	it("opens at the width the document panel edge was dragged to", () => {
		const keptWidth = DOCUMENT_PANEL_MAX_WIDTH - 200
		const documentPanel = renderPlanPanel()
		dragPanelEdgeBy(200)
		documentPanel.unmount()

		renderLaunchBoardPanel()

		expect(widthOfPanel()).toBe(`${keptWidth}px`)
	})

	it("hands the width its edge was dragged to over to the next document", () => {
		const keptWidth = DOCUMENT_PANEL_MAX_WIDTH - 150
		const boardPanel = renderLaunchBoardPanel()
		dragPanelEdgeBy(150)
		boardPanel.unmount()

		renderPlanPanel()

		expect(widthOfPanel()).toBe(`${keptWidth}px`)
	})
})

const OWN_WINDOW = "main"
const OWN_ACCOUNT = "account-me"
const ROADMAP_BOARD = "Roadmap.canvas"

const roadmapBoardItem: LibraryItem = {
	...launchBoardItem,
	name: ROADMAP_BOARD,
	path: `/library/${ROADMAP_BOARD}`,
}

const seatOf = (
	id: string,
	kind: LibraryWriter["kind"],
	nodeId: string | null,
	name: string | null = null,
): LibraryWriter => ({
	id,
	kind,
	name,
	at: { kind: "board", point: { x: 40, y: 20 }, nodeId },
})

const presenceListeners = () =>
	libraryHost.listeners.get(LIBRARY_DOCUMENT_PRESENCE_EVENT) ?? new Set()

const announcePresence = (writers: LibraryWriter[], name = LAUNCH_BOARD) =>
	act(() => {
		for (const heard of presenceListeners()) {
			heard(
				{
					event: LIBRARY_DOCUMENT_PRESENCE_EVENT,
					id: 0,
					payload: { spaceId: SPACE_ID, name, writers },
				},
				null,
			)
		}
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

const stopCalls = () =>
	libraryHost.invoked.filter(([command]) => command === "library_stop_writers")

const presenceDocumentsOf = (isJoined: boolean) => ({
	...boardDocumentsOf(() => undefined),
	isJoined,
	boardOf: (name: string) =>
		[launchBoardItem, roadmapBoardItem].find((board) => board.name === name),
})

const openedBoardPanelOf = (isJoined: boolean, name: string) =>
	createElement(ThreadOpenedItemPanel, {
		documents: presenceDocumentsOf(isJoined),
		bots: BOTS,
		opened: { kind: "board", name },
	})

const mountPresencePanel = async (isJoined = false) => {
	const { queryClient, wrapper } = createQueryTestWrapper()
	queryClient.setQueryData(accountQueryKeys.state(), {
		kind: "signedIn",
		id: OWN_ACCOUNT,
		email: "me@example.com",
		createdAt: "2026-01-01T00:00:00Z",
		plan: null,
	})
	const panel = render(openedBoardPanelOf(isJoined, LAUNCH_BOARD), { wrapper })
	await screen.findByText("First")
	await waitFor(() => expect(presenceListeners().size).toBe(1))
	return panel
}

describe("presence on a board opened beside a conversation", () => {
	beforeEach(() => {
		libraryHost.answers.set("library_list", () => [
			launchBoardItem,
			roadmapBoardItem,
		])
		libraryHost.answers.set("library_open_document", ({ name }) => ({
			name,
			update: boardStateOf(TWO_NOTES_BOARD),
		}))
		libraryHost.answers.set("library_board_summary", ({ name }) => ({
			name,
			nodeCount: 2,
			nodes: [],
			bounds: { x: 0, y: 0, width: 500, height: 100 },
		}))
		libraryHost.answers.set("library_share_presence", () => null)
		libraryHost.answers.set("library_stop_writers", () => ({
			kind: "cancelled",
		}))
	})

	afterEach(() => {
		cleanup()
		libraryHost.answers.clear()
		libraryHost.invoked.length = 0
		libraryHost.listeners.clear()
		localStorage.clear()
	})

	it("shows another person's pointer and outlines the object they selected, with no chip", async () => {
		await mountPresencePanel()

		announcePresence([seatOf("window-2", "person", "first", "Lena")])

		expect(pointerNames()).toEqual(["Lena"])
		expect(outlinedTexts()).toEqual(["First"])
		expect(drawingChip(1)).toBeNull()
	})

	it("never shows the own window's pointer or selection", async () => {
		await mountPresencePanel()

		announcePresence([seatOf(OWN_WINDOW, "person", "first", "Me")])

		expect(pointerNames()).toEqual([])
		expect(outlinedTexts()).toEqual([])
	})

	it("never shows the own member in a joined Space, and shows the host's people", async () => {
		await mountPresencePanel(true)

		announcePresence([
			seatOf(OWN_ACCOUNT, "member", "first", "Me"),
			seatOf(OWN_WINDOW, "person", null, "Host person"),
		])

		expect(pointerNames()).toEqual(["Host person"])
		expect(outlinedTexts()).toEqual([])
	})

	it("outlines what each agent draws and shows the drawing chip with their count in the panel header", async () => {
		await mountPresencePanel()

		announcePresence([
			seatOf(ATLAS_ID, "agent", "first"),
			seatOf(JUNIPER_ID, "agent", null),
		])

		expect(pointerNames()).toEqual(["Atlas", "Juniper"])
		expect(outlinedTexts()).toEqual(["First"])
		const header = document.querySelector(
			'[data-slot="document-panel-header"]',
		) as HTMLElement
		expect(
			within(header).getByText(common("board.presence.drawing", { count: 2 })),
		).toBeInstanceOf(HTMLElement)
	})

	it("stops every writer of the board on Stop all", async () => {
		await mountPresencePanel()
		announcePresence([
			seatOf(ATLAS_ID, "agent", "first"),
			seatOf(JUNIPER_ID, "agent", "second"),
		])

		fireEvent.click(
			screen.getByRole("button", {
				name: common("library.document.agents.stopAll"),
			}),
		)

		await waitFor(() =>
			expect(stopCalls()).toEqual([
				[
					"library_stop_writers",
					{ spaceId: SPACE_ID, name: LAUNCH_BOARD, agentId: null },
				],
			]),
		)
	})

	it("drops the previous board's presence when the panel switches to another board", async () => {
		const panel = await mountPresencePanel()
		announcePresence([seatOf(ATLAS_ID, "agent", "first")])

		panel.rerender(openedBoardPanelOf(false, ROADMAP_BOARD))
		await screen.findByText("First")

		expect(drawingChip(1)).toBeNull()
		expect(pointerNames()).toEqual([])
		expect(outlinedTexts()).toEqual([])
	})

	it("stops listening to presence once the panel closes", async () => {
		const panel = await mountPresencePanel()

		panel.unmount()

		await waitFor(() => expect(presenceListeners().size).toBe(0))
	})
})
