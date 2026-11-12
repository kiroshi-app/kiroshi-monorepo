// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useTravel } from "@workspace/ui/hooks/use-travel"

type Position = {
	rank: number
	isWatching?: boolean
}

const travelFrom = (initialProps: Position) =>
	renderHook(({ rank, isWatching }: Position) => useTravel(rank, isWatching), {
		initialProps,
	})

afterEach(cleanup)

describe("useTravel", () => {
	it("reports no travel on the first render", () => {
		const { result } = travelFrom({ rank: 2 })

		expect(result.current).toBeUndefined()
	})

	it("reports forward when the rank grows and back when it shrinks", () => {
		const { result, rerender } = travelFrom({ rank: 1 })

		rerender({ rank: 2 })
		expect(result.current).toBe("forward")

		rerender({ rank: 1 })
		expect(result.current).toBe("back")
	})

	it("keeps the last travel while the rank holds", () => {
		const { result, rerender } = travelFrom({ rank: 1 })

		rerender({ rank: 2 })
		rerender({ rank: 2 })

		expect(result.current).toBe("forward")
	})

	it("forgets its travel once it stops watching", () => {
		const { result, rerender } = travelFrom({ rank: 0, isWatching: true })

		rerender({ rank: 1, isWatching: true })
		rerender({ rank: 1, isWatching: false })

		expect(result.current).toBeUndefined()
	})

	it("reports no travel for a rank that moved while it was not watching", () => {
		const { result, rerender } = travelFrom({ rank: 0, isWatching: false })

		rerender({ rank: 1, isWatching: true })

		expect(result.current).toBeUndefined()
	})
})
