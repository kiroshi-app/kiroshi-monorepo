import { describe, expect, it } from "vitest"

import { panelWidthsInRoom } from "@workspace/ui/components/document-panel-widths"

const BOUNDS = { minWidth: 400, threadMinWidth: 400 }

describe("panelWidthsInRoom", () => {
	it("draws the asked width and caps the maximum at the room left beside a 400 thread", () => {
		expect(
			panelWidthsInRoom({ ...BOUNDS, room: 864, askedWidth: 432 }),
		).toEqual({ width: 432, minWidth: 400, maxWidth: 464 })
	})

	it("caps the maximum at the room left only, past 800 on a wide window", () => {
		expect(
			panelWidthsInRoom({ ...BOUNDS, room: 1616, askedWidth: 800 }),
		).toEqual({ width: 800, minWidth: 400, maxWidth: 1216 })
	})

	it("draws the room left when it falls between 400 and the asked width", () => {
		expect(
			panelWidthsInRoom({ ...BOUNDS, room: 976, askedWidth: 800 }),
		).toEqual({ width: 576, minWidth: 400, maxWidth: 576 })
	})

	it("holds 400 when the room left falls under it", () => {
		expect(
			panelWidthsInRoom({ ...BOUNDS, room: 608, askedWidth: 600 }),
		).toEqual({ width: 400, minWidth: 400, maxWidth: 400 })
	})

	it("holds the asked width inside the panel bounds", () => {
		expect(
			panelWidthsInRoom({ ...BOUNDS, room: 2000, askedWidth: 1700 }),
		).toEqual({ width: 1600, minWidth: 400, maxWidth: 1600 })
		expect(
			panelWidthsInRoom({ ...BOUNDS, room: 2000, askedWidth: 300 }),
		).toEqual({ width: 400, minWidth: 400, maxWidth: 1600 })
	})
})
