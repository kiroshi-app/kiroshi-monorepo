import { describe, expect, it, vi } from "vitest"

import { libraryBoardAdditionsOf } from "./library-board-additions"
import { readLinkPreview } from "./library-link-preview"
import type { LibraryUrlImport } from "./use-library-imports"

import type { LibraryItem } from "../bindings"

vi.mock("./library-link-preview", () => ({
	readLinkPreview: vi.fn(async (url: string) => ({ url, title: "A page" })),
}))

const DROP_POINT = { x: 40, y: 80 }

const LINK = "https://example.com/article"

const additionsOf = (landed: LibraryUrlImport = { kind: "failed" }) => {
	const board = { place: vi.fn(), describeLink: vi.fn() }
	const importUrl = vi.fn(async () => landed)
	const additions = libraryBoardAdditionsOf({
		board,
		libraryItems: [
			{ id: "cover.png", kind: "image", title: "cover.png", src: "" },
		],
		importFiles: async () => [],
		importUrl,
	})
	return { board, additions, importUrl }
}

const landedImage = (name: string): LibraryUrlImport => ({
	kind: "image",
	item: { name, kind: "image" } as LibraryItem,
})

describe("libraryBoardAdditionsOf", () => {
	it("adds a Library item at the board point it was picked or released at", () => {
		const { board, additions } = additionsOf()

		additions.placeItem("cover.png", DROP_POINT)

		expect(board.place).toHaveBeenCalledWith(
			expect.objectContaining({
				object: { kind: "image", item: "cover.png" },
				centre: DROP_POINT,
			}),
		)
	})

	it("adds nothing for an item no longer in the Library", () => {
		const { board, additions } = additionsOf()

		additions.placeItem("gone.png", DROP_POINT)

		expect(board.place).not.toHaveBeenCalled()
	})

	it("adds a dropped image link as its Library image centred on the drop point", async () => {
		const { board, additions, importUrl } = additionsOf(
			landedImage("photo.png"),
		)

		additions.dropUrl(LINK, DROP_POINT)

		expect(importUrl).toHaveBeenCalledWith(LINK)
		await vi.waitFor(() =>
			expect(board.place).toHaveBeenCalledWith(
				expect.objectContaining({
					object: { kind: "image", item: "photo.png" },
					centre: DROP_POINT,
				}),
			),
		)
	})

	it("adds a dropped page link as a link card at the drop point, then describes it", async () => {
		const { board, additions } = additionsOf({ kind: "page" })

		additions.dropUrl(LINK, DROP_POINT)

		await vi.waitFor(() =>
			expect(board.describeLink).toHaveBeenCalledWith(expect.any(String), {
				url: LINK,
				title: "A page",
			}),
		)
		expect(board.place).toHaveBeenCalledWith(
			expect.objectContaining({
				object: { kind: "linkCard", url: LINK },
				centre: DROP_POINT,
			}),
		)
		expect(readLinkPreview).toHaveBeenCalledWith(LINK)
	})

	it("adds nothing for a dropped link whose import failed", async () => {
		const { board, additions, importUrl } = additionsOf({ kind: "failed" })

		additions.dropUrl(LINK, DROP_POINT)

		await vi.waitFor(() => expect(importUrl).toHaveBeenCalled())
		await Promise.resolve()
		expect(board.place).not.toHaveBeenCalled()
	})
})
