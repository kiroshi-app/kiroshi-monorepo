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
	raiseFailureNotice,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { LibraryScreenHoldingOpening } from "@/components/library-screen-holding-opening"
import type { LibraryItem } from "@/lib/bindings"
import type { Invoke } from "@/lib/host/joined-hosts-invoke"
import {
	base64Of,
	bytesOf,
	SEND_INTERVAL_MS,
} from "@/lib/library/library-document-session"
import type { LibraryOpening } from "@/lib/navigation/library-search"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

type HostCall = { command: string; args: unknown }

type NamedCall = { name: string }

type RenameCall = NamedCall & { newName: string }

type Harness = {
	listed: LibraryItem[]
	calls: HostCall[]
	refused: string | null
	held: Partial<Record<string, Promise<void>>>
}

const SPACE_ID = "space"

const FILE_CONTENT = "ZmlsZQ=="

const itemNamed = (name: string, kind: LibraryItem["kind"]): LibraryItem => ({
	name,
	kind,
	path: `/library/${name}`,
	bytes: 5,
	modifiedAt: 0,
	createdAt: null,
})

const DOCUMENT = itemNamed("notes.txt", "document")

const IMAGE = itemNamed("diagram.png", "image")

const harness = vi.hoisted(
	(): Harness => ({ listed: [], calls: [], refused: null, held: {} }),
)

const refusalOf = (args: unknown) => ({
	kind: "missing",
	name: (args as NamedCall).name,
})

const answerHostCall = (command: string, args: unknown) => {
	harness.calls.push({ command, args })
	if (command === harness.refused) {
		return Promise.reject(refusalOf(args))
	}
	return Promise.resolve(null)
}

const renameListed = ({ name, newName }: RenameCall) => {
	const renamed = itemNamed(newName, "document")
	harness.listed = harness.listed.map((item) =>
		item.name === name ? renamed : item,
	)
	return renamed
}

const stateWith = (markdown: string) => {
	const doc = new Y.Doc()
	doc.getText("markdown").insert(0, markdown)
	return Y.encodeStateAsUpdate(doc)
}

const OPENED_STATE = stateWith("Draft")

const LIBRARY_ANSWERS: Record<string, (args: NamedCall) => unknown> = {
	library_list: () => harness.listed,
	library_comment_agent_turns: () => [],
	library_read_document: ({ name }) => ({ name, format: "text", content: "" }),
	library_read_image: ({ name }) => ({
		name,
		mimeType: "image/png",
		content: "",
	}),
	library_read_file: ({ name }) => ({ name, content: FILE_CONTENT }),
	library_import: ({ name }) => itemNamed(name, "image"),
	library_open_document: ({ name }) => ({
		name,
		update: base64Of(OPENED_STATE),
	}),
	library_apply_update: () => null,
	library_share_presence: () => null,
	library_rename_document: (args) => renameListed(args as RenameCall),
	library_delete: ({ name }) => {
		harness.listed = harness.listed.filter((item) => item.name !== name)
		return null
	},
}

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: (command: string, args: unknown) => answerHostCall(command, args),
}))

vi.mock("@/lib/host/index", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/host/index")>()
	const invoke: Invoke = async <T>(...call: Parameters<Invoke>) => {
		const [command, args] = call
		const answer = LIBRARY_ANSWERS[command]
		if (!answer) {
			return actual.invoke<T>(...call)
		}
		harness.calls.push({ command, args })
		await harness.held[command]
		if (command === harness.refused) {
			throw refusalOf(args)
		}
		return answer(args as NamedCall) as T
	}
	const listen: typeof actual.listen = async () => () => undefined
	return { ...actual, invoke, listen, isDesktopHost: () => false }
})

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseFailureNotice: vi.fn(() => "notice"),
	raiseTransientNotice: vi.fn(),
}))

vi.mock("@/lib/host/tauri", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/tauri")>()),
	convertFileSrc: (path: string) => `asset://${path}`,
}))

const common = i18n.getFixedT(null, "common")

const LIBRARY_TITLE = common("library.title")

type ScreenOptions = {
	isJoined: boolean
	openedFirst?: LibraryOpening
	onCloseTab?: () => void
}

const renderLibraryScreen = async ({
	isJoined,
	openedFirst,
	onCloseTab,
}: ScreenOptions) => {
	const onOpenInNewTab = vi.fn()
	const screenElement = createElement(LibraryScreenHoldingOpening, {
		spaceId: SPACE_ID,
		isJoined,
		bots: [],
		openedFirst,
		onOpenInNewTab,
		onCloseTab,
	})
	const view = render(screenElement, {
		wrapper: createQueryTestWrapper().wrapper,
	})
	if (openedFirst === undefined) {
		await screen.findByRole("heading", { level: 1, name: LIBRARY_TITLE })
	}
	return { onOpenInNewTab, rerender: () => view.rerender(screenElement) }
}

const press = async (target: Element) => {
	await act(async () => {
		fireEvent.click(target, { detail: 1 })
	})
}

const tileOf = (title: string) =>
	waitFor(() => {
		const tile = screen
			.getAllByRole("button")
			.find((button) => button.textContent?.includes(title))
		expect(tile).toBeInstanceOf(HTMLElement)
		return tile as HTMLElement
	})

const openMenuOf = async (title: string) => {
	const tile = await tileOf(title)
	await act(async () => {
		fireEvent.contextMenu(tile)
	})
	return screen.findByRole("menu", {
		name: common("library.itemMenu.label", { name: title }),
	})
}

type MenuAction =
	| "open"
	| "openInNewTab"
	| "rename"
	| "copy"
	| "download"
	| "showInFolder"
	| "delete"

const menuItemOf = (action: MenuAction) => common(`library.itemMenu.${action}`)

const pickInMenuOf = async (title: string, action: MenuAction) => {
	const menu = await openMenuOf(title)
	await press(within(menu).getByRole("menuitem", { name: menuItemOf(action) }))
}

const confirmDelete = async () => {
	const dialog = await screen.findByRole("alertdialog")
	await press(
		within(dialog).getByRole("button", { name: menuItemOf("delete") }),
	)
}

const pickInLightboxMore = async (action: MenuAction) => {
	await press(
		screen.getByRole("button", { name: common("library.lightbox.more") }),
	)
	await press(await screen.findByRole("menuitem", { name: menuItemOf(action) }))
}

const openImage = async () => {
	await press(await tileOf("diagram.png"))
	return screen.findByRole("button", { name: common("library.lightbox.back") })
}

const titleField = async () =>
	(await screen.findByRole("textbox", {
		name: common("library.editor.title"),
	})) as HTMLInputElement

const lightboxBack = () =>
	screen.queryByRole("button", { name: common("library.lightbox.back") })

const callsOf = (command: string) =>
	harness.calls
		.filter((call) => call.command === command)
		.map((call) => call.args)

const closeMenu = async () => {
	await act(async () => {
		fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
	})
	await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
}

const renameInMenuOf = async (title: string) =>
	within(await openMenuOf(title)).queryByRole("menuitem", {
		name: menuItemOf("rename"),
	})

const tileShown = (title: string) =>
	screen
		.queryAllByRole("button")
		.some((button) => button.textContent?.includes(title))

const libraryShown = () =>
	screen.queryByRole("heading", { level: 1, name: LIBRARY_TITLE })

const renameNotesTo = async (title: string) => {
	await pickInMenuOf("notes", "rename")
	const field = await titleField()
	await act(async () => {
		field.focus()
		fireEvent.change(field, { target: { value: title } })
	})
	await pressInTitle(field, "Enter")
}

beforeEach(() => {
	harness.listed = [DOCUMENT, IMAGE]
	harness.calls = []
	harness.refused = null
	harness.held = {}
	vi.mocked(raiseFailureNotice).mockClear()
	vi.mocked(raiseTransientNotice).mockClear()
})

afterEach(cleanup)

const SPACES = [
	["the host", false],
	["a joined Space", true],
] as const

describe("Open in the menu of a Library item", () => {
	it("opens a document in the editor, as a click on it does", async () => {
		await renderLibraryScreen({ isJoined: false })

		await pickInMenuOf("notes", "open")

		expect((await titleField()).value).toBe("notes")
	})

	it("opens an image in the lightbox, as a click on it does", async () => {
		await renderLibraryScreen({ isJoined: false })

		await pickInMenuOf("diagram.png", "open")

		expect(
			await screen.findByRole("button", {
				name: common("library.lightbox.back"),
			}),
		).toBeInstanceOf(HTMLElement)
	})
})

describe("Open in new tab in the menu of a Library item", () => {
	it("asks for a new tab on the item from the grid and from the lightbox", async () => {
		const { onOpenInNewTab } = await renderLibraryScreen({ isJoined: true })

		await pickInMenuOf("notes", "openInNewTab")
		await openImage()
		await press(
			screen.getByRole("button", { name: common("library.lightbox.more") }),
		)
		await press(
			await screen.findByRole("menuitem", { name: menuItemOf("openInNewTab") }),
		)

		expect(onOpenInNewTab.mock.calls.map(([opening]) => opening)).toEqual([
			{ kind: "document", name: "notes.txt" },
			{ kind: "image", name: "diagram.png" },
		])
	})

	it("opens the item the tab names once the Library lists it", async () => {
		await renderLibraryScreen({
			isJoined: false,
			openedFirst: { kind: "document", name: "notes.txt" },
		})

		expect((await titleField()).value).toBe("notes")
	})
})

const MISSING_NOTICE = {
	title: common("library.tab.unavailable.missing.title"),
	description: common("library.tab.unavailable.missing.body"),
}

const NOTES_OPENING: LibraryOpening = { kind: "document", name: "notes.txt" }

const IMAGE_OPENING: LibraryOpening = { kind: "image", name: "diagram.png" }

type UnavailableReason = "missing" | "unreadable"

const editorShown = () =>
	screen.queryByRole("textbox", { name: common("library.editor.title") })

const gridItemShown = () =>
	tileShown("notes") || tileShown("diagram.png") || libraryShown() !== null

const skeletonShown = (label: "loadingDocument" | "loadingImage") =>
	screen.queryByRole("region", { name: common(`library.tab.${label}`) }) !==
	null

const unavailableCard = (reason: UnavailableReason, name: string) =>
	screen.findByRole("group", {
		name: common(`library.tab.unavailable.${reason}.title`, { name }),
	})

const pressUnavailableAction = (reason: UnavailableReason) =>
	press(
		screen.getByRole("button", {
			name: common(`library.tab.unavailable.${reason}.action`),
		}),
	)

const relist = () =>
	act(async () => {
		window.dispatchEvent(new Event("focus"))
	})

describe("a tab opening a Library item", () => {
	it.each(SPACES)(
		"loads the document alongside the list and shows the document skeleton once both are slow to load, on %s",
		async (_space, isJoined) => {
			const releaseList = holdHostCall("library_list")
			const releaseDocument = holdHostCall("library_open_document")

			await renderLibraryScreen({ isJoined, openedFirst: NOTES_OPENING })

			await waitFor(() =>
				expect(callsOf("library_open_document")).toEqual([
					{ spaceId: SPACE_ID, name: "notes.txt" },
				]),
			)
			expect(callsOf("library_list")).toHaveLength(1)
			expect(skeletonShown("loadingDocument")).toBe(false)
			expect(gridItemShown()).toBe(false)
			await waitFor(() => expect(skeletonShown("loadingDocument")).toBe(true))

			await releaseDocument()
			expect(skeletonShown("loadingDocument")).toBe(true)
			expect(gridItemShown()).toBe(false)

			await releaseList()
			expect((await titleField()).value).toBe("notes")
			expect(skeletonShown("loadingDocument")).toBe(false)
			expect(gridItemShown()).toBe(false)
		},
	)

	it.each(SPACES)(
		"shows the image skeleton once the list is slow to load, then the image, on %s",
		async (_space, isJoined) => {
			const releaseList = holdHostCall("library_list")

			await renderLibraryScreen({ isJoined, openedFirst: IMAGE_OPENING })
			await settle()
			expect(skeletonShown("loadingImage")).toBe(false)
			expect(gridItemShown()).toBe(false)
			await waitFor(() => expect(skeletonShown("loadingImage")).toBe(true))

			await releaseList()
			expect(
				await screen.findByRole("button", {
					name: common("library.lightbox.back"),
				}),
			).toBeInstanceOf(HTMLElement)
		},
	)

	it.each(SPACES)(
		"shows the unreadable state when the read fails and goes back to the Library from it, on %s",
		async (_space, isJoined) => {
			harness.refused = "library_open_document"

			await renderLibraryScreen({ isJoined, openedFirst: NOTES_OPENING })

			expect(await unavailableCard("unreadable", "notes.txt")).toBeInstanceOf(
				HTMLElement,
			)
			await settle(50)
			expect(raiseFailureNotice).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({
					title: common("library.failure.document.open"),
				}),
			)
			expect(gridItemShown()).toBe(false)

			await pressUnavailableAction("unreadable")

			expect(await tileOf("notes")).toBeInstanceOf(HTMLElement)
		},
	)

	it.each(SPACES)(
		"shows the missing state, with the one refusal notice, for a deleted document the host refuses to open, on %s",
		async (_space, isJoined) => {
			harness.listed = [IMAGE]
			harness.refused = "library_open_document"

			await renderLibraryScreen({ isJoined, openedFirst: NOTES_OPENING })

			expect(await unavailableCard("missing", "notes.txt")).toBeInstanceOf(
				HTMLElement,
			)
			await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledOnce())
			await settle(50)
			expect(raiseFailureNotice).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({
					title: common("library.failure.document.open"),
				}),
			)
			expect(gridItemShown()).toBe(false)
			expect(editorShown()).toBeNull()
		},
	)

	it.each(SPACES)(
		"shows the missing state, raises its notice once and closes the tab from it, for a document the list no longer carries, on %s",
		async (_space, isJoined) => {
			harness.listed = [IMAGE]
			const onCloseTab = vi.fn()

			await renderLibraryScreen({
				isJoined,
				openedFirst: NOTES_OPENING,
				onCloseTab,
			})

			expect(await unavailableCard("missing", "notes.txt")).toBeInstanceOf(
				HTMLElement,
			)
			await waitFor(() =>
				expect(raiseFailureNotice).toHaveBeenCalledExactlyOnceWith(
					expect.objectContaining(MISSING_NOTICE),
				),
			)
			expect(gridItemShown()).toBe(false)

			await pressUnavailableAction("missing")

			expect(onCloseTab).toHaveBeenCalledOnce()
		},
	)

	it.each(SPACES)(
		"shows the missing state for an image the list does not carry, raises its notice once and goes back to the Library without a way to close the tab, on %s",
		async (_space, isJoined) => {
			harness.listed = [DOCUMENT]

			const { rerender } = await renderLibraryScreen({
				isJoined,
				openedFirst: IMAGE_OPENING,
			})

			expect(await unavailableCard("missing", "diagram.png")).toBeInstanceOf(
				HTMLElement,
			)
			await waitFor(() =>
				expect(raiseFailureNotice).toHaveBeenCalledExactlyOnceWith(
					expect.objectContaining(MISSING_NOTICE),
				),
			)
			rerender()
			await settle(50)
			expect(raiseFailureNotice).toHaveBeenCalledOnce()
			expect(gridItemShown()).toBe(false)
			expect(lightboxBack()).toBeNull()

			await pressUnavailableAction("missing")

			expect(await tileOf("notes")).toBeInstanceOf(HTMLElement)
		},
	)

	it.each(SPACES)(
		"shows the missing state and raises its notice once when the shown document leaves the list, on %s",
		async (_space, isJoined) => {
			const { rerender } = await renderLibraryScreen({
				isJoined,
				openedFirst: NOTES_OPENING,
			})
			expect((await titleField()).value).toBe("notes")

			harness.listed = [IMAGE]
			await relist()

			expect(await unavailableCard("missing", "notes.txt")).toBeInstanceOf(
				HTMLElement,
			)
			await waitFor(() =>
				expect(raiseFailureNotice).toHaveBeenCalledExactlyOnceWith(
					expect.objectContaining(MISSING_NOTICE),
				),
			)
			rerender()
			await relist()
			await settle(50)
			expect(raiseFailureNotice).toHaveBeenCalledOnce()
			expect(editorShown()).toBeNull()
			expect(gridItemShown()).toBe(false)
		},
	)
})

describe("Rename in the menu of a Library item", () => {
	it.each(SPACES)(
		"renames the document on %s with the title edited in its editor",
		async (_space, isJoined) => {
			await renderLibraryScreen({ isJoined })

			await renameNotesTo(" Plans ")

			await waitFor(() =>
				expect(callsOf("library_rename_document")).toEqual([
					{ spaceId: SPACE_ID, name: "notes.txt", newName: "Plans.txt" },
				]),
			)
		},
	)

	it.each(SPACES)(
		"is offered on a document and not on an image, in the grid and the lightbox, on %s",
		async (_space, isJoined) => {
			await renderLibraryScreen({ isJoined })

			expect(await renameInMenuOf("notes")).toBeInstanceOf(HTMLElement)
			await closeMenu()
			expect(await renameInMenuOf("diagram.png")).toBeNull()
			await closeMenu()

			await openImage()
			await press(
				screen.getByRole("button", { name: common("library.lightbox.more") }),
			)
			await screen.findByRole("menuitem", { name: menuItemOf("openInNewTab") })
			expect(
				screen.queryByRole("menuitem", { name: menuItemOf("rename") }),
			).toBeNull()
		},
	)

	it("makes no rename call when the title was left as it was", async () => {
		await renderLibraryScreen({ isJoined: false })

		await renameNotesTo("notes")
		await leaveDocument()

		await tileOf("notes")
		expect(callsOf("library_rename_document")).toEqual([])
	})
})

describe("Delete in the menu of a Library item", () => {
	it.each(SPACES)(
		"deletes the item picked in the grid on %s and drops it from the grid",
		async (_space, isJoined) => {
			await renderLibraryScreen({ isJoined })

			await pickInMenuOf("notes", "delete")
			await confirmDelete()

			await waitFor(() => expect(tileShown("notes")).toBe(false))
			expect(callsOf("library_delete")).toEqual([
				{ spaceId: SPACE_ID, name: "notes.txt" },
			])
			expect(tileShown("diagram.png")).toBe(true)
		},
	)

	it.each(SPACES)(
		"deletes the image shown in the lightbox on %s and stops showing it",
		async (_space, isJoined) => {
			await renderLibraryScreen({ isJoined })

			await openImage()
			await pickInLightboxMore("delete")
			await confirmDelete()

			await waitFor(() => expect(lightboxBack()).toBeNull())
			await waitFor(() => expect(tileShown("diagram.png")).toBe(false))
			expect(await tileOf("notes")).toBeInstanceOf(HTMLElement)
			await settle(50)
			expect(raiseFailureNotice).not.toHaveBeenCalled()
			expect(callsOf("library_delete")).toEqual([
				{ spaceId: SPACE_ID, name: "diagram.png" },
			])
		},
	)

	it("makes no delete call until the person confirms", async () => {
		await renderLibraryScreen({ isJoined: false })

		await pickInMenuOf("notes", "delete")
		await screen.findByRole("alertdialog")

		expect(callsOf("library_delete")).toEqual([])
	})
})

describe("Copy and Download in the menu of a Library item", () => {
	it.each([
		["copy", "library_copy"],
		["download", "library_save"],
	] as const)(
		"calls the host's own command on %s in the host's Space",
		async (action, command) => {
			await renderLibraryScreen({ isJoined: false })

			await pickInMenuOf("notes", action)

			await waitFor(() =>
				expect(callsOf(command)).toEqual([
					{ spaceId: SPACE_ID, name: "notes.txt" },
				]),
			)
		},
	)

	it.each([
		["copy", "library_copy_bytes"],
		["download", "library_save_bytes"],
	] as const)(
		"reads the file from the host and hands its bytes to this machine on %s in a joined Space",
		async (action, command) => {
			await renderLibraryScreen({ isJoined: true })

			await pickInMenuOf("notes", action)

			await waitFor(() =>
				expect(callsOf(command)).toEqual([
					{ name: "notes.txt", content: FILE_CONTENT },
				]),
			)
			expect(callsOf("library_read_file")).toEqual([
				{ spaceId: SPACE_ID, name: "notes.txt" },
			])
		},
	)
})

describe("Show in folder in the menu of a Library item", () => {
	it("reveals the item on the host", async () => {
		await renderLibraryScreen({ isJoined: false })

		await pickInMenuOf("notes", "showInFolder")

		await waitFor(() =>
			expect(callsOf("library_reveal")).toEqual([
				{ spaceId: SPACE_ID, name: "notes.txt" },
			]),
		)
	})

	it("is absent from the grid and the lightbox of a joined Space", async () => {
		await renderLibraryScreen({ isJoined: true })

		const menu = await openMenuOf("notes")
		expect(
			within(menu).queryByRole("menuitem", {
				name: menuItemOf("showInFolder"),
			}),
		).toBeNull()
		await act(async () => {
			fireEvent.keyDown(menu, { key: "Escape" })
		})

		await openImage()
		await press(
			screen.getByRole("button", { name: common("library.lightbox.more") }),
		)
		await screen.findByRole("menuitem", { name: menuItemOf("openInNewTab") })
		expect(
			screen.queryByRole("menuitem", { name: menuItemOf("showInFolder") }),
		).toBeNull()
	})
})

const openViewerImageMenu = async () => {
	await act(async () => {
		fireEvent.contextMenu(
			within(screen.getByRole("dialog")).getByRole("img", {
				name: "diagram.png",
			}),
		)
	})
	return screen.findByRole("menu", {
		name: common("library.itemMenu.label", { name: "diagram.png" }),
	})
}

const pickInViewerImageMenu = async (entry: string) => {
	const menu = await openViewerImageMenu()
	await press(within(menu).getByRole("menuitem", { name: entry }))
}

const SAVE_TO_LIBRARY = common("library.imageMenu.saveToLibrary")

const COPY_IMAGE = common("library.imageMenu.copyImage")

describe("the image menu of the Library viewer", () => {
	it("offers Save to Library and Copy image after the viewer actions, never Open in viewer", async () => {
		await renderLibraryScreen({ isJoined: false })
		await openImage()

		const menu = await openViewerImageMenu()

		const entries = within(menu)
			.getAllByRole("menuitem")
			.map((item) => item.textContent)
		expect(entries.slice(-2)).toEqual([SAVE_TO_LIBRARY, COPY_IMAGE])
		expect(entries).toContain(menuItemOf("download"))
		expect(entries).not.toContain(common("library.imageMenu.openInViewer"))
	})

	it.each(SPACES)(
		"adds the image again under its name on each Save to Library, with no notice, in %s",
		async (_space, isJoined) => {
			await renderLibraryScreen({ isJoined })
			await openImage()

			await pickInViewerImageMenu(SAVE_TO_LIBRARY)
			await waitFor(() => expect(callsOf("library_import")).toHaveLength(1))
			await pickInViewerImageMenu(SAVE_TO_LIBRARY)

			const imported = {
				spaceId: SPACE_ID,
				name: "diagram.png",
				content: FILE_CONTENT,
			}
			await waitFor(() =>
				expect(callsOf("library_import")).toEqual([imported, imported]),
			)
			expect(raiseTransientNotice).not.toHaveBeenCalled()
			expect(raiseFailureNotice).not.toHaveBeenCalled()
		},
	)

	it("raises the import notice naming the image when the host refuses Save to Library", async () => {
		harness.refused = "library_import"
		await renderLibraryScreen({ isJoined: false })
		await openImage()

		await pickInViewerImageMenu(SAVE_TO_LIBRARY)

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				expect.objectContaining({
					title: common("library.failure.import.title", {
						name: "diagram.png",
					}),
				}),
			),
		)
	})

	it.each([
		["the host", false, "library_copy"],
		["a joined Space", true, "library_copy_bytes"],
	] as const)(
		"puts the image on the clipboard on Copy image in %s",
		async (_space, isJoined, command) => {
			await renderLibraryScreen({ isJoined })
			await openImage()

			await pickInViewerImageMenu(COPY_IMAGE)

			await waitFor(() => expect(callsOf(command)).toHaveLength(1))
		},
	)
})

const GRID_IMAGE_ACTIONS: MenuAction[] = [
	"open",
	"openInNewTab",
	"copy",
	"download",
	"showInFolder",
]

const SEPARATOR = "---"

const HOST_GRID_IMAGE_MENU = [
	...GRID_IMAGE_ACTIONS.map(menuItemOf),
	SEPARATOR,
	menuItemOf("delete"),
]

const JOINED_GRID_IMAGE_MENU = HOST_GRID_IMAGE_MENU.filter(
	(entry) => entry !== menuItemOf("showInFolder"),
)

const entriesOf = (menu: HTMLElement) =>
	Array.from(
		menu.querySelectorAll('[role="menuitem"], [role="separator"]'),
		(entry) =>
			entry.getAttribute("role") === "separator"
				? SEPARATOR
				: entry.textContent,
	)

describe("the menu of a Library grid image", () => {
	it.each([
		["the host", false, HOST_GRID_IMAGE_MENU],
		["a joined Space", true, JOINED_GRID_IMAGE_MENU],
	] as const)(
		"offers the item actions, a separator, then Delete and nothing after, in %s",
		async (_space, isJoined, expected) => {
			await renderLibraryScreen({ isJoined })

			const menu = await openMenuOf("diagram.png")

			expect(entriesOf(menu)).toEqual(expected)
			expect(
				within(menu).queryByRole("menuitem", { name: SAVE_TO_LIBRARY }),
			).toBeNull()
			expect(
				within(menu).queryByRole("menuitem", { name: COPY_IMAGE }),
			).toBeNull()
		},
	)

	it.each([
		["the host", false, "library_copy"],
		["a joined Space", true, "library_copy_bytes"],
	] as const)(
		"puts the image on the clipboard on Copy in %s",
		async (_space, isJoined, command) => {
			await renderLibraryScreen({ isJoined })

			await pickInMenuOf("diagram.png", "copy")

			await waitFor(() => expect(callsOf(command)).toHaveLength(1))
			expect(callsOf("library_import")).toEqual([])
		},
	)
})

type FailedAction = "copy" | "save" | "reveal" | "delete"

const failureOf = (action: FailedAction) =>
	expect.objectContaining({ title: common(`library.failure.${action}`) })

describe("a Library action the host refuses", () => {
	it.each([
		["copy", "library_copy", "copy"],
		["download", "library_save", "save"],
		["showInFolder", "library_reveal", "reveal"],
	] as const)(
		"raises a notice and keeps the Library on %s",
		async (action, command, failure) => {
			harness.refused = command
			await renderLibraryScreen({ isJoined: false })

			await pickInMenuOf("notes", action)

			await waitFor(() =>
				expect(raiseFailureNotice).toHaveBeenCalledWith(failureOf(failure)),
			)
			expect(libraryShown()).toBeInstanceOf(HTMLElement)
		},
	)

	it("raises a notice and puts the previous title back on rename", async () => {
		harness.refused = "library_rename_document"
		await renderLibraryScreen({ isJoined: false })

		await renameNotesTo("Plans")

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(failureOf("save")),
		)
		await waitFor(() => expect(shownTitle()).toBe("notes"))
	})

	it("raises a notice and keeps the item in the grid on delete", async () => {
		harness.refused = "library_delete"
		await renderLibraryScreen({ isJoined: false })

		await pickInMenuOf("notes", "delete")
		await confirmDelete()

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(failureOf("delete")),
		)
		expect(tileShown("notes")).toBe(true)
	})
})

describe("the Back button of the lightbox", () => {
	it("closes the lightbox", async () => {
		await renderLibraryScreen({ isJoined: false })

		await press(await openImage())

		await waitFor(() => expect(lightboxBack()).toBeNull())
		expect(libraryShown()).toBeInstanceOf(HTMLElement)
	})
})

type DocumentBarButton = "copy" | "download" | "more"

const documentBarButton = (button: DocumentBarButton) =>
	screen.getByRole("button", { name: common(`library.document.${button}`) })

const openNotes = async () => {
	await press(await tileOf("notes"))
	return titleField()
}

const openDocumentMore = async () => {
	await press(documentBarButton("more"))
	return screen.findByRole("menu", {
		name: common("library.itemMenu.label", { name: "notes" }),
	})
}

const pickInDocumentMore = async (action: MenuAction) => {
	const menu = await openDocumentMore()
	await press(within(menu).getByRole("menuitem", { name: menuItemOf(action) }))
}

const documentMoreItems = async () =>
	within(await openDocumentMore())
		.getAllByRole("menuitem")
		.map((item) => item.textContent)

const documentOpen = () =>
	screen.queryByRole("textbox", { name: common("library.editor.title") })

const shownTitle = () => (documentOpen() as HTMLInputElement | null)?.value

const pressInTitle = async (field: HTMLInputElement, key: string) => {
	await act(async () => {
		fireEvent.keyDown(field, { key })
	})
}

const retitleFromDocumentBar = async (title: string) => {
	const field = await openNotes()
	await pickInDocumentMore("rename")
	await waitFor(() => expect(document.activeElement).toBe(field))
	await act(async () => {
		fireEvent.change(field, { target: { value: title } })
	})
	return field
}

const holdHostCall = (command: string) => {
	const { promise, resolve } = Promise.withResolvers<void>()
	harness.held[command] = promise
	return () =>
		act(async () => {
			resolve()
		})
}

const settle = (waited = 0) =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, waited))
	})

const IDEAS = itemNamed("ideas.txt", "document")

const openIdeas = async () => {
	await press(await tileOf("ideas"))
	await waitFor(() => expect(shownTitle()).toBe("ideas"))
}

type SentUpdate = NamedCall & { update: string }

const textOfUpdatesTo = (name: string) => {
	const doc = new Y.Doc()
	Y.applyUpdate(doc, OPENED_STATE)
	const sent = callsOf("library_apply_update") as SentUpdate[]
	for (const { update } of sent.filter((call) => call.name === name)) {
		Y.applyUpdate(doc, bytesOf(update))
	}
	return doc.getText("markdown").toString()
}

const callsAfterRename = (command: string) => {
	const renamedAt = harness.calls.findIndex(
		(call) => call.command === "library_rename_document",
	)
	return harness.calls
		.slice(renamedAt)
		.filter((call) => call.command === command)
		.map((call) => call.args as NamedCall)
}

const leaveDocument = () =>
	press(screen.getByRole("button", { name: common("library.document.back") }))

const BLOCK_FIELD = "[data-slot='library-document-block-field']"

const typeInBody = async (text: string) => {
	const body = await screen.findByRole("group", {
		name: common("library.editor.body"),
	})
	const block = body.querySelector(
		"[data-slot='library-document-block']",
	) as HTMLElement
	await act(async () => {
		;(
			block.querySelector<HTMLElement>(BLOCK_FIELD) ??
			block.querySelector<HTMLElement>("[tabindex]")
		)?.focus()
	})
	const field = await waitFor(() => {
		const opened = block.querySelector<HTMLElement>(BLOCK_FIELD)
		expect(document.activeElement).toBe(opened)
		return opened as HTMLElement
	})
	await act(async () => {
		document.getSelection()?.selectAllChildren(field)
		field.dispatchEvent(
			Object.assign(
				new InputEvent("beforeinput", {
					inputType: "insertText",
					data: text,
					bubbles: true,
					cancelable: true,
				}),
				{ getTargetRanges: () => [] },
			),
		)
	})
}

describe("Rename in the document bar", () => {
	it("leaves focus in the title and not on More once the menu closes", async () => {
		await renderLibraryScreen({ isJoined: false })
		const field = await openNotes()

		await pickInDocumentMore("rename")

		await waitFor(() => expect(document.activeElement).toBe(field))
		expect(document.activeElement).not.toBe(documentBarButton("more"))
	})

	it("returns focus to More when the menu closes without Rename", async () => {
		await renderLibraryScreen({ isJoined: false })
		await openNotes()
		await openDocumentMore()

		await closeMenu()

		await waitFor(() =>
			expect(document.activeElement).toBe(documentBarButton("more")),
		)
	})

	it("puts the caret at the end of the title", async () => {
		await renderLibraryScreen({ isJoined: false })
		const field = await openNotes()

		await pickInDocumentMore("rename")

		await waitFor(() => expect(document.activeElement).toBe(field))
		expect([field.selectionStart, field.selectionEnd]).toEqual([
			"notes".length,
			"notes".length,
		])
	})

	it.each(SPACES)(
		"renames the document once on %s when the person confirms the title and leaves",
		async (_space, isJoined) => {
			await renderLibraryScreen({ isJoined })

			await pressInTitle(await retitleFromDocumentBar("Plans"), "Enter")
			await waitFor(() =>
				expect(callsOf("library_rename_document")).toHaveLength(1),
			)
			await leaveDocument()

			await tileOf("Plans")
			expect(callsOf("library_rename_document")).toEqual([
				{ spaceId: SPACE_ID, name: "notes.txt", newName: "Plans.txt" },
			])
		},
	)

	it.each(SPACES)(
		"renames the document once on %s when the title loses focus",
		async (_space, isJoined) => {
			await renderLibraryScreen({ isJoined })

			const field = await retitleFromDocumentBar("Plans")
			await act(async () => {
				field.blur()
			})

			await waitFor(() => expect(shownTitle()).toBe("Plans"))
			expect(callsOf("library_rename_document")).toEqual([
				{ spaceId: SPACE_ID, name: "notes.txt", newName: "Plans.txt" },
			])
		},
	)

	it("keeps the renamed document open and writes a later body edit to it", async () => {
		await renderLibraryScreen({ isJoined: false })

		await pressInTitle(await retitleFromDocumentBar("Plans"), "Enter")
		await waitFor(() => expect(shownTitle()).toBe("Plans"))
		await typeInBody("Rollout")

		await waitFor(() =>
			expect(callsOf("library_apply_update")).toContainEqual(
				expect.objectContaining({ name: "Plans.txt" }),
			),
		)
		expect(callsOf("library_apply_update")).not.toContainEqual(
			expect.objectContaining({ name: "notes.txt" }),
		)
	})

	it("shows the previous title and sends no rename on Escape", async () => {
		await renderLibraryScreen({ isJoined: false })

		const field = await retitleFromDocumentBar("Plans")
		await pressInTitle(field, "Escape")

		expect(field.value).toBe("notes")
		await leaveDocument()
		await tileOf("notes")
		expect(callsOf("library_rename_document")).toEqual([])
	})

	it("raises the rename notice and lists the previous name when the host refuses", async () => {
		harness.refused = "library_rename_document"
		await renderLibraryScreen({ isJoined: false })

		await pressInTitle(await retitleFromDocumentBar("Plans"), "Enter")
		await leaveDocument()

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(failureOf("save")),
		)
		expect(await tileOf("notes")).toBeInstanceOf(HTMLElement)
		expect(tileShown("Plans")).toBe(false)
	})
})

describe("a rename in flight", () => {
	it("leaves the Library as it is when the rename lands after the person left", async () => {
		await renderLibraryScreen({ isJoined: false })
		const release = holdHostCall("library_rename_document")

		await pressInTitle(await retitleFromDocumentBar("Plans"), "Enter")
		await leaveDocument()
		await release()

		await tileOf("Plans")
		expect(documentOpen()).toBeNull()
	})

	it("stays on the other document opened before the rename lands", async () => {
		harness.listed = [DOCUMENT, IDEAS]
		await renderLibraryScreen({ isJoined: false })
		const release = holdHostCall("library_rename_document")

		await pressInTitle(await retitleFromDocumentBar("Plans"), "Enter")
		await leaveDocument()
		await openIdeas()
		await release()
		await settle()

		expect(callsOf("library_rename_document")).toHaveLength(1)
		expect(shownTitle()).toBe("ideas")
	})

	it("only raises the notice when the host refuses after another document was opened", async () => {
		harness.listed = [DOCUMENT, IDEAS]
		harness.refused = "library_rename_document"
		await renderLibraryScreen({ isJoined: false })
		const release = holdHostCall("library_rename_document")

		await pressInTitle(await retitleFromDocumentBar("Plans"), "Enter")
		await leaveDocument()
		await openIdeas()
		await release()

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(failureOf("save")),
		)
		await settle()
		expect(shownTitle()).toBe("ideas")
	})

	it("keeps the editor shown, without reopening, once the rename lands", async () => {
		await renderLibraryScreen({ isJoined: false })
		const field = await retitleFromDocumentBar("Plans")
		holdHostCall("library_open_document")

		await pressInTitle(field, "Enter")

		await waitFor(() => expect(shownTitle()).toBe("Plans"))
		await settle()
		expect(libraryShown()).toBeNull()
		expect(shownTitle()).toBe("Plans")
		expect(callsAfterRename("library_open_document")).toEqual([])
	})

	it("saves the body typed during the rename to the renamed document only", async () => {
		await renderLibraryScreen({ isJoined: false })
		const release = holdHostCall("library_rename_document")

		await pressInTitle(await retitleFromDocumentBar("Plans"), "Enter")
		await typeInBody("Rollout")
		await settle(2 * SEND_INTERVAL_MS)
		await release()

		await waitFor(() => expect(textOfUpdatesTo("Plans.txt")).toBe("Rollout"))
		expect(callsAfterRename("library_apply_update")).not.toContainEqual(
			expect.objectContaining({ name: "notes.txt" }),
		)
	})
})

describe("the body of a .txt document", () => {
	it("saves the typed body with no block id marker", async () => {
		await renderLibraryScreen({ isJoined: false })
		await openNotes()

		await typeInBody("Rollout")

		await waitFor(() => expect(textOfUpdatesTo("notes.txt")).toBe("Rollout"))
	})
})

describe("the document bar", () => {
	it.each([
		["the host", false, "library_copy"],
		["a joined Space", true, "library_copy_bytes"],
	] as const)(
		"copies the open document on %s as the grid does and shows Copied",
		async (_space, isJoined, command) => {
			await renderLibraryScreen({ isJoined })
			await openNotes()

			await press(documentBarButton("copy"))

			await waitFor(() => expect(callsOf(command)).toHaveLength(1))
			expect(
				await screen.findByText(common("library.document.copied")),
			).toBeInstanceOf(HTMLElement)
		},
	)

	it.each([
		["the host", false, "library_save"],
		["a joined Space", true, "library_save_bytes"],
	] as const)(
		"downloads the open document on %s as the grid does",
		async (_space, isJoined, command) => {
			await renderLibraryScreen({ isJoined })
			await openNotes()

			await press(documentBarButton("download"))

			await waitFor(() => expect(callsOf(command)).toHaveLength(1))
		},
	)

	it("asks for a new tab on the open document", async () => {
		const { onOpenInNewTab } = await renderLibraryScreen({ isJoined: true })
		await openNotes()

		await pickInDocumentMore("openInNewTab")

		expect(onOpenInNewTab).toHaveBeenCalledWith({
			kind: "document",
			name: "notes.txt",
		})
	})

	it("reveals the open document on the host", async () => {
		await renderLibraryScreen({ isJoined: false })
		await openNotes()

		await pickInDocumentMore("showInFolder")

		await waitFor(() =>
			expect(callsOf("library_reveal")).toEqual([
				{ spaceId: SPACE_ID, name: "notes.txt" },
			]),
		)
	})

	it.each([
		["the host", false, ["openInNewTab", "rename", "showInFolder", "delete"]],
		["a joined Space", true, ["openInNewTab", "rename", "delete"]],
	] as const)(
		"offers in More on %s Rename and not Open",
		async (_space, isJoined, actions) => {
			await renderLibraryScreen({ isJoined })
			await openNotes()

			expect(await documentMoreItems()).toEqual(actions.map(menuItemOf))
		},
	)

	it.each(SPACES)(
		"deletes the open document on %s, closes it and shows the Library without it",
		async (_space, isJoined) => {
			await renderLibraryScreen({ isJoined })
			await openNotes()

			await pickInDocumentMore("delete")
			await confirmDelete()

			await waitFor(() => expect(libraryShown()).toBeInstanceOf(HTMLElement))
			await waitFor(() => expect(tileShown("notes")).toBe(false))
			expect(callsOf("library_delete")).toEqual([
				{ spaceId: SPACE_ID, name: "notes.txt" },
			])
			await settle(50)
			expect(raiseFailureNotice).not.toHaveBeenCalled()
		},
	)

	it("makes no delete call and keeps the document open when the person dismisses Delete", async () => {
		await renderLibraryScreen({ isJoined: false })
		await openNotes()

		await pickInDocumentMore("delete")
		const dialog = await screen.findByRole("alertdialog")
		await press(
			within(dialog).getByRole("button", { name: common("confirm.cancel") }),
		)

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
		expect(callsOf("library_delete")).toEqual([])
		expect(documentOpen()).toBeInstanceOf(HTMLElement)
	})

	it.each([
		["copy", "library_copy", "copy"],
		["download", "library_save", "save"],
	] as const)(
		"raises the grid's notice and keeps the document open when the host refuses %s",
		async (button, command, failure) => {
			harness.refused = command
			await renderLibraryScreen({ isJoined: false })
			await openNotes()

			await press(documentBarButton(button))

			await waitFor(() =>
				expect(raiseFailureNotice).toHaveBeenCalledWith(failureOf(failure)),
			)
			expect(documentOpen()).toBeInstanceOf(HTMLElement)
		},
	)

	it("raises the grid's notice and keeps the document open when the host refuses Delete", async () => {
		harness.refused = "library_delete"
		await renderLibraryScreen({ isJoined: false })
		await openNotes()

		await pickInDocumentMore("delete")
		await confirmDelete()

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(failureOf("delete")),
		)
		expect(documentOpen()).toBeInstanceOf(HTMLElement)
	})
})
