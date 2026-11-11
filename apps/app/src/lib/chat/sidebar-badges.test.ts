import { describe, expect, it } from "vitest"

import type { AppSidebarBot } from "@workspace/ui/components/app-sidebar"

import { toSpaceBadges, withBadges } from "./sidebar-badges"

type ShownBadge = AppSidebarBot["badge"]

const rosterBot = (id: string) => ({ id, name: id })

const ATLAS = rosterBot("atlas")
const BEACON = rosterBot("beacon")

describe("withBadges", () => {
	it("gives a companion the badge held for it", () => {
		const [atlas] = withBadges([ATLAS], { atlas: "failed" })
		expect(atlas.badge).toBe("failed")
	})

	it("gives no badge to a companion carrying none", () => {
		const [atlas] = withBadges([ATLAS], { atlas: "none" })
		expect(atlas.badge).toBeUndefined()
	})

	it("gives no badge to a companion without a held badge", () => {
		const [atlas] = withBadges([ATLAS], {})
		expect(atlas.badge).toBeUndefined()
	})

	it("leaves the rest of the row untouched", () => {
		const [atlas] = withBadges([{ ...ATLAS, title: "Scout" }], {
			atlas: "done",
		})
		expect(atlas).toMatchObject({ id: "atlas", name: "atlas", title: "Scout" })
	})
})

describe("toSpaceBadges", () => {
	const rowsOf = (badges: ShownBadge[]) =>
		badges.map((badge, index) => ({ ...rosterBot(`row-${index}`), badge }))

	const spaceOf = (...badges: ShownBadge[]) => ({ home: rowsOf(badges) })

	it("takes the strongest badge among the companions of a space", () => {
		expect(toSpaceBadges(spaceOf("done", "attention", "failed"), {}).home).toBe(
			"attention",
		)
	})

	it("ranks failed above done", () => {
		expect(toSpaceBadges(spaceOf("done", "failed"), {}).home).toBe("failed")
	})

	it("ranks done above no badge", () => {
		expect(toSpaceBadges(spaceOf(undefined, "done"), {}).home).toBe("done")
	})

	it("gives no badge to a space where every companion carries none", () => {
		expect(toSpaceBadges(spaceOf(undefined, undefined), {})).toEqual({})
	})

	it("badges every space of the roster", () => {
		const badges = toSpaceBadges(
			{
				home: [{ ...ATLAS, badge: "done" }],
				elsewhere: [{ ...BEACON, badge: "attention" }],
			},
			{},
		)
		expect(badges).toEqual({ home: "done", elsewhere: "attention" })
	})

	it("takes the badge of a conversation when no companion carries one", () => {
		expect(toSpaceBadges(spaceOf(undefined), spaceOf("attention")).home).toBe(
			"attention",
		)
	})

	it("ranks a conversation badge against the companion badges of the space", () => {
		expect(toSpaceBadges(spaceOf("done"), spaceOf("failed")).home).toBe(
			"failed",
		)
		expect(toSpaceBadges(spaceOf("attention"), spaceOf("failed")).home).toBe(
			"attention",
		)
	})

	it("badges a space held by the conversations alone", () => {
		expect(toSpaceBadges({}, spaceOf("attention"))).toEqual({
			home: "attention",
		})
	})

	it("gives no badge to a space where neither companions nor conversations carry one", () => {
		expect(toSpaceBadges(spaceOf(undefined), spaceOf(undefined))).toEqual({})
	})
})
