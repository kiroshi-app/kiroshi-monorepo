// @vitest-environment happy-dom

import { act, cleanup, fireEvent, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useLibraryBoardKeys } from "./use-library-board-keys"

const mountBoardSurface = () => {
	const surface = document.createElement("div")
	surface.dataset.slot = "board-canvas"
	surface.tabIndex = 0
	document.body.append(surface)
	return surface
}

const mountKeys = () => {
	const surface = mountBoardSurface()
	const hook = renderHook(() =>
		useLibraryBoardKeys({ undo: vi.fn(), redo: vi.fn() }),
	)
	return { ...hook, surface }
}

afterEach(() => {
	cleanup()
	document.body.replaceChildren()
})

describe("useLibraryBoardKeys", () => {
	it("releases the hand tool and gives the previous tool back when the window loses focus", () => {
		const { result, rerender, surface } = mountKeys()
		act(() => result.current.pickTool("sticky"))

		fireEvent.keyDown(surface, { key: " " })
		rerender()
		expect(result.current.tool).toBe("hand")

		act(() => {
			window.dispatchEvent(new Event("blur"))
		})
		rerender()

		expect(result.current.tool).toBe("sticky")
	})

	it("keeps the picked tool on a blur with Space up", () => {
		const { result } = mountKeys()
		act(() => result.current.pickTool("text"))

		act(() => {
			window.dispatchEvent(new Event("blur"))
		})

		expect(result.current.tool).toBe("text")
	})
})
