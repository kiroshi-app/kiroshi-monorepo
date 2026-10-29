import { type RefObject, useRef } from "react"

import {
	type Point,
	type UseRosterLiftOptions,
	useRosterLift,
} from "@workspace/ui/hooks/use-roster-lift"

export type SlideAxis = "x" | "y"

export type SlideShift = "start" | "end"

export const SHIFTABLE = {
	x: "data-[shift=start]:-translate-x-(--tab-shift) data-[shift=end]:translate-x-(--tab-shift)",
	y: "data-[shift=start]:-translate-y-(--row-shift) data-[shift=end]:translate-y-(--row-shift)",
} as const satisfies Record<SlideAxis, string>

export const SLIDING =
	"transition-[translate] duration-150 ease-out motion-reduce:transition-none"

const SHIFT_VARIABLE = {
	x: "--tab-shift",
	y: "--row-shift",
} as const satisfies Record<SlideAxis, string>

export type SlotBox = Pick<
	DOMRectReadOnly,
	"left" | "right" | "top" | "bottom" | "width" | "height"
>

type SlotSpan = {
	id: string
	rank: number
	start: number
	end: number
}

export type SlideGeometry = {
	axis: SlideAxis
	liftedId: string
	origin: number
	rest: SlotBox
	press: number
	slots: SlotSpan[]
	minShift: number
	maxShift: number
	shift: number
}

const startOf = (box: SlotBox, axis: SlideAxis) =>
	axis === "x" ? box.left : box.top

const endOf = (box: SlotBox, axis: SlideAxis) =>
	axis === "x" ? box.right : box.bottom

const sizeOf = (box: SlotBox, axis: SlideAxis) =>
	axis === "x" ? box.width : box.height

const isRendered = (box: SlotBox) => box.width > 0 && box.height > 0

type SlideGeometrySource = {
	axis: SlideAxis
	zone: readonly string[]
	boxes: readonly SlotBox[]
	liftedId: string
	press: Point
	gap: number
}

export const slideGeometryOf = ({
	axis,
	zone,
	boxes,
	liftedId,
	press,
	gap,
}: SlideGeometrySource): SlideGeometry => {
	const origin = zone.indexOf(liftedId)
	const rest = boxes[origin]
	const slots = zone
		.map((id, rank) => ({ id, rank, box: boxes[rank] }))
		.filter(({ box }) => isRendered(box))
		.map(({ id, rank, box }) => ({
			id,
			rank,
			start: startOf(box, axis),
			end: endOf(box, axis),
		}))
	return {
		axis,
		liftedId,
		origin,
		rest,
		press: press[axis],
		slots,
		minShift: slots[0].start - startOf(rest, axis),
		maxShift: slots[slots.length - 1].end - endOf(rest, axis),
		shift: sizeOf(rest, axis) + gap,
	}
}

export const slideLandingIn = (
	geometry: SlideGeometry,
	x: number,
	y: number,
) => {
	const { axis, origin, rest, slots } = geometry
	const travel = Math.min(
		Math.max((axis === "x" ? x : y) - geometry.press, geometry.minShift),
		geometry.maxShift,
	)
	const start = startOf(rest, axis) + travel
	const distances = slots.map((slot) =>
		Math.abs(
			(slot.rank > origin ? slot.end - sizeOf(rest, axis) : slot.start) - start,
		),
	)
	return slots[distances.indexOf(Math.min(...distances))].rank
}

export const slideShiftIn = (
	geometry: SlideGeometry,
	id: string,
	landing: number,
): SlideShift | undefined => {
	const { origin } = geometry
	const rank = geometry.slots.find((slot) => slot.id === id)?.rank
	if (rank === undefined || rank === origin) return undefined
	if (rank > origin && rank <= landing) return "start"
	if (rank < origin && rank >= landing) return "end"
	return undefined
}

const pixelsOf = (value: string) => Number.parseFloat(value) || 0

const measureSlide = (
	container: HTMLElement,
	axis: SlideAxis,
	slot: string,
	zones: readonly (readonly string[])[],
	liftedId: string,
	press: Point,
) => {
	const nodes = [...container.querySelectorAll(slot)]
	const zone = zones.find((ids) => ids.includes(liftedId)) ?? []
	const offset = zones.flat().indexOf(zone[0])
	const zoneNodes = nodes.slice(offset, offset + zone.length)
	const parent = zoneNodes[zone.indexOf(liftedId)].parentElement
	const geometry = slideGeometryOf({
		axis,
		zone,
		boxes: zoneNodes.map((node) => node.getBoundingClientRect()),
		liftedId,
		press,
		gap: parent
			? pixelsOf(
					getComputedStyle(parent)[axis === "x" ? "columnGap" : "rowGap"],
				)
			: 0,
	})
	container.style.setProperty(SHIFT_VARIABLE[axis], `${geometry.shift}px`)
	container.style.setProperty("--lift-min", `${geometry.minShift}px`)
	container.style.setProperty("--lift-max", `${geometry.maxShift}px`)
	return geometry
}

type UseSlidingLiftOptions<Landing> = Omit<
	UseRosterLiftOptions<number | Landing>,
	"landingAt"
> & {
	axis: SlideAxis
	slot: string
	zones: readonly (readonly string[])[]
	containerRef: RefObject<HTMLElement | null>
	landingOutside?: (
		x: number,
		y: number,
		geometry: SlideGeometry,
	) => Landing | null
}

export const useSlidingLift = <Landing = never>({
	axis,
	slot,
	zones,
	containerRef,
	landingOutside,
	onLift,
	...options
}: UseSlidingLiftOptions<Landing>) => {
	const geometry = useRef<SlideGeometry | null>(null)

	const measure = (id: string, press: Point) => {
		const container = containerRef.current
		geometry.current = container
			? measureSlide(container, axis, slot, zones, id, press)
			: null
		return geometry.current
	}

	const landingAt = (x: number, y: number) =>
		geometry.current ? slideLandingIn(geometry.current, x, y) : null

	const shiftOf = (id: string, landing: number | Landing | null) =>
		geometry.current && typeof landing === "number"
			? slideShiftIn(geometry.current, id, landing)
			: undefined

	const lift = useRosterLift<number | Landing>({
		...options,
		landingAt: (x, y) => {
			const measured = geometry.current
			if (!measured) return null
			return landingOutside?.(x, y, measured) ?? slideLandingIn(measured, x, y)
		},
		onLift: (id, press) => {
			measure(id, press)
			onLift?.(id, press)
		},
	})

	return { lift, measure, landingAt, shiftOf }
}
