// @vitest-environment happy-dom

import { RouterProvider } from "@tanstack/react-router"
import type { Event } from "@tauri-apps/api/event"
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
import { afterEach, describe, expect, it, vi } from "vitest"
import * as Y from "yjs"

import { type Board, zAt } from "@workspace/shared/board/board"
import { writeBoard } from "@workspace/shared/board/board-doc"
import {
	fieldSelectionOf,
	selectInField,
} from "@workspace/ui/components/library-block-text"
import { libraryDocumentStartOf } from "@workspace/ui/components/library-document-editor"
import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"
import { toRelativeTime } from "@workspace/ui/lib/time-format"

import { LibraryScreenHoldingOpening } from "@/components/library-screen-holding-opening"
import {
	LIBRARY_DOCUMENT_UPDATED_EVENT,
	type LibraryBoardNode,
	type LibraryDocumentUpdated,
	type LibraryItem,
	type MissionInSpace,
} from "@/lib/bindings"
import { newBotIdentity } from "@/lib/bots/bot-settings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { hostOfflineOf } from "@/lib/host/host-offline"
import type { Invoke } from "@/lib/host/joined-hosts-invoke"
import { markdownWithIds } from "@/lib/library/block-ids-test-pattern"
import { base64Of, bytesOf } from "@/lib/library/library-document-session"
import { titleOf } from "@/lib/library/library-items"
import { aMission } from "@/lib/missions/mission-fixtures"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { readMirror, writeMirror } from "@/lib/user/preferences-mirror"

type Harness = {
	store: TranscriptStore | null
	missions: MissionInSpace[]
	libraryItems: LibraryItem[]
	boardNodes: Record<string, LibraryBoardNode[]>
	unreadableBoards: string[]
	loadingBoards: string[]
}

const harness = vi.hoisted(
	(): Harness => ({
		store: null,
		missions: [],
		libraryItems: [],
		boardNodes: {},
		unreadableBoards: [],
		loadingBoards: [],
	}),
)

type LibraryCall = { name: string; update: string }

type UpdateHeard = (event: Event<LibraryDocumentUpdated>) => void

const HOSTED_CONTENT = "Notes"

const LIBRARY_SPACE_ID = "space"

const libraryItemOf = (
	name: string,
	kind: LibraryItem["kind"],
): LibraryItem => ({
	name,
	kind,
	path: `/library/${name}`,
	bytes: 1024,
	modifiedAt: 0,
	createdAt: null,
})

const BOARD_EXTENSION = ".canvas"

const hostedBoardOf = (nodes: LibraryBoardNode[]): Board => ({
	nodes: Object.fromEntries(
		nodes.map(({ id, x, y, width, height }, index) => [
			id,
			{ kind: "text", x, y, width, height, z: zAt(index), text: "" },
		]),
	),
	edges: {},
})

const createFakeLibraryHost = () => {
	const documents = new Map<string, Y.Doc>()
	const listeners = new Set<UpdateHeard>()
	const host = {
		refusesUpdates: false,
		isOffline: false,
		onOpened: null as ((name: string) => void) | null,
	}

	const documentOf = (name: string) => {
		const held = documents.get(name)
		if (held) {
			return held
		}
		const doc = new Y.Doc()
		if (name.endsWith(BOARD_EXTENSION)) {
			writeBoard(doc, hostedBoardOf(harness.boardNodes[name] ?? []))
		} else {
			doc.getText("markdown").insert(0, HOSTED_CONTENT)
		}
		documents.set(name, doc)
		return doc
	}

	const announce = (payload: LibraryDocumentUpdated) => {
		for (const heard of listeners) {
			heard({ event: LIBRARY_DOCUMENT_UPDATED_EVENT, id: 0, payload })
		}
	}

	const commands: Record<string, (call: LibraryCall) => unknown> = {
		library_create_document: ({ name }) => {
			if (harness.libraryItems.some((item) => item.name === name)) {
				throw { kind: "alreadyExists", name }
			}
			documents.set(name, new Y.Doc())
			const item = libraryItemOf(name, "document")
			harness.libraryItems = [...harness.libraryItems, item]
			return item
		},
		library_create_board: ({ name }) => {
			const fileName = `${name}.canvas`
			if (harness.libraryItems.some((item) => item.name === fileName)) {
				throw { kind: "alreadyExists", name: fileName }
			}
			const item = libraryItemOf(fileName, "board")
			harness.libraryItems = [...harness.libraryItems, item]
			return item
		},
		library_open_document: ({ name }) => {
			if (host.isOffline) {
				throw hostOfflineOf("gone")
			}
			const update = base64Of(Y.encodeStateAsUpdate(documentOf(name)))
			host.onOpened?.(name)
			return { name, update }
		},
		library_apply_update: ({ name, update }) => {
			if (host.refusesUpdates) {
				throw { kind: "tooLarge", name, bytes: 0, limit: 0 }
			}
			Y.applyUpdate(documentOf(name), bytesOf(update))
			setTimeout(() => announce({ spaceId: LIBRARY_SPACE_ID, name, update }))
			return null
		},
	}

	return {
		host,
		commands,
		markdownOf: (name: string) =>
			documentOf(name).getText("markdown").toString(),
		writeElsewhere: (name: string, markdown: string) => {
			const doc = documentOf(name)
			const text = doc.getText("markdown")
			const before = Y.encodeStateVector(doc)
			doc.transact(() => {
				text.delete(0, text.length)
				text.insert(0, markdown)
			})
			const update = base64Of(Y.encodeStateAsUpdate(doc, before))
			announce({ spaceId: LIBRARY_SPACE_ID, name, update })
		},
		listen: (heard: UpdateHeard) => {
			listeners.add(heard)
			return () => {
				listeners.delete(heard)
			}
		},
		reset: () => {
			documents.clear()
			listeners.clear()
			host.refusesUpdates = false
			host.isOffline = false
			host.onOpened = null
		},
	}
}

const fakeLibraryHost = createFakeLibraryHost()

const LIBRARY_READS: Record<string, (name: string) => unknown> = {
	library_list: () => harness.libraryItems,
	library_read_document: (name) => ({
		name,
		format: "text",
		content: HOSTED_CONTENT,
	}),
	library_read_image: (name) => ({ name, mimeType: "image/png", content: "" }),
	library_board_summary: (name) => {
		if (harness.loadingBoards.includes(name)) {
			return new Promise(() => {})
		}
		if (harness.unreadableBoards.includes(name)) {
			throw { kind: "invalidBoard", name, detail: "not JSON Canvas" }
		}
		const nodes = harness.boardNodes[name] ?? []
		return {
			name,
			nodeCount: nodes.length,
			nodes,
			bounds:
				nodes.length === 0 ? null : { x: 0, y: 0, width: 400, height: 160 },
		}
	},
}

const answerLibraryCall = (command: string, args: unknown) => {
	const call = args as LibraryCall
	const read = LIBRARY_READS[command]
	return read ? read(call.name) : fakeLibraryHost.commands[command]?.(call)
}

const isLibraryCall = (command: string) =>
	command in LIBRARY_READS || command in fakeLibraryHost.commands

vi.mock("@/lib/conversations/create-store", () => ({
	createTranscriptStore: () => harness.store,
}))

vi.mock("@/lib/host/index", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/host/index")>()
	const invoke: Invoke = async <T>(...call: Parameters<Invoke>) => {
		const [command, args] = call
		return isLibraryCall(command)
			? (answerLibraryCall(command, args) as T)
			: actual.invoke<T>(...call)
	}
	const listen: typeof actual.listen = (event, handler) =>
		event === LIBRARY_DOCUMENT_UPDATED_EVENT
			? Promise.resolve(
					fakeLibraryHost.listen((heard) =>
						handler(heard as Parameters<typeof handler>[0], null),
					),
				)
			: actual.listen(event, handler)
	return { ...actual, invoke, listen, isDesktopHost: () => false }
})

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseFailureNotice: vi.fn(() => "notice"),
}))

vi.mock("@/lib/host/tauri", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/tauri")>()),
	convertFileSrc: (path: string) => `asset://${path}`,
}))

vi.mock("@/lib/chat/create-driver", async () => {
	const { withFakeHostWrites } = await import(
		"@/lib/conversations/fake-host-writes"
	)
	return {
		createChatDriver: (store: TranscriptStore) =>
			withFakeHostWrites(createFakeChatDriver({ stepMs: 1 }), store),
	}
})

vi.mock("@/lib/missions/missions-transport", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/missions/missions-transport")>()
	const { aSpacePage } = await import("@/lib/missions/mission-fixtures")
	const heldMission = (missionId: string) => {
		const held = harness.missions.find(
			({ mission }) => mission.id === missionId,
		)
		if (!held) throw new Error(`no mission ${missionId}`)
		return held.mission
	}
	return {
		...actual,
		missionsTransport: {
			...actual.missionsTransport,
			spacePage: async () => aSpacePage(harness.missions),
			detail: async (missionId: string) => ({
				mission: heldMission(missionId),
				events: [],
			}),
		},
	}
})

const { createWorkspaceRouter } = await import("@/workspace-router")

const SETTLE_MS = 200

const ROOM_TITLE = "Round table"

const OTHER_ROOM_TITLE = "Back room"

const OBJECTIVE = "Ship the release notes"

const LIBRARY_NAME = i18n.t("common:library.title")

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.useRealTimers()
	harness.store = null
	harness.missions = []
	harness.libraryItems = []
	harness.boardNodes = {}
	harness.unreadableBoards = []
	harness.loadingBoards = []
	fakeLibraryHost.reset()
	vi.mocked(raiseFailureNotice).mockClear()
})

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(SETTLE_MS)
	})
}

const mountApp = async () => {
	writeMirror({ ...readMirror(), firstRunDone: true })
	const store = createFakeTranscriptStore()
	const [space] = await store.spaces()
	const bot = await store.createBot(newBotIdentity([]), space.id)
	const conversationIn = (title: string) =>
		store.createConversation({
			botIds: [bot.id],
			sectionId: null,
			spaceId: space.id,
			title,
		})
	const room = await conversationIn(ROOM_TITLE)
	const otherRoom = await conversationIn(OTHER_ROOM_TITLE)
	harness.missions = [
		{
			mission: aMission({
				id: "mission-release",
				botId: bot.id,
				objective: OBJECTIVE,
				originConversationId: room.id,
				spaceId: space.id,
				threadConversationId: room.id,
			}),
			conversationId: room.id,
			conversationTitle: room.title,
		},
	]
	vi.useFakeTimers()
	harness.store = store
	const router = createWorkspaceRouter()
	render(createElement(RouterProvider, { router }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
	return { otherRoom, router }
}

const click = async (target: Element) => {
	await act(async () => {
		fireEvent.click(target, { detail: 1 })
	})
	await settle()
}

const libraryHeading = () =>
	screen.queryByRole("heading", { level: 1, name: LIBRARY_NAME })

const shownThread = () => document.querySelector('[data-slot="chat-layout"]')

type SidebarEntry = "newConversation" | "missions" | "library"

const SIDEBAR_ENTRIES: SidebarEntry[] = [
	"newConversation",
	"missions",
	"library",
]

const sidebarButton = (entry: SidebarEntry) =>
	screen.getByRole("button", {
		name: new RegExp(`^${i18n.t(`bots:rail.${entry}`)}( \\d+)?$`),
	})

const currentSidebarEntries = () =>
	SIDEBAR_ENTRIES.filter(
		(entry) => sidebarButton(entry).getAttribute("aria-current") === "page",
	)

const currentTab = () => screen.getByRole("tab", { selected: true })

const tabTitled = (title: string) =>
	screen
		.getAllByRole("tab")
		.find((tab) => tab.textContent?.includes(title)) as HTMLElement

type MountedApp = Awaited<ReturnType<typeof mountApp>>

const showOtherRoom = async ({ router, otherRoom }: MountedApp) => {
	await act(async () =>
		router.navigate({ to: "/", search: { conversation: otherRoom.id } }),
	)
	await settle()
}

describe("the Library page of a tab", () => {
	it("opens from the sidebar as a new entry of the current tab, titled Library, without the conversation", async () => {
		const app = await mountApp()
		await showOtherRoom(app)
		const tabCount = screen.getAllByRole("tab").length

		await click(sidebarButton("library"))

		expect(app.router.state.location.pathname).toBe("/library")
		expect(app.router.history.canGoBack()).toBe(true)
		expect(screen.getAllByRole("tab")).toHaveLength(tabCount)
		expect(currentTab().textContent).toContain(LIBRARY_NAME)
		expect(libraryHeading()).not.toBeNull()
		expect(shownThread()).toBeNull()
		expect(currentSidebarEntries()).toEqual(["library"])
	})

	it("restores the conversation layout and the conversation shown before on Back", async () => {
		const app = await mountApp()
		await showOtherRoom(app)
		await click(sidebarButton("library"))

		await act(async () => app.router.history.back())
		await settle()

		expect(libraryHeading()).toBeNull()
		expect(shownThread()).not.toBeNull()
		expect(app.router.state.location.search.conversation).toBe(app.otherRoom.id)
		expect(currentTab().textContent).toContain(OTHER_ROOM_TITLE)
		expect(currentSidebarEntries()).toEqual([])
	})

	it("leaves for the Missions page on Missions in the sidebar", async () => {
		const { router } = await mountApp()
		await click(sidebarButton("library"))

		await click(sidebarButton("missions"))

		expect(libraryHeading()).toBeNull()
		expect(router.state.location.pathname).toBe("/missions")
		expect(currentSidebarEntries()).toEqual(["missions"])
	})

	it("shows each tab its own page when switching away from the Library and back", async () => {
		const app = await mountApp()
		await showOtherRoom(app)
		await click(sidebarButton("library"))

		await act(async () => app.router.options.context.tabs.openEmptyTab())
		await settle()
		expect(libraryHeading()).toBeNull()
		expect(currentSidebarEntries()).toEqual([])

		await click(tabTitled(LIBRARY_NAME))

		expect(currentTab().textContent).toContain(LIBRARY_NAME)
		expect(libraryHeading()).not.toBeNull()
		expect(currentSidebarEntries()).toEqual(["library"])
	})
})

describe("the Search entry of the sidebar", () => {
	it.each([
		["the Library", "/library"],
		["the user settings", "/settings/user"],
	] as const)("opens search on %s", async (_page, path) => {
		const { router } = await mountApp()
		await act(async () => router.navigate({ to: path }))
		await settle()

		await click(screen.getByRole("button", { name: i18n.t("search:open") }))

		expect(router.state.location.pathname).toBe(path)
		expect(screen.getByRole("dialog")).toBeInstanceOf(HTMLElement)
	})
})

const IMAGE = libraryItemOf("diagram.png", "image")

const DOCUMENT = libraryItemOf("notes.txt", "document")

const MARKDOWN_DOCUMENT = libraryItemOf("notes.md", "document")

const renderLibraryScreen = async (isJoined: boolean) => {
	const { container } = render(
		createElement(LibraryScreenHoldingOpening, {
			spaceId: LIBRARY_SPACE_ID,
			isJoined,
			bots: [],
		}),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
	const shown = within(container)
	await shown.findByRole("heading", { level: 1, name: LIBRARY_NAME })
	return shown
}

const mountLibraryScreen = (isJoined: boolean) => {
	harness.libraryItems = [IMAGE, DOCUMENT]
	return renderLibraryScreen(isJoined)
}

type Shown = Pick<typeof screen, "getAllByRole">

const findButtonContaining = (text: string, shown: Shown) =>
	waitFor(() => {
		const found = shown
			.getAllByRole("button")
			.find((button) => button.textContent?.includes(text))
		expect(found).toBeInstanceOf(HTMLElement)
		return found as HTMLElement
	})

const openLibraryItem = async (item: LibraryItem, shown: Shown = screen) => {
	const tile = await findButtonContaining(titleOf(item), shown)
	await act(async () => {
		fireEvent.click(tile, { detail: 1 })
	})
}

const buttonNamed = (name: string) => screen.queryByRole("button", { name })

const findButtonNamed = (name: string) => screen.findByRole("button", { name })

describe("the More action of an opened Library item", () => {
	it("shows Download and Copy but no More on an image of a joined Space", async () => {
		await mountLibraryScreen(true)

		await openLibraryItem(IMAGE)

		expect(
			await findButtonNamed(i18n.t("common:library.lightbox.download")),
		).toBeInstanceOf(HTMLElement)
		expect(buttonNamed(i18n.t("common:library.lightbox.copy"))).toBeInstanceOf(
			HTMLElement,
		)
		expect(
			buttonNamed(i18n.t("common:library.itemMenu.showInFolder")),
		).toBeNull()
	})

	it("leaves Show in folder out of More on a document of a joined Space", async () => {
		await mountLibraryScreen(true)

		await openLibraryItem(DOCUMENT)
		await act(async () => {
			fireEvent.click(
				await findButtonNamed(i18n.t("common:library.document.more")),
			)
		})

		const menu = await screen.findByRole("menu")
		expect(
			within(menu).queryByRole("menuitem", {
				name: i18n.t("common:library.itemMenu.showInFolder"),
			}),
		).toBeNull()
	})

	it("keeps More on an image and a document of the host's own Space", async () => {
		await mountLibraryScreen(false)

		await openLibraryItem(IMAGE)
		expect(
			await findButtonNamed(i18n.t("common:library.lightbox.more")),
		).toBeInstanceOf(HTMLElement)

		await act(async () => {
			fireEvent.click(
				buttonNamed(i18n.t("common:library.lightbox.close")) as HTMLElement,
			)
		})
		await openLibraryItem(DOCUMENT)
		expect(
			await findButtonNamed(i18n.t("common:library.document.more")),
		).toBeInstanceOf(HTMLElement)
	})
})

const common = i18n.getFixedT(null, "common")

const BODY_FIELD = common("library.editor.body")

const press = async (target: Element) => {
	await act(async () => {
		fireEvent.click(target, { detail: 1 })
	})
}

const TASK_NOTES = "Notes\n\n\n\n- [ ] Ship the notes"

const PASTED_PARAGRAPHS = "First thought.\n\nSecond thought.\n\nThird thought."

const AGENT_LINE = "\n\nAtlas adds a line."

const BLOCK_FIELD = "[data-slot='library-document-block-field']"

const bodyOf = (shown: Pick<typeof screen, "getByRole">) =>
	shown.getByRole("group", { name: BODY_FIELD })

const blocksOf = (body: HTMLElement) => [
	...body.querySelectorAll<HTMLElement>("[data-slot='library-document-block']"),
]

const linesIn = (field: HTMLElement) =>
	[...field.querySelectorAll(".block, li")]
		.filter((line) => line.querySelector(".block, li") === null)
		.map((line) => line.textContent)

const shownTextOf = (block: HTMLElement) => {
	const field = block.querySelector<HTMLElement>(BLOCK_FIELD)
	return field ? linesIn(field).join("\n") : block.textContent?.trim()
}

const inputInto = (field: HTMLElement, inputType: string, data: string) =>
	field.dispatchEvent(
		Object.assign(
			new InputEvent("beforeinput", {
				inputType,
				data,
				bubbles: true,
				cancelable: true,
			}),
			{ getTargetRanges: () => [] },
		),
	)

const shownTextsOf = (shown: Pick<typeof screen, "getByRole">) =>
	blocksOf(bodyOf(shown)).map(shownTextOf)

const textOf = (shown: Pick<typeof screen, "getByRole">) =>
	shownTextsOf(shown)[0]

const openBlock = async (block: HTMLElement) => {
	await act(async () => {
		;(
			block.querySelector<HTMLElement>(BLOCK_FIELD) ??
			block.querySelector<HTMLElement>("[tabindex]")
		)?.focus()
	})
	return waitFor(() => {
		const field = block.querySelector<HTMLElement>(BLOCK_FIELD)
		expect(document.activeElement).toBe(field)
		return field as HTMLElement
	})
}

const typeInto = async (body: HTMLElement, value: string) => {
	const field = await openBlock(blocksOf(body)[0] as HTMLElement)
	await act(async () => {
		document.getSelection()?.selectAllChildren(field)
		inputInto(field, "insertText", value)
	})
}

const pasteBelow = async (block: HTMLElement, text: string) => {
	await press(
		block.querySelector("[data-slot='library-block-insert']") as HTMLElement,
	)
	const field = await waitFor(() => {
		const focused = document.activeElement
		expect(focused?.getAttribute("data-slot")).toBe(
			"library-document-block-field",
		)
		return focused as HTMLElement
	})
	await act(async () => {
		inputInto(field, "insertFromPaste", text)
	})
	return field
}

const checkedTemplateOf = (dialog: HTMLElement) =>
	within(dialog)
		.getAllByRole("radio")
		.find((radio) => radio.getAttribute("aria-checked") === "true")?.textContent

const createFromDialog = async () => {
	const dialog = await screen.findByRole("dialog")
	await press(
		within(dialog).getByRole("button", {
			name: common("library.picker.create"),
		}),
	)
	return dialog
}

describe("a new Library document", () => {
	it("creates a blank document on the host from New document, named after the first free Untitled, and lists it on Back", async () => {
		harness.libraryItems = [DOCUMENT, libraryItemOf("Untitled.md", "document")]
		const shown = await renderLibraryScreen(false)

		await press(
			shown.getByRole("button", { name: common("library.newDocument") }),
		)
		const dialog = await screen.findByRole("dialog")
		expect(checkedTemplateOf(dialog)).toContain(
			common("library.templates.blank.name"),
		)
		await createFromDialog()

		expect(
			await screen.findByRole("textbox", {
				name: common("library.editor.title"),
			}),
		).toBeInstanceOf(HTMLElement)
		expect(fakeLibraryHost.markdownOf("Untitled 2.md")).toBe("")

		await press(
			shown.getByRole("button", { name: common("library.document.back") }),
		)
		expect(await findButtonContaining("Untitled 2", shown)).toBeInstanceOf(
			HTMLElement,
		)
	})

	it("starts a template card of the empty state with that template, seeded on the host of a joined Space", async () => {
		const start = libraryDocumentStartOf("brief", new Date(), common)
		const shown = await renderLibraryScreen(true)

		await press(
			await findButtonContaining(common("library.templates.brief.name"), shown),
		)
		const dialog = await screen.findByRole("dialog")
		expect(checkedTemplateOf(dialog)).toContain(
			common("library.templates.brief.name"),
		)
		await createFromDialog()

		expect(await screen.findByText(start.detail)).toBeInstanceOf(HTMLElement)
		expect(fakeLibraryHost.markdownOf("Untitled.md")).toBe(start.body)
	})
})

describe("an opened Library document", () => {
	it("shows an edit made by one client in another client of the same host", async () => {
		harness.libraryItems = [MARKDOWN_DOCUMENT]
		const onHost = await renderLibraryScreen(false)
		const member = await renderLibraryScreen(true)
		await openLibraryItem(MARKDOWN_DOCUMENT, onHost)
		await openLibraryItem(MARKDOWN_DOCUMENT, member)
		await waitFor(() => expect(textOf(member)).toBe(HOSTED_CONTENT))

		await typeInto(bodyOf(onHost), "Notes and actions")

		await waitFor(() => expect(textOf(member)).toBe("Notes and actions"), {
			timeout: 1000,
		})
		expect(fakeLibraryHost.markdownOf(MARKDOWN_DOCUMENT.name)).toMatch(
			markdownWithIds("Notes and actions ^ID"),
		)
		expect(textOf(onHost)).toBe("Notes and actions")
	})

	it("shows the host's markdown again when the host refuses an edit", async () => {
		harness.libraryItems = [DOCUMENT]
		const shown = await renderLibraryScreen(false)
		await openLibraryItem(DOCUMENT, shown)
		await waitFor(() => expect(textOf(shown)).toBe(HOSTED_CONTENT))
		fakeLibraryHost.host.refusesUpdates = true

		await typeInto(bodyOf(shown), "Notes nobody keeps")

		expect(textOf(shown)).toBe("Notes nobody keeps")
		await waitFor(() => expect(textOf(shown)).toBe(HOSTED_CONTENT), {
			timeout: 1000,
		})
		expect(fakeLibraryHost.markdownOf(DOCUMENT.name)).toBe(HOSTED_CONTENT)
	})

	it("shows in a client an update the host announced while that client was opening", async () => {
		harness.libraryItems = [DOCUMENT]
		const onHost = await renderLibraryScreen(false)
		const member = await renderLibraryScreen(true)
		await openLibraryItem(DOCUMENT, onHost)
		await waitFor(() => expect(textOf(onHost)).toBe(HOSTED_CONTENT))
		fakeLibraryHost.host.onOpened = (name) => {
			fakeLibraryHost.host.onOpened = null
			fakeLibraryHost.writeElsewhere(name, "Notes from elsewhere")
		}

		await openLibraryItem(DOCUMENT, member)

		await waitFor(() => expect(textOf(member)).toBe("Notes from elsewhere"), {
			timeout: 1000,
		})
		await typeInto(bodyOf(onHost), "Notes from elsewhere and here")
		await waitFor(
			() => expect(textOf(member)).toBe("Notes from elsewhere and here"),
			{ timeout: 1000 },
		)
	})

	it("shows the failed view and raises a notice when the offline joined host fails the open", async () => {
		harness.libraryItems = [DOCUMENT]
		const shown = await renderLibraryScreen(true)
		fakeLibraryHost.host.isOffline = true

		await openLibraryItem(DOCUMENT, shown)

		await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledTimes(1))
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				title: i18n.t("common:library.failure.document.open"),
			}),
		)
		expect(
			shown.queryByRole("heading", { level: 1, name: LIBRARY_NAME }),
		).toBeNull()
		expect(shown.queryByRole("group", { name: BODY_FIELD })).toBeNull()
	})

	it("holds on the host the markdown the editor shows through typing, paste, a task, an agent write and a reopen", async () => {
		harness.libraryItems = [MARKDOWN_DOCUMENT]
		fakeLibraryHost.writeElsewhere(MARKDOWN_DOCUMENT.name, TASK_NOTES)
		const shown = await renderLibraryScreen(false)
		await openLibraryItem(MARKDOWN_DOCUMENT, shown)
		await waitFor(() =>
			expect(shownTextsOf(shown)).toEqual(["Notes", "Ship the notes"]),
		)
		const body = bodyOf(shown)
		const holdsMarkdown = (markdown: string, texts: string[]) =>
			waitFor(
				() => {
					expect(shownTextsOf(shown)).toEqual(texts)
					expect(fakeLibraryHost.markdownOf(MARKDOWN_DOCUMENT.name)).toMatch(
						markdownWithIds(markdown),
					)
				},
				{ timeout: 1000 },
			)

		await typeInto(body, "Notes and actions")
		const typed = "Notes and actions ^ID\n\n\n\n- [ ] Ship the notes\n\n^ID"
		await holdsMarkdown(typed, ["Notes and actions", "Ship the notes"])

		const pastedField = await pasteBelow(
			blocksOf(body)[0] as HTMLElement,
			PASTED_PARAGRAPHS,
		)
		const pasted = typed.replace(
			"- [ ]",
			"First thought. ^ID\n\nSecond thought. ^ID\n\nThird thought. ^ID\n\n- [ ]",
		)
		await holdsMarkdown(pasted, [
			"Notes and actions",
			PASTED_PARAGRAPHS,
			"Ship the notes",
		])
		await act(async () => {
			pastedField.blur()
		})
		const paragraphs = [
			"Notes and actions",
			"First thought.",
			"Second thought.",
			"Third thought.",
		]
		await holdsMarkdown(pasted, [...paragraphs, "Ship the notes"])

		await press(shown.getByRole("checkbox", { name: "Ship the notes" }))
		const ticked = pasted.replace("- [ ]", "- [x]")
		await holdsMarkdown(ticked, [...paragraphs, "Ship the notes"])

		const task = await openBlock(blocksOf(body).at(-1) as HTMLElement)
		await act(async () => {
			selectInField(task, "Ship".length)
		})

		const written = `${ticked}${AGENT_LINE}`
		fakeLibraryHost.writeElsewhere(
			MARKDOWN_DOCUMENT.name,
			`${fakeLibraryHost.markdownOf(MARKDOWN_DOCUMENT.name)}${AGENT_LINE}`,
		)
		await holdsMarkdown(written, [
			...paragraphs,
			"Ship the notes",
			"Atlas adds a line.",
		])
		expect(bodyOf(shown)).toBe(body)
		expect(document.activeElement).toBe(task)
		expect(fieldSelectionOf(task)?.start).toBe("Ship".length)

		await press(
			shown.getByRole("button", { name: common("library.document.back") }),
		)
		await openLibraryItem(MARKDOWN_DOCUMENT, shown)
		await holdsMarkdown(written, [
			...paragraphs,
			"Ship the notes",
			"Atlas adds a line.",
		])
		expect(bodyOf(shown)).not.toBe(body)
	})
})

describe("a new Library document the host refuses to seed", () => {
	it("opens blank from the host's state and raises the save failure", async () => {
		const start = libraryDocumentStartOf("brief", new Date(), common)
		const shown = await renderLibraryScreen(false)
		fakeLibraryHost.host.refusesUpdates = true

		await press(
			await findButtonContaining(common("library.templates.brief.name"), shown),
		)
		await createFromDialog()

		expect(await screen.findByText(start.detail)).toBeInstanceOf(HTMLElement)
		expect(textOf(screen)).toBe("")
		expect(fakeLibraryHost.markdownOf("Untitled.md")).toBe("")
		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				expect.objectContaining({
					title: common("library.failure.document.save"),
				}),
			),
		)
	})
})

const otherTab = () =>
	screen
		.getAllByRole("tab", { hidden: true })
		.find((tab) => tab.getAttribute("aria-selected") !== "true") as HTMLElement

describe("Open in new tab on a Library item", () => {
	it("opens a new tab on the Library with that item opened", async () => {
		const { router } = await mountApp()
		harness.libraryItems = [IMAGE]
		await act(async () => router.navigate({ to: "/library" }))
		await settle()

		const tile = screen
			.getAllByRole("button")
			.find((button) => button.textContent?.includes(IMAGE.name))
		await act(async () => {
			fireEvent.contextMenu(tile as HTMLElement)
		})
		await click(
			screen.getByRole("menuitem", {
				name: common("library.itemMenu.openInNewTab"),
			}),
		)
		expect(screen.queryByRole("dialog")).toBeNull()

		await click(otherTab())

		expect(lightboxShown()).toBe(true)
	})
})

const lightboxShown = () => {
	const lightbox = screen.queryByRole("dialog")
	return (
		lightbox !== null &&
		within(lightbox).queryByRole("button", {
			name: common("library.lightbox.download"),
		}) !== null
	)
}

const closeLightbox = () =>
	click(
		within(screen.getByRole("dialog")).getByRole("button", {
			name: common("library.lightbox.back"),
		}),
	)

const IMAGE_OPENING = { item: IMAGE.name, kind: "image" } as const

const DOCUMENT_OPENING = { item: DOCUMENT.name, kind: "document" } as const

const LIBRARY_ON_IMAGE = `/library?item=${IMAGE.name}&kind=image`

const selectedTabName = () =>
	screen
		.getAllByRole("tab", { hidden: true })
		.find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent

const openByAddress = async (
	router: Awaited<ReturnType<typeof mountApp>>["router"],
	search: typeof IMAGE_OPENING | typeof DOCUMENT_OPENING,
) => {
	await act(async () => router.navigate({ to: "/library", search }))
	await settle()
}

const editorTitleField = () =>
	screen.getByRole("textbox", { name: common("library.editor.title") })

const typeTitle = async (value: string) => {
	await act(async () => {
		fireEvent.change(editorTitleField(), { target: { value } })
	})
	await settle()
}

describe("the item a Library address names", () => {
	it("opens it and keeps it in the address", async () => {
		const { router } = await mountApp()
		harness.libraryItems = [IMAGE]

		await openByAddress(router, IMAGE_OPENING)

		expect(lightboxShown()).toBe(true)
		expect(router.state.location.search).toEqual(IMAGE_OPENING)
	})

	it("stays closed once closed, after leaving the tab and coming back", async () => {
		const { router } = await mountApp()
		harness.libraryItems = [IMAGE]
		await act(async () =>
			router.options.context.tabs.openInNewTab(LIBRARY_ON_IMAGE),
		)
		await settle()
		await click(otherTab())
		expect(lightboxShown()).toBe(true)

		await closeLightbox()
		await click(otherTab())
		expect(libraryHeading()).toBeNull()
		await click(otherTab())

		expect(libraryHeading()).not.toBeNull()
		expect(router.state.location.search).toEqual({})
		expect(screen.queryByRole("dialog")).toBeNull()
	})

	it("reopens it after leaving the tab open on it and coming back", async () => {
		const { router } = await mountApp()
		harness.libraryItems = [IMAGE]
		await act(async () =>
			router.options.context.tabs.openInNewTab(LIBRARY_ON_IMAGE),
		)
		await settle()
		await click(otherTab())

		await click(otherTab())
		await click(otherTab())

		expect(lightboxShown()).toBe(true)
		expect(selectedTabName()).toContain(IMAGE.name)
	})

	it("stays in the address when the Library does not list it, showing the failed view", async () => {
		const { router } = await mountApp()
		harness.libraryItems = [IMAGE]

		await act(async () =>
			router.navigate({
				to: "/library",
				search: { item: "gone.png", kind: "image" },
			}),
		)
		await settle()

		expect(router.state.location.search).toEqual({
			item: "gone.png",
			kind: "image",
		})
		expect(libraryHeading()).toBeNull()
		expect(screen.queryByRole("dialog")).toBeNull()
	})

	const closeTabAction = () =>
		screen.getByRole("button", {
			name: common("library.tab.unavailable.missing.action"),
		})

	it("closes the tab from the missing state", async () => {
		const { router } = await mountApp()
		harness.libraryItems = [IMAGE]
		await act(async () =>
			router.options.context.tabs.openInNewTab(
				"/library?item=gone.png&kind=image",
			),
		)
		await settle()
		await click(otherTab())
		expect(screen.getAllByRole("tab", { hidden: true })).toHaveLength(2)

		await click(closeTabAction())

		expect(screen.getAllByRole("tab", { hidden: true })).toHaveLength(1)
		expect(router.state.location.search).not.toHaveProperty("item")
	})

	it("closes a pinned tab from the missing state", async () => {
		const { router } = await mountApp()
		harness.libraryItems = [IMAGE]
		await openByAddress(router, { item: "gone.png", kind: "image" })
		const { tabs } = router.options.context
		const pinnedId = tabs.getState().bySpace[tabs.getState().spaceId].activeId
		await act(async () => tabs.pin(pinnedId))

		await click(closeTabAction())

		const { bySpace, spaceId } = tabs.getState()
		expect(bySpace[spaceId].tabs.map((tab) => tab.id)).not.toContain(pinnedId)
		expect(router.state.location.search).not.toHaveProperty("item")
	})

	it("opens the item of a second address landing in the same tab", async () => {
		const { router } = await mountApp()
		harness.libraryItems = [IMAGE]
		await openByAddress(router, IMAGE_OPENING)
		await closeLightbox()

		await openByAddress(router, IMAGE_OPENING)

		expect(lightboxShown()).toBe(true)
	})
})

describe("the tab of an opened Library item", () => {
	it("is named after the document title, then its new title once renamed", async () => {
		const { router } = await mountApp()
		harness.libraryItems = [DOCUMENT]

		await openByAddress(router, DOCUMENT_OPENING)
		expect(selectedTabName()).toContain("notes")

		await typeTitle("Plans")

		expect(selectedTabName()).toContain("Plans")
		expect(router.state.location.search).toEqual({
			...DOCUMENT_OPENING,
			title: "Plans",
		})
	})

	it("is named Untitled for a blank document opened from New document", async () => {
		const { router } = await mountApp()
		harness.libraryItems = [DOCUMENT, libraryItemOf("Untitled.md", "document")]
		await act(async () => router.navigate({ to: "/library" }))
		await settle()

		await click(
			screen.getByRole("button", { name: common("library.newDocument") }),
		)
		await click(
			within(screen.getByRole("dialog")).getByRole("button", {
				name: common("library.picker.create"),
			}),
		)

		expect(editorTitleField()).toHaveProperty("value", "")
		expect(selectedTabName()).toBe(common("library.editor.untitled"))
	})

	it.each([
		["cleared", ""],
		["left as whitespace", "   "],
	])(
		"is named Untitled once its title is %s, the title field left as typed",
		async (_shape, typed) => {
			const { router } = await mountApp()
			harness.libraryItems = [DOCUMENT]
			await openByAddress(router, DOCUMENT_OPENING)

			await typeTitle("Plans")
			expect(selectedTabName()).toBe("Plans")

			await typeTitle(typed)

			expect(editorTitleField()).toHaveProperty("value", typed)
			expect(selectedTabName()).toBe(common("library.editor.untitled"))
		},
	)

	it("names the new tab an item opens in like the item", async () => {
		const { router } = await mountApp()
		harness.libraryItems = [IMAGE]
		await act(async () =>
			router.options.context.tabs.openInNewTab(LIBRARY_ON_IMAGE),
		)
		await settle()

		expect(otherTab().textContent).toContain(IMAGE.name)
	})
})

const tileNamed = (name: string) =>
	screen
		.getAllByRole("button")
		.find((button) => button.textContent?.includes(name)) as HTMLElement

const tabCount = () => screen.getAllByRole("tab", { hidden: true }).length

const showLibraryGrid = async (
	router: Awaited<ReturnType<typeof mountApp>>["router"],
) => {
	harness.libraryItems = [IMAGE]
	await act(async () => router.navigate({ to: "/library" }))
	await settle()
}

const pickOpenInMenuOf = async (tile: HTMLElement) => {
	await act(async () => {
		fireEvent.contextMenu(tile)
	})
	await click(
		screen.getByRole("menuitem", { name: common("library.itemMenu.open") }),
	)
}

const IMAGE_OPENERS = [
	["a click on it", click],
	["Open in its menu", pickOpenInMenuOf],
] as const

type MountedRouter = Awaited<ReturnType<typeof mountApp>>["router"]

const pinActiveTab = async (router: MountedRouter) => {
	const pinnedId = activeTabId(router)
	await act(async () => router.options.context.tabs.pin(pinnedId))
	return pinnedId
}

const activeTabId = (router: MountedRouter) => {
	const { bySpace, spaceId } = router.options.context.tabs.getState()
	return bySpace[spaceId].activeId
}

const currentHrefOfTab = (router: MountedRouter, id: string) => {
	const { bySpace, spaceId } = router.options.context.tabs.getState()
	const tab = bySpace[spaceId].tabs.find((held) => held.id === id)
	return tab?.entries[tab.index].href
}

const modifierClick = async (target: Element) => {
	await act(async () => {
		fireEvent.click(target, { detail: 1, metaKey: true, ctrlKey: true })
	})
	await settle()
}

const showPinnedLibraryGrid = async (router: MountedRouter) => {
	await showLibraryGrid(router)
	await pinActiveTab(router)
}

describe("an image opened from the Library grid", () => {
	it.each(IMAGE_OPENERS)(
		"opens on %s in the same unpinned tab, named after it",
		async (_gesture, open) => {
			const { router } = await mountApp()
			await showLibraryGrid(router)
			const tabsBefore = tabCount()

			await open(tileNamed(IMAGE.name))

			expect(tabCount()).toBe(tabsBefore)
			expect(selectedTabName()).toContain(IMAGE.name)
			expect(router.state.location.search).toEqual(IMAGE_OPENING)
			expect(lightboxShown()).toBe(true)
		},
	)

	it.each(IMAGE_OPENERS)(
		"opens on %s in a new active tab from a pinned tab, left on its grid",
		async (_gesture, open) => {
			const { router } = await mountApp()
			await showLibraryGrid(router)
			const pinnedId = await pinActiveTab(router)
			const tabsBefore = tabCount()

			await open(tileNamed(IMAGE.name))

			expect(tabCount()).toBe(tabsBefore + 1)
			expect(activeTabId(router)).not.toBe(pinnedId)
			expect(selectedTabName()).toContain(IMAGE.name)
			expect(currentHrefOfTab(router, pinnedId)).toBe("/library")
			expect(router.state.location.search).toEqual(IMAGE_OPENING)
			expect(lightboxShown()).toBe(true)
		},
	)

	it.each([
		["unpinned", showLibraryGrid],
		["pinned", showPinnedLibraryGrid],
	] as const)(
		"opens on a modifier click in a new tab, the %s tab left on its grid",
		async (_pin, prepare) => {
			const { router } = await mountApp()
			await prepare(router)
			const tabsBefore = tabCount()
			const shownId = activeTabId(router)

			await modifierClick(tileNamed(IMAGE.name))

			expect(tabCount()).toBe(tabsBefore + 1)
			expect(activeTabId(router)).toBe(shownId)
			expect(currentHrefOfTab(router, shownId)).toBe("/library")
			expect(otherTab().textContent).toContain(IMAGE.name)
			expect(router.state.location.search).toEqual({})
			expect(screen.queryByRole("dialog")).toBeNull()
		},
	)

	it("is drawn inside the Library panel, the sidebar still shown", async () => {
		const { router } = await mountApp()
		await showLibraryGrid(router)

		await click(tileNamed(IMAGE.name))

		expect(
			screen.getByRole("dialog").closest('[data-slot="library-panel"]'),
		).not.toBeNull()
		expect(librarySidebarButton()).toBeInstanceOf(HTMLElement)
	})

	it("leaves the pinned Library tab on its grid once the image tab is closed", async () => {
		const { router } = await mountApp()
		await showLibraryGrid(router)
		const pinnedId = await pinActiveTab(router)
		const tabsBefore = tabCount()
		await click(tileNamed(IMAGE.name))

		await act(async () => router.options.context.tabs.closeActive())
		await settle()

		expect(tabCount()).toBe(tabsBefore)
		expect(activeTabId(router)).toBe(pinnedId)
		expect(router.state.location.search).toEqual({})
		expect(libraryHeading()).not.toBeNull()
		expect(screen.queryByRole("dialog")).toBeNull()
	})

	it("turns its tab back into the Library on the viewer's Back", async () => {
		const { router } = await mountApp()
		await showLibraryGrid(router)
		await click(tileNamed(IMAGE.name))
		const tabsWithImage = tabCount()

		await closeLightbox()

		expect(tabCount()).toBe(tabsWithImage)
		expect(selectedTabName()).toContain(LIBRARY_NAME)
		expect(libraryHeading()).not.toBeNull()
	})
})

const librarySidebarButton = () =>
	screen.getByRole("button", {
		name: i18n.t("bots:rail.library"),
		hidden: true,
	})

describe("the Library opened from the sidebar", () => {
	it("shows in the same unpinned tab", async () => {
		const { router } = await mountApp()
		const tabsBefore = tabCount()

		await click(librarySidebarButton())

		expect(tabCount()).toBe(tabsBefore)
		expect(selectedTabName()).toContain(LIBRARY_NAME)
		expect(libraryHeading()).not.toBeNull()
		expect(router.state.location.pathname).toBe("/library")
	})

	it("opens a new active tab from a pinned tab, its address unchanged", async () => {
		const { router } = await mountApp()
		const pinnedId = await pinActiveTab(router)
		const pinnedHref = currentHrefOfTab(router, pinnedId)
		const tabsBefore = tabCount()

		await click(librarySidebarButton())

		expect(tabCount()).toBe(tabsBefore + 1)
		expect(selectedTabName()).toContain(LIBRARY_NAME)
		expect(currentHrefOfTab(router, pinnedId)).toBe(pinnedHref)
		expect(libraryHeading()).not.toBeNull()
	})
})

const ROADMAP = libraryItemOf("Roadmap.canvas", "board")

const RETRO = libraryItemOf("Retro.canvas", "board")

const stickyAt = (id: string, x: number): LibraryBoardNode => ({
	id,
	type: "text",
	x,
	y: 0,
	width: 160,
	height: 160,
	colour: "3",
})

const ROADMAP_NODES = [stickyAt("a", 0), stickyAt("b", 200), stickyAt("c", 240)]

const filterNamed = (label: string) =>
	within(document.querySelector('[data-slot="library-filters"]') as HTMLElement)
		.getAllByRole("button")
		.find((button) => button.textContent?.startsWith(label)) as HTMLElement

const isTileShown = (name: string) =>
	screen
		.queryAllByRole("button")
		.some((button) => button.textContent?.includes(name))

const boardCanvas = () =>
	screen.queryByRole("application", { name: common("board.canvas.label") })

const breadcrumbOf = (name: string) =>
	screen
		.getByText(name, { selector: "[aria-current='page']" })
		.closest("nav") as HTMLElement

const boardObjectCount = () =>
	screen.queryAllByRole("option", { hidden: true }).length

const showLibraryOf = async (router: MountedRouter, items: LibraryItem[]) => {
	harness.libraryItems = items
	await act(async () => router.navigate({ to: "/library" }))
	await settle()
}

describe("the boards of the Library grid", () => {
	it("counts the boards on the Boards filter and lists only them once it is selected", async () => {
		harness.libraryItems = [ROADMAP, RETRO, DOCUMENT]
		const shown = await renderLibraryScreen(false)
		await findButtonContaining(titleOf(ROADMAP), shown)

		const boards = filterNamed(common("library.filters.boards"))
		expect(boards.textContent).toBe(`${common("library.filters.boards")}2`)

		await press(boards)

		expect(isTileShown(titleOf(ROADMAP))).toBe(true)
		expect(isTileShown(titleOf(RETRO))).toBe(true)
		expect(isTileShown(titleOf(DOCUMENT))).toBe(false)
	})

	it("draws a board tile with the line Board, its item count and its relative time", async () => {
		harness.libraryItems = [ROADMAP]
		harness.boardNodes = { [ROADMAP.name]: ROADMAP_NODES }
		const shown = await renderLibraryScreen(false)

		const line = common("board.card.atRest", {
			count: ROADMAP_NODES.length,
			edited: toRelativeTime(ROADMAP.modifiedAt, Date.now()),
		})
		const tile = await findButtonContaining(line, shown)

		expect(tile.textContent).toContain(titleOf(ROADMAP))
	})

	it("keeps the tile of a board whose summary fails, without a miniature, and logs the failure", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => {})
		harness.libraryItems = [ROADMAP, RETRO]
		harness.boardNodes = { [ROADMAP.name]: ROADMAP_NODES }
		harness.unreadableBoards = [RETRO.name]
		const shown = await renderLibraryScreen(false)

		await waitFor(() =>
			expect(logged).toHaveBeenCalledWith(
				expect.stringContaining(RETRO.name),
				expect.anything(),
			),
		)
		const tile = await findButtonContaining(titleOf(RETRO), shown)
		expect(
			tile.querySelector("[data-slot='board-miniature-object']"),
		).toBeNull()
		expect(raiseFailureNotice).not.toHaveBeenCalled()
		logged.mockRestore()
	})

	it("creates a board from the Blank board card of an empty Library and shows the empty board", async () => {
		const shown = await renderLibraryScreen(false)

		await press(await findButtonContaining(common("library.blankBoard"), shown))

		expect(
			await screen.findByRole("heading", { name: common("board.empty.title") }),
		).toBeInstanceOf(HTMLElement)
		expect(harness.libraryItems.map(({ name }) => name)).toEqual([
			"Untitled.canvas",
		])
	})
})

describe("a board opened in its tab", () => {
	it("creates a board from New board and opens it in a new tab named after it", async () => {
		const { router } = await mountApp()
		await showLibraryOf(router, [ROADMAP])
		const tabsBefore = tabCount()

		await click(
			screen.getByRole("button", { name: common("library.newBoard") }),
		)

		expect(tabCount()).toBe(tabsBefore + 1)
		expect(selectedTabName()).toBe(common("library.editor.untitled"))
		expect(boardCanvas()).toBeInstanceOf(HTMLElement)
		expect(
			screen.getByRole("heading", { name: common("board.empty.title") }),
		).toBeInstanceOf(HTMLElement)
	})

	it("opens a board from its tile in a new tab with the Library breadcrumb, its objects and the zoom control", async () => {
		const { router } = await mountApp()
		harness.boardNodes = { [ROADMAP.name]: ROADMAP_NODES }
		await showLibraryOf(router, [ROADMAP])
		const tabsBefore = tabCount()

		await click(tileNamed(titleOf(ROADMAP)))

		expect(tabCount()).toBe(tabsBefore + 1)
		expect(selectedTabName()).toBe(titleOf(ROADMAP))
		expect(boardCanvas()).toBeInstanceOf(HTMLElement)
		expect(boardObjectCount()).toBe(ROADMAP_NODES.length)
		expect(
			within(breadcrumbOf(titleOf(ROADMAP))).getByRole("button", {
				name: common("library.document.back"),
			}),
		).toBeInstanceOf(HTMLElement)
		expect(
			screen.getByRole("group", { name: common("board.zoom.controls") }),
		).toBeInstanceOf(HTMLElement)
	})

	it("shows the board bar with its name and Back, and neither the image skeleton nor the empty hint, while its summary loads", async () => {
		const { router } = await mountApp()
		harness.loadingBoards = [ROADMAP.name]
		await showLibraryOf(router, [ROADMAP])

		await click(tileNamed(titleOf(ROADMAP)))

		expect(
			within(breadcrumbOf(titleOf(ROADMAP))).getByRole("button", {
				name: common("library.document.back"),
			}),
		).toBeInstanceOf(HTMLElement)
		expect(
			screen.queryByRole("region", {
				name: common("library.tab.loadingImage"),
			}),
		).toBeNull()
		expect(
			screen.queryByRole("heading", { name: common("board.empty.title") }),
		).toBeNull()
		expect(boardCanvas()).toBeNull()
	})

	it("focuses the tab a board is already open in instead of opening a second one", async () => {
		const { router } = await mountApp()
		await showLibraryOf(router, [ROADMAP])
		await click(tileNamed(titleOf(ROADMAP)))
		const tabsWithBoard = tabCount()

		await click(tabTitled(LIBRARY_NAME))
		await click(tileNamed(titleOf(ROADMAP)))

		expect(tabCount()).toBe(tabsWithBoard)
		expect(selectedTabName()).toBe(titleOf(ROADMAP))
		expect(boardCanvas()).toBeInstanceOf(HTMLElement)
	})
})
