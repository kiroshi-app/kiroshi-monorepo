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

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { LibraryScreen } from "@/components/library-screen"
import type { LibraryItem } from "@/lib/bindings"
import type { Invoke } from "@/lib/host/joined-hosts-invoke"
import { base64Of } from "@/lib/library/library-document-session"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

type HostCall = { command: string; args: unknown }

type NamedCall = { name: string }

type Harness = {
	listed: LibraryItem[]
	calls: HostCall[]
	refused: string | null
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
	(): Harness => ({ listed: [], calls: [], refused: null }),
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

const LIBRARY_ANSWERS: Record<string, (args: NamedCall) => unknown> = {
	library_list: () => harness.listed,
	library_read_document: ({ name }) => ({ name, format: "text", content: "" }),
	library_read_image: ({ name }) => ({
		name,
		mimeType: "image/png",
		content: "",
	}),
	library_read_file: ({ name }) => ({ name, content: FILE_CONTENT }),
	library_open_document: ({ name }) => ({
		name,
		update: base64Of(Y.encodeStateAsUpdate(new Y.Doc())),
	}),
	library_apply_update: () => null,
	library_share_caret: () => null,
	library_rename_document: ({ name }) => itemNamed(name, "document"),
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
}))

vi.mock("@/lib/host/tauri", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/tauri")>()),
	convertFileSrc: (path: string) => `asset://${path}`,
}))

const common = i18n.getFixedT(null, "common")

const LIBRARY_TITLE = common("library.title")

type ScreenOptions = {
	isJoined: boolean
	openedOnArrival?: string
}

const renderLibraryScreen = async ({
	isJoined,
	openedOnArrival,
}: ScreenOptions) => {
	const onOpenInNewTab = vi.fn()
	render(
		createElement(LibraryScreen, {
			spaceId: SPACE_ID,
			isJoined,
			bots: [],
			openedOnArrival,
			onOpenInNewTab,
		}),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
	await screen.findByRole("heading", { level: 1, name: LIBRARY_TITLE })
	return { onOpenInNewTab }
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
		fireEvent.change(field, { target: { value: title } })
	})
	await press(
		screen.getByRole("button", { name: common("library.document.back") }),
	)
}

beforeEach(() => {
	harness.listed = [DOCUMENT, IMAGE]
	harness.calls = []
	harness.refused = null
	vi.mocked(raiseFailureNotice).mockClear()
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

		expect(onOpenInNewTab.mock.calls.map(([item]) => item.id)).toEqual([
			"notes.txt",
			"diagram.png",
		])
	})

	it("opens the item the tab names once the Library lists it", async () => {
		await renderLibraryScreen({ isJoined: false, openedOnArrival: "notes.txt" })

		expect((await titleField()).value).toBe("notes")
	})
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

	it("raises a notice and keeps the Library on rename", async () => {
		harness.refused = "library_rename_document"
		await renderLibraryScreen({ isJoined: false })

		await renameNotesTo("Plans")

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(failureOf("save")),
		)
		expect(libraryShown()).toBeInstanceOf(HTMLElement)
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

		expect(onOpenInNewTab).toHaveBeenCalledWith({ id: "notes.txt" })
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
		["the host", false, ["openInNewTab", "showInFolder", "delete"]],
		["a joined Space", true, ["openInNewTab", "delete"]],
	] as const)(
		"offers in More on %s neither Open nor Rename",
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
