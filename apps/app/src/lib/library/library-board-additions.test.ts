import { describe, expect, it, vi } from "vitest"

import { libraryBoardAdditionsOf } from "./library-board-additions"

const additionsOf = () => {
	const board = { place: vi.fn(), describeLink: vi.fn() }
	const additions = libraryBoardAdditionsOf({
		board,
		libraryItems: [
			{ id: "cover.png", kind: "image", title: "cover.png", src: "" },
		],
		importFiles: async () => [],
		viewport: { offset: { x: 0, y: 0 }, zoom: 1 },
	})
	return { board, additions }
}

describe("libraryBoardAdditionsOf", () => {
	it("adds a Library item dragged out of the picker where it was released", () => {
		const { board, additions } = additionsOf()

		additions.dropItem("cover.png", { x: 40, y: 80 })

		expect(board.place).toHaveBeenCalledWith(
			expect.objectContaining({
				object: { kind: "image", item: "cover.png" },
				centre: { x: 40, y: 80 },
			}),
		)
	})

	it("adds nothing for an item no longer in the Library", () => {
		const { board, additions } = additionsOf()

		additions.dropItem("gone.png", { x: 40, y: 80 })

		expect(board.place).not.toHaveBeenCalled()
	})
})
