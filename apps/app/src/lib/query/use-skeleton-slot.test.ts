// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { createElement, isValidElement } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { useSkeletonSlot } from "./use-skeleton-slot"

type SlotProps = {
	isPending: boolean
}

const SKELETON = createElement("output")

const SKELETON_DELAY_MS = 300

const renderSlot = (isPending: boolean) =>
	renderHook(
		({ isPending: pending }: SlotProps) => useSkeletonSlot(pending, SKELETON),
		{ initialProps: { isPending } },
	)

const passing = (ms: number) =>
	act(() => {
		vi.advanceTimersByTime(ms)
	})

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	cleanup()
	vi.useRealTimers()
})

it("holds an empty slot through the delay, then the skeleton", () => {
	const { result } = renderSlot(true)

	expect(isValidElement(result.current)).toBe(true)
	expect(result.current).not.toBe(SKELETON)
	passing(SKELETON_DELAY_MS)

	expect(result.current).toBe(SKELETON)
})

it("leaves the slot empty when the data is held at mount", () => {
	const { result } = renderSlot(false)
	passing(SKELETON_DELAY_MS)

	expect(result.current).toBeUndefined()
})

it("hands the surface back at once when the read answers within the delay", () => {
	const { result, rerender } = renderSlot(true)
	passing(SKELETON_DELAY_MS - 1)
	rerender({ isPending: false })

	expect(result.current).toBeUndefined()
})
