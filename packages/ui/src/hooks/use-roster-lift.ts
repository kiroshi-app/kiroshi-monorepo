import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react"

import { useStableCallback } from "@workspace/ui/hooks/use-stable-callback"
import { capturePointer, releasePointer } from "@workspace/ui/lib/touch"

const LIFT_THRESHOLD = 4

const DROP_AREA_ATTRIBUTE = "data-roster-drop"

export const dropArea = (landing: string) => ({
	[DROP_AREA_ATTRIBUTE]: landing,
})

export const dropAreaAt = (x: number, y: number) =>
	document
		.elementFromPoint(x, y)
		?.closest(`[${DROP_AREA_ATTRIBUTE}]`)
		?.getAttribute(DROP_AREA_ATTRIBUTE) ?? null

interface Point {
	x: number
	y: number
}

interface Press {
	from: Point
	end: () => void
}

interface Lift {
	id: string
}

const place = (node: HTMLElement | null, at: Point, from: Point) => {
	if (!node) return
	node.style.setProperty("--lift-x", `${at.x}px`)
	node.style.setProperty("--lift-y", `${at.y}px`)
	node.style.setProperty("--lift-dx", `${at.x - from.x}px`)
	node.style.setProperty("--lift-dy", `${at.y - from.y}px`)
}

const createLandingStore = <Landing>() => {
	let held: Landing | null = null
	const listeners = new Set<() => void>()
	return {
		read: () => held,
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		write: (next: Landing | null) => {
			held = next
			for (const listener of listeners) listener()
		},
	}
}

type LandingStore<Landing> = ReturnType<typeof createLandingStore<Landing>>

interface RosterLiftHandlers {
	onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
}

export interface Lifter {
	handlersFor: (id: string) => RosterLiftHandlers
	hasJustDropped: () => boolean
}

export interface RosterLift<Landing> extends Lifter {
	followRef: (node: HTMLElement | null) => void
	lift: Lift | null
	landing: LandingStore<Landing>
}

interface UseRosterLiftOptions<Landing> {
	isEnabled: boolean
	landingAt: (x: number, y: number, id: string) => Landing | null
	isSameLanding?: (one: Landing | null, other: Landing | null) => boolean
	onLift?: (id: string) => void
	onLand: (id: string, landing: Landing) => void
}

export const useLiftLanding = <Landing, Selected = Landing | null>(
	lift: RosterLift<Landing>,
	select: (landing: Landing | null) => Selected = (landing) =>
		landing as Selected,
) =>
	useSyncExternalStore(lift.landing.subscribe, () =>
		select(lift.landing.read()),
	)

export const useRosterLift = <Landing>({
	isEnabled,
	landingAt,
	isSameLanding = Object.is,
	onLift,
	onLand,
}: UseRosterLiftOptions<Landing>): RosterLift<Landing> => {
	const [lift, setLift] = useState<Lift | null>(null)
	const [landing] = useState(createLandingStore<Landing>)
	const press = useRef<Press | null>(null)
	const at = useRef<Point>({ x: 0, y: 0 })
	const followed = useRef<HTMLElement | null>(null)
	const hasDropped = useRef(false)
	const landingFor = useStableCallback(landingAt)
	const isSame = useStableCallback(isSameLanding)
	const lifted = useStableCallback((id: string) => onLift?.(id))
	const land = useStableCallback(onLand)

	const followRef = useCallback((node: HTMLElement | null) => {
		followed.current = node
		if (press.current) place(node, at.current, press.current.from)
	}, [])

	useEffect(() => () => press.current?.end(), [])

	const pressAt = (id: string, event: ReactPointerEvent<HTMLElement>) => {
		const element = event.currentTarget
		const { pointerId } = event
		const from = { x: event.clientX, y: event.clientY }
		let isLifted = false

		const end = () => {
			press.current = null
			window.removeEventListener("pointermove", follow)
			window.removeEventListener("pointerup", release)
			window.removeEventListener("pointercancel", cancel)
			window.removeEventListener("keydown", cancelOnEscape, true)
			element.removeEventListener("lostpointercapture", cancel)
			if (!isLifted) return
			releasePointer(element, pointerId)
			hasDropped.current = true
			landing.write(null)
			setLift(null)
		}

		const follow = (moved: PointerEvent) => {
			if (moved.pointerId !== pointerId) return
			at.current = { x: moved.clientX, y: moved.clientY }
			if (!isLifted) {
				const travelled = Math.hypot(
					at.current.x - from.x,
					at.current.y - from.y,
				)
				if (travelled < LIFT_THRESHOLD) return
				isLifted = true
				capturePointer(element, pointerId)
				element.addEventListener("lostpointercapture", cancel)
				window.addEventListener("keydown", cancelOnEscape, true)
				lifted(id)
				setLift({ id })
			}
			place(followed.current, at.current, from)
			const next = landingFor(at.current.x, at.current.y, id)
			if (!isSame(landing.read(), next)) landing.write(next)
		}

		const release = (released: PointerEvent) => {
			if (released.pointerId !== pointerId) return
			const dropped = isLifted
				? landingFor(released.clientX, released.clientY, id)
				: null
			end()
			if (dropped !== null) land(id, dropped)
		}

		const cancel = (cancelled: PointerEvent) => {
			if (cancelled.pointerId === pointerId) end()
		}

		const cancelOnEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return
			event.preventDefault()
			event.stopPropagation()
			end()
		}

		window.addEventListener("pointermove", follow)
		window.addEventListener("pointerup", release)
		window.addEventListener("pointercancel", cancel)
		press.current = { from, end }
	}

	const handlersFor = (id: string): RosterLiftHandlers => ({
		onPointerDown: (event) => {
			hasDropped.current = false
			if (!isEnabled || event.button !== 0 || press.current) return
			pressAt(id, event)
		},
	})

	const hasJustDropped = () => {
		if (!hasDropped.current) return false
		hasDropped.current = false
		return true
	}

	return { followRef, handlersFor, hasJustDropped, landing, lift }
}
