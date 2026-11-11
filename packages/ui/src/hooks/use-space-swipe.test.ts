// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Space } from "@workspace/ui/components/space"
import { usePrefersReducedMotion } from "@workspace/ui/hooks/use-prefers-reduced-motion"
import { useSpaceSwipe } from "@workspace/ui/hooks/use-space-swipe"
import {
	dispatchTrackpadWheels,
	trackpadSwipe,
	trackpadSwipeDuration,
} from "@workspace/ui/hooks/use-space-swipe.fixtures"

vi.mock("@workspace/ui/hooks/use-prefers-reduced-motion", () => ({
	usePrefersReducedMotion: vi.fn(() => false),
}))

const SPACES: Space[] = [
	{ id: "kiroshi", name: "Kiroshi", avatarSeed: "kiroshi" },
	{ id: "perso", name: "Perso", avatarSeed: "perso" },
	{ id: "vocca", name: "Vocca", avatarSeed: "vocca" },
]

const SETTLED_MS = 1000

type Swipe = Parameters<typeof useSpaceSwipe>[0]

const mountSwipe = (swipe: Partial<Swipe> = {}) => {
	const onSelectSpace = vi.fn()
	const { result } = renderHook(() =>
		useSpaceSwipe({
			spaces: SPACES,
			selectedSpaceId: "perso",
			onSelectSpace,
			...swipe,
		}),
	)
	const node = document.createElement("nav")
	const target = document.createElement("button")
	node.append(target)
	document.body.append(node)
	result.current(node)
	return { node, target, onSelectSpace }
}

const offsetOf = (node: HTMLElement) =>
	node.style.getPropertyValue("--space-swipe-offset")

describe("useSpaceSwipe on a trackpad", () => {
	beforeEach(() => {
		vi.mocked(usePrefersReducedMotion).mockReturnValue(false)
	})

	afterEach(() => {
		cleanup()
		document.body.replaceChildren()
		vi.useRealTimers()
	})

	it("moves one Space forward for a moderate swipe, momentum included", () => {
		const { target, onSelectSpace } = mountSwipe()
		const { fingers, momentum } = trackpadSwipe(1)

		const cancelled = dispatchTrackpadWheels(
			target,
			[...fingers, ...momentum],
			0,
		)

		expect(onSelectSpace).toHaveBeenCalledTimes(1)
		expect(onSelectSpace).toHaveBeenCalledWith("vocca")
		expect(cancelled).not.toContain(false)
	})

	it("moves one Space backward for a swipe the other way", () => {
		const { target, onSelectSpace } = mountSwipe()
		const { fingers, momentum } = trackpadSwipe(-1)

		dispatchTrackpadWheels(target, [...fingers, ...momentum], 0)

		expect(onSelectSpace).toHaveBeenCalledTimes(1)
		expect(onSelectSpace).toHaveBeenCalledWith("kiroshi")
	})

	it("moves once per swipe across two swipes apart in time", () => {
		const { target, onSelectSpace } = mountSwipe({ selectedSpaceId: "kiroshi" })
		const { fingers, momentum } = trackpadSwipe(1)
		const swipe = [...fingers, ...momentum]

		dispatchTrackpadWheels(target, swipe, 0)
		dispatchTrackpadWheels(target, swipe, trackpadSwipeDuration + SETTLED_MS)

		expect(onSelectSpace).toHaveBeenCalledTimes(2)
	})

	it("moves the content with the fingers before the Space changes", () => {
		const { node, target, onSelectSpace } = mountSwipe()

		dispatchTrackpadWheels(target, trackpadSwipe(1).fingers.slice(0, 6), 0)

		expect(onSelectSpace).not.toHaveBeenCalled()
		expect(node.dataset.spaceSwipe).toBe("following")
		expect(Number.parseFloat(offsetOf(node))).toBeLessThan(0)
	})

	it("settles the content back when the swipe stops short", () => {
		vi.useFakeTimers()
		const { node, target, onSelectSpace } = mountSwipe()

		dispatchTrackpadWheels(target, trackpadSwipe(-1).fingers.slice(0, 6), 0)
		vi.advanceTimersByTime(200)

		expect(onSelectSpace).not.toHaveBeenCalled()
		expect(node.dataset.spaceSwipe).toBe("settling")
		expect(offsetOf(node)).toBe("0px")

		vi.advanceTimersByTime(SETTLED_MS)
		expect(node.dataset.spaceSwipe).toBeUndefined()
	})

	it("changes Space without moving the content under reduced motion", () => {
		vi.mocked(usePrefersReducedMotion).mockReturnValue(true)
		const { node, target, onSelectSpace } = mountSwipe()
		const { fingers, momentum } = trackpadSwipe(1)

		dispatchTrackpadWheels(target, fingers, 0)
		expect(node.dataset.spaceSwipe).toBeUndefined()
		dispatchTrackpadWheels(target, momentum, 0)

		expect(onSelectSpace).toHaveBeenCalledTimes(1)
		expect(node.dataset.spaceSwipe).toBeUndefined()
		expect(offsetOf(node)).toBe("")
	})

	it("leaves a mostly vertical gesture to the list", () => {
		const { target, onSelectSpace } = mountSwipe()
		const vertical = trackpadSwipe(1).fingers.map((wheel) => ({
			...wheel,
			deltaX: Math.round(wheel.deltaX / 3),
			deltaY: wheel.deltaX,
		}))

		const cancelled = dispatchTrackpadWheels(target, vertical, 0)

		expect(onSelectSpace).not.toHaveBeenCalled()
		expect(cancelled).not.toContain(true)
	})

	it("keeps the last Space on a swipe past it", () => {
		const { node, target, onSelectSpace } = mountSwipe({
			selectedSpaceId: "vocca",
		})
		const { fingers, momentum } = trackpadSwipe(1)

		dispatchTrackpadWheels(target, [...fingers, ...momentum], 0)

		expect(onSelectSpace).not.toHaveBeenCalled()
		expect(node.dataset.spaceSwipe).toBeUndefined()
	})

	it("keeps the first Space on a swipe before it", () => {
		const { target, onSelectSpace } = mountSwipe({
			selectedSpaceId: "kiroshi",
		})
		const { fingers, momentum } = trackpadSwipe(-1)

		dispatchTrackpadWheels(target, [...fingers, ...momentum], 0)

		expect(onSelectSpace).not.toHaveBeenCalled()
	})

	it("leaves the swipe to a text field", () => {
		const { node, onSelectSpace } = mountSwipe()
		const field = document.createElement("input")
		node.append(field)
		const { fingers, momentum } = trackpadSwipe(1)

		const cancelled = dispatchTrackpadWheels(
			field,
			[...fingers, ...momentum],
			0,
		)

		expect(onSelectSpace).not.toHaveBeenCalled()
		expect(cancelled).not.toContain(true)
	})

	it("ignores the swipe while switching is disabled", () => {
		const { node, target, onSelectSpace } = mountSwipe({ isEnabled: false })
		const { fingers, momentum } = trackpadSwipe(1)

		const cancelled = dispatchTrackpadWheels(
			target,
			[...fingers, ...momentum],
			0,
		)

		expect(onSelectSpace).not.toHaveBeenCalled()
		expect(cancelled).not.toContain(true)
		expect(node.dataset.spaceSwipe).toBeUndefined()
	})

	it("ignores the swipe with a single Space", () => {
		const { target, onSelectSpace } = mountSwipe({
			spaces: [{ id: "perso", name: "Perso", avatarSeed: "perso" }],
		})
		const { fingers, momentum } = trackpadSwipe(1)

		dispatchTrackpadWheels(target, [...fingers, ...momentum], 0)

		expect(onSelectSpace).not.toHaveBeenCalled()
	})
})
