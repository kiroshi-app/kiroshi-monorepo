import { describe, expect, it } from "bun:test"

import { KIROSHI_LAYER, layerFor } from "./system-layer"

const ONE_READER = "One person is reading you"

describe("the system layer of a space", () => {
	it("keeps the one reader line when the space has no member", () => {
		expect(layerFor({})).toBe(KIROSHI_LAYER)
		expect(layerFor({ members: [] })).toBe(KIROSHI_LAYER)
		expect(KIROSHI_LAYER).toContain(ONE_READER)
	})

	it("names every member of a hosted space and marks the host in place of the one reader line", () => {
		const layer = layerFor({
			members: [
				{ name: "Ada", email: "ada@example.com", isHost: true },
				{ name: "Bea\nLine", email: "bea@example.com", isHost: false },
				{ email: "cal@example.com", isHost: false },
				{ name: "dee@example.com", email: "dee@example.com", isHost: false },
			],
		})

		expect(layer).not.toContain(ONE_READER)
		expect(layer).toContain(
			"You are read in a chat window. Several people write here.",
		)
		expect(layer.split("\n").filter((line) => line.startsWith("- "))).toEqual([
			"- Ada <ada@example.com> (the host)",
			"- Bea Line <bea@example.com>",
			"- cal@example.com",
			"- dee@example.com",
		])
	})
})
