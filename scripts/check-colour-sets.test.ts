import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"

import {
	catalogueColourSets,
	colourSetDifferences,
	producedColourSets,
} from "./check-colour-sets"

const tokens = JSON.parse(
	readFileSync(new URL("../packages/ui/tokens.json", import.meta.url), "utf8"),
)

describe("producedColourSets", () => {
	it("names the plain colours, the hue preset colours and the blot aliases tokens:build writes", () => {
		const produced = producedColourSets(tokens)

		expect(produced).toContain("primary")
		expect(produced).toContain("hue-blue-accent")
		expect(produced).toContain("bot-blot-blue")
	})
})

describe("catalogueColourSets", () => {
	it("keeps the colour set directories and drops the catalogue's Contents.json", () => {
		expect(
			catalogueColourSets([
				"Contents.json",
				"primary.colorset",
				"ring.colorset",
			]),
		).toEqual(["primary", "ring"])
	})
})

describe("colourSetDifferences", () => {
	it("reports nothing when the catalogue holds exactly the produced sets", () => {
		expect(
			colourSetDifferences(["primary", "ring"], ["ring", "primary"]),
		).toEqual([])
	})

	it("names each set the catalogue holds that tokens.json doesn't produce", () => {
		expect(
			colourSetDifferences(["primary"], ["primary", "zeta", "HandAdded"]),
		).toEqual(["extra: HandAdded", "extra: zeta"])
	})

	it("names each produced set the catalogue is missing", () => {
		expect(colourSetDifferences(["primary", "ring"], ["primary"])).toEqual([
			"missing: ring",
		])
	})

	it("lists the extra sets before the missing ones", () => {
		expect(colourSetDifferences(["primary"], ["HandAdded"])).toEqual([
			"extra: HandAdded",
			"missing: primary",
		])
	})
})
