import { describe, expect, it } from "vitest"

import { panelWidthsInRoom } from "@workspace/ui/components/document-panel-widths"

const BOUNDS = { minWidth: 400, maxWidth: 800, threadMinWidth: 320 }

describe("panelWidthsInRoom", () => {
	it("draws the asked width and caps the maximum at the room left", () => {
		expect(
			panelWidthsInRoom({ ...BOUNDS, room: 864, askedWidth: 480 }),
		).toEqual({ width: 480, minWidth: 400, maxWidth: 544 })
	})

	it("caps the maximum at 800 when the room leaves more", () => {
		expect(
			panelWidthsInRoom({ ...BOUNDS, room: 1536, askedWidth: 600 }),
		).toEqual({ width: 600, minWidth: 400, maxWidth: 800 })
	})

	it("draws the room left when it falls between 400 and the asked width", () => {
		expect(
			panelWidthsInRoom({ ...BOUNDS, room: 976, askedWidth: 800 }),
		).toEqual({ width: 656, minWidth: 400, maxWidth: 656 })
	})

	it("holds 400 when the room left falls under it", () => {
		expect(
			panelWidthsInRoom({ ...BOUNDS, room: 608, askedWidth: 600 }),
		).toEqual({ width: 400, minWidth: 400, maxWidth: 400 })
	})

	it("holds the asked width inside the panel bounds", () => {
		expect(
			panelWidthsInRoom({ ...BOUNDS, room: 2000, askedWidth: 900 }),
		).toEqual({ width: 800, minWidth: 400, maxWidth: 800 })
		expect(
			panelWidthsInRoom({ ...BOUNDS, room: 2000, askedWidth: 300 }),
		).toEqual({ width: 400, minWidth: 400, maxWidth: 800 })
	})
})
