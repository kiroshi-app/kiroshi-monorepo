import { useCallback, useRef } from "react"

import type { Space } from "@workspace/ui/components/space"
import { isRosterLiftUnderway } from "@workspace/ui/hooks/use-roster-lift"
import { useStableCallback } from "@workspace/ui/hooks/use-stable-callback"
import { isTypingTarget } from "@workspace/ui/lib/typing-target"

const SWIPE_END_GAP_MS = 150

const AXIS_SLOP_PX = 6

const SWIPE_TRAVEL_PX = 160

type GestureAxis = "undecided" | "horizontal" | "vertical" | "ignored"

type Gesture = {
	axis: GestureAxis
	lastAt: number
	x: number
	y: number
	isSpent: boolean
}

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

const hasTravelledASwipe = ({ axis, isSpent, x }: Gesture) =>
	axis === "horizontal" && !isSpent && Math.abs(x) >= SWIPE_TRAVEL_PX

export const useSpaceSwipe = ({
	spaces,
	selectedSpaceId,
	isEnabled = true,
	onSelectSpace,
}: SpaceSwipe) => {
	const running = useRef<Gesture | null>(null)

	const step = useStableCallback((direction: number) => {
		if (!isEnabled || isRosterLiftUnderway()) return
		const current = Math.max(
			spaces.findIndex((space) => space.id === selectedSpaceId),
			0,
		)
		const next = spaces[current + direction]
		if (next) onSelectSpace?.(next.id)
	})

	return useCallback(
		(node: HTMLElement) => {
			const follow = (event: WheelEvent) => {
				const gesture = followedBy(
					continuedOrNew(running.current, event),
					event,
				)
				running.current = gesture
				if (leavesScrollToBrowser(gesture, event)) return
				event.preventDefault()
				if (!hasTravelledASwipe(gesture)) return
				gesture.isSpent = true
				step(Math.sign(gesture.x))
			}

			node.addEventListener("wheel", follow, { passive: false })
			return () => node.removeEventListener("wheel", follow)
		},
		[step],
	)
}
