import { describe, expect, it } from "vitest"

import {
	type SlideAxis,
	type SlideGeometry,
	type SlotBox,
	slideGeometryOf,
	slideLandingIn,
	slideShiftIn,
} from "@workspace/ui/hooks/use-sliding-lift"

const GAP = 4

const HIDDEN: SlotBox = {
	left: 0,
	right: 0,
	top: 0,
	bottom: 0,
	width: 0,
	height: 0,
}

const boxAt = (axis: SlideAxis, start: number, size: number): SlotBox =>
	axis === "x"
		? {
				left: start,
				right: start + size,
				top: 0,
				bottom: 28,
				width: size,
				height: 28,
			}
		: {
				left: 0,
				right: 240,
				top: start,
				bottom: start + size,
				width: 240,
				height: size,
			}

const laidOut = (axis: SlideAxis, sizes: (number | null)[]) => {
	let start = 0
	return sizes.map((size) => {
		if (size === null) return null
		if (size === 0) return HIDDEN
		const box = boxAt(axis, start, size)
		start += size + GAP
		return box
	})
}

const ZONE = ["a", "b", "c", "d"]

const measuredOf = (
	axis: SlideAxis,
	sizes: (number | null)[],
	liftedId: string,
	pressAlong: number,
) =>
	slideGeometryOf({
		axis,
		zone: ZONE,
		boxes: laidOut(axis, sizes),
		liftedId,
		press: axis === "x" ? { x: pressAlong, y: 10 } : { x: 10, y: pressAlong },
		gap: GAP,
	})

const geometryOf = (...measured: Parameters<typeof measuredOf>) => {
	const geometry = measuredOf(...measured)
	if (!geometry) throw new Error("The lifted slot is not rendered.")
	return geometry
}

const pointAt = (axis: SlideAxis, along: number): [number, number] =>
	axis === "x" ? [along, 10] : [10, along]

const shiftsFor = (geometry: SlideGeometry, landing: number) =>
	ZONE.map((id) => slideShiftIn(geometry, id, landing))

describe("sliding lift on axis x", () => {
	const geometry = geometryOf("x", [100, 100, 100, 100], "b", 150)

	it("shifts neighbours by the lifted tab's own width plus the gap", () => {
		expect(geometry.shift).toBe(104)
	})

	it("lands on the slot nearest the dragged tab", () => {
		expect(slideLandingIn(geometry, ...pointAt("x", 150))).toBe(1)
		expect(slideLandingIn(geometry, ...pointAt("x", 210))).toBe(2)
		expect(slideLandingIn(geometry, ...pointAt("x", 40))).toBe(0)
		expect(slideLandingIn(geometry, ...pointAt("x", 2000))).toBe(3)
	})

	it("shifts the tabs between the origin and the landing towards the origin", () => {
		expect(shiftsFor(geometry, 1)).toEqual([
			undefined,
			undefined,
			undefined,
			undefined,
		])
		expect(shiftsFor(geometry, 3)).toEqual([
			undefined,
			undefined,
			"start",
			"start",
		])
		expect(shiftsFor(geometry, 0)).toEqual([
			"end",
			undefined,
			undefined,
			undefined,
		])
	})
})

describe("sliding lift on axis y", () => {
	const geometry = geometryOf("y", [28, 56, 28, 28], "a", 14)

	it("shifts neighbours by the lifted row's own height plus the gap", () => {
		expect(geometry.shift).toBe(32)
	})

	it("lands on the slot whose end the lifted row would share", () => {
		expect(slideLandingIn(geometry, ...pointAt("y", 14))).toBe(0)
		expect(slideLandingIn(geometry, ...pointAt("y", 60))).toBe(1)
		expect(slideLandingIn(geometry, ...pointAt("y", 100))).toBe(2)
		expect(slideLandingIn(geometry, ...pointAt("y", 900))).toBe(3)
	})

	it("shifts the rows between the origin and the landing towards the origin", () => {
		expect(shiftsFor(geometry, 2)).toEqual([
			undefined,
			"start",
			"start",
			undefined,
		])
	})
})

describe.each([
	{ slot: "a zero-box slot", size: 0 },
	{ slot: "a zone id with no node", size: null },
])("sliding lift with $slot", ({ size }) => {
	const geometry = geometryOf("y", [28, size, 28, 28], "a", 14)

	it("leaves the hidden slot out of the measure", () => {
		expect(geometry.slots.map((slot) => slot.id)).toEqual(["a", "c", "d"])
		expect(geometry.maxShift).toBe(64)
	})

	it("never lands on the hidden slot", () => {
		expect(slideLandingIn(geometry, ...pointAt("y", 46))).toBe(2)
		expect(slideLandingIn(geometry, ...pointAt("y", 900))).toBe(3)
	})

	it("never shifts the hidden slot", () => {
		expect(shiftsFor(geometry, 3)).toEqual([
			undefined,
			undefined,
			"start",
			"start",
		])
	})
})

describe("sliding lift from a slot that is not rendered", () => {
	it("measures no geometry for a zone id with no node", () => {
		expect(measuredOf("y", [28, null, 28, 28], "b", 14)).toBeNull()
	})

	it("measures no geometry for an id outside the zone", () => {
		expect(measuredOf("x", [100, 100, 100, 100], "z", 150)).toBeNull()
	})
})

describe("sliding lift without layout", () => {
	const geometry = geometryOf("x", [0, 0, 0, 0], "c", 0)

	it("keeps every zero-box slot", () => {
		expect(geometry.slots.map((slot) => slot.id)).toEqual(ZONE)
	})

	it("lands on the first slot from anywhere, as the strip always has", () => {
		expect(slideLandingIn(geometry, ...pointAt("x", -40))).toBe(0)
		expect(slideLandingIn(geometry, ...pointAt("x", 500))).toBe(0)
	})
})
