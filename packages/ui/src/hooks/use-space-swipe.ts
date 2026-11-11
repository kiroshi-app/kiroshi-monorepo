import { useCallback } from "react"

import type { Space } from "@workspace/ui/components/space"
import { prefersReducedMotion } from "@workspace/ui/hooks/use-prefers-reduced-motion"
import { isRosterLiftUnderway } from "@workspace/ui/hooks/use-roster-lift"
import { useStableCallback } from "@workspace/ui/hooks/use-stable-callback"
import { isTypingTarget } from "@workspace/ui/lib/typing-target"

const SWIPE_END_GAP_MS = 150

const AXIS_SLOP_PX = 6

const SWIPE_TRAVEL_PX = 48

const SETTLE_MS = 180

const OFFSET_PROPERTY = "--space-swipe-offset"

export const SPACE_SWIPE_FOLLOWER =
	"in-data-space-swipe:translate-x-(--space-swipe-offset) in-data-[space-swipe=settling]:transition-[translate] in-data-[space-swipe=settling]:duration-180 in-data-[space-swipe=settling]:ease-[cubic-bezier(0.25,1,0.5,1)]"

type GestureAxis = "undecided" | "horizontal" | "vertical" | "ignored"

type Gesture = {
	axis: GestureAxis
	lastAt: number
	x: number
	y: number
	isSpent: boolean
}

type SwipePhase = "following" | "settling"

type SpaceSwipe = {
	spaces: Space[]
	selectedSpaceId?: string
	isEnabled?: boolean
	onSelectSpace?: (id: string) => void
}

const gestureFrom = (event: WheelEvent): Gesture => ({
	axis: isTypingTarget(event.target) ? "ignored" : "undecided",
	lastAt: event.timeStamp,
	x: 0,
	y: 0,
	isSpent: false,
})

const continuedOrNew = (gesture: Gesture | null, event: WheelEvent) =>
	gesture && event.timeStamp - gesture.lastAt <= SWIPE_END_GAP_MS
		? gesture
		: gestureFrom(event)

const axisOf = ({ axis, x, y }: Gesture): GestureAxis => {
	if (axis !== "undecided" || Math.hypot(x, y) < AXIS_SLOP_PX) return axis
	return Math.abs(x) > Math.abs(y) ? "horizontal" : "vertical"
}

const followedBy = (gesture: Gesture, event: WheelEvent): Gesture => {
	const moved = {
		...gesture,
		lastAt: event.timeStamp,
		x: gesture.x + event.deltaX,
		y: gesture.y + event.deltaY,
	}
	return { ...moved, axis: axisOf(moved) }
}

const leavesScrollToBrowser = ({ axis }: Gesture, event: WheelEvent) =>
	axis === "vertical" ||
	axis === "ignored" ||
	(axis === "undecided" && Math.abs(event.deltaY) > Math.abs(event.deltaX))

const drawSwipe = (node: HTMLElement, phase: SwipePhase, offset: number) => {
	node.dataset.spaceSwipe = phase
	node.style.setProperty(OFFSET_PROPERTY, `${offset}px`)
}

const clearSwipe = (node: HTMLElement) => {
	delete node.dataset.spaceSwipe
	node.style.removeProperty(OFFSET_PROPERTY)
}

export const useSpaceSwipe = ({
	spaces,
	selectedSpaceId,
	isEnabled = true,
	onSelectSpace,
}: SpaceSwipe) => {
	const canSwipe = useStableCallback(
		() => isEnabled && spaces.length > 1 && !isRosterLiftUnderway(),
	)

	const neighbourTowards = useStableCallback(
		({ axis, isSpent, x }: Gesture) => {
			if (isSpent || axis !== "horizontal") return undefined
			const current = Math.max(
				spaces.findIndex((space) => space.id === selectedSpaceId),
				0,
			)
			return spaces[current + Math.sign(x)]
		},
	)

	const select = useStableCallback((id: string) => onSelectSpace?.(id))

	return useCallback(
		(node: HTMLElement) => {
			let running: Gesture | null = null
			let ending: ReturnType<typeof setTimeout> | undefined
			let entering = 0

			const settle = () => {
				drawSwipe(node, "settling", 0)
				ending = setTimeout(() => clearSwipe(node), SETTLE_MS)
			}

			const settleAfterGap = () => {
				clearTimeout(ending)
				ending = setTimeout(settle, SWIPE_END_GAP_MS)
			}

			const enterFrom = (direction: number) => {
				drawSwipe(node, "following", direction * SWIPE_TRAVEL_PX)
				entering = requestAnimationFrame(() => {
					entering = requestAnimationFrame(settle)
				})
			}

			const move = (gesture: Gesture, neighbour: Space) => {
				const direction = Math.sign(gesture.x)
				const travel = Math.abs(gesture.x)
				if (travel >= SWIPE_TRAVEL_PX) {
					gesture.isSpent = true
					select(neighbour.id)
					if (!prefersReducedMotion()) enterFrom(direction)
					return
				}
				if (prefersReducedMotion()) return
				cancelAnimationFrame(entering)
				drawSwipe(node, "following", -direction * travel)
				settleAfterGap()
			}

			const follow = (event: WheelEvent) => {
				const gesture = followedBy(continuedOrNew(running, event), event)
				running = gesture
				if (leavesScrollToBrowser(gesture, event) || !canSwipe()) return
				event.preventDefault()
				const neighbour = neighbourTowards(gesture)
				if (neighbour) move(gesture, neighbour)
			}

			node.addEventListener("wheel", follow, { passive: false })
			return () => {
				node.removeEventListener("wheel", follow)
				clearTimeout(ending)
				cancelAnimationFrame(entering)
				clearSwipe(node)
			}
		},
		[canSwipe, neighbourTowards, select],
	)
}
