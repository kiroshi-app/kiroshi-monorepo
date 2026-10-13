// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { usePrefersReducedMotion } from "@workspace/ui/hooks/use-prefers-reduced-motion"
import {
	type SkeletonTiming,
	useSkeletonTiming,
} from "@workspace/ui/hooks/use-skeleton-timing"

vi.mock("@workspace/ui/hooks/use-prefers-reduced-motion", () => ({
	usePrefersReducedMotion: vi.fn(() => false),
}))

type HookProps = {
	isPending: boolean
}

const renderTiming = (isPending: boolean, timing?: SkeletonTiming) =>
	renderHook(
		({ isPending: pending }: HookProps) => useSkeletonTiming(pending, timing),
		{ initialProps: { isPending } },
	)

const advance = (ms: number) => {
	for (let tick = 0; tick < ms; tick += 1)
		act(() => {
			vi.advanceTimersByTime(1)
		})
}

describe("useSkeletonTiming", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.mocked(usePrefersReducedMotion).mockReturnValue(false)
	})

	afterEach(() => {
		cleanup()
		vi.useRealTimers()
	})

	it("reports content at once when the data is present at mount", () => {
		const { result } = renderTiming(false)

		expect(result.current).toBe("content")
		advance(1000)
		expect(result.current).toBe("content")
	})

	it("keeps the skeleton hidden for the first 300 ms of pending", () => {
		const { result } = renderTiming(true)

		advance(299)
		expect(result.current).toBe("delay")
		advance(1)
		expect(result.current).toBe("skeleton")
	})

	it("never shows the skeleton when pending ends at 299 ms", () => {
		const { result, rerender } = renderTiming(true)

		advance(299)
		rerender({ isPending: false })
		expect(result.current).toBe("content")
		advance(1000)
		expect(result.current).toBe("content")
	})

	it("holds the skeleton 500 ms when pending ends at 310 ms, then fades for 150 ms", () => {
		const { result, rerender } = renderTiming(true)

		advance(310)
		expect(result.current).toBe("skeleton")
		rerender({ isPending: false })
		expect(result.current).toBe("skeleton")
		advance(489)
		expect(result.current).toBe("skeleton")
		advance(1)
		expect(result.current).toBe("fade")
		advance(149)
		expect(result.current).toBe("fade")
		advance(1)
		expect(result.current).toBe("content")
	})

	it("releases the skeleton as soon as pending ends past the hold", () => {
		const { result, rerender } = renderTiming(true)

		advance(1200)
		expect(result.current).toBe("skeleton")
		rerender({ isPending: false })
		expect(result.current).toBe("fade")
	})

	it("skips the fade and keeps the delay and the hold under reduced motion", () => {
		vi.mocked(usePrefersReducedMotion).mockReturnValue(true)
		const { result, rerender } = renderTiming(true)

		advance(299)
		expect(result.current).toBe("delay")
		advance(11)
		rerender({ isPending: false })
		advance(489)
		expect(result.current).toBe("skeleton")
		advance(1)
		expect(result.current).toBe("content")
	})

	it("takes each duration from the call", () => {
		const { result, rerender } = renderTiming(true, {
			delayMs: 100,
			holdMs: 200,
			fadeMs: 50,
		})

		advance(100)
		expect(result.current).toBe("skeleton")
		rerender({ isPending: false })
		advance(200)
		expect(result.current).toBe("fade")
		advance(50)
		expect(result.current).toBe("content")
	})

	it("starts a new delay when pending returns during the fade", () => {
		const { result, rerender } = renderTiming(true)

		advance(800)
		rerender({ isPending: false })
		expect(result.current).toBe("fade")
		rerender({ isPending: true })
		expect(result.current).toBe("delay")
	})

	it.each([
		["the delay", 100, true],
		["the hold", 400, true],
		["the fade", 900, false],
	])(
		"clears every timer on unmount during %s",
		(_, elapsed, isPendingAtUnmount) => {
			const { rerender, unmount } = renderTiming(true)

			advance(elapsed)
			if (!isPendingAtUnmount) rerender({ isPending: false })
			expect(vi.getTimerCount()).toBe(1)
			unmount()

			expect(vi.getTimerCount()).toBe(0)
		},
	)
})
