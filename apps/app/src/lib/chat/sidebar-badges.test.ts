import { describe, expect, it } from "vitest"

import type { AppSidebarBot } from "@workspace/ui/components/app-sidebar"

import { toRailSignals, toSpaceBadges, withBadges } from "./sidebar-badges"

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

describe("toRailSignals", () => {
	const badged = (badges: ShownBadge[]) =>
		badges.map((badge, index) => ({ id: `room-${index}`, badge }))

	type RailSeed = {
		conversations?: Record<string, ReturnType<typeof badged>>
		waitingMissionCount?: number
		spaceId?: string | null
	}

	const signalsOf = ({
		conversations = {},
		waitingMissionCount = 0,
		spaceId = "vocca",
	}: RailSeed) =>
		toRailSignals({
			conversationsBySpaceId: conversations,
			waitingMissionCount,
			spaceId,
		})

	it("dots nothing on Conversations while no conversation of the space carries a badge", () => {
		const dots = signalsOf({
			conversations: { vocca: badged([undefined, undefined]) },
		})
		expect(dots.conversations).toBeUndefined()
	})

	it("dots Conversations done while done is the only badge of the space", () => {
		const dots = signalsOf({
			conversations: { vocca: badged([undefined, "done", "done"]) },
		})
		expect(dots.conversations).toBe("done")
	})

	it("dots Conversations failed over done", () => {
		const dots = signalsOf({
			conversations: { vocca: badged(["done", "failed", undefined]) },
		})
		expect(dots.conversations).toBe("failed")
	})

	it("dots Conversations attention over failed", () => {
		const dots = signalsOf({
			conversations: { vocca: badged(["failed", "done", "attention"]) },
		})
		expect(dots.conversations).toBe("attention")
	})

	it("dots Missions attention while a mission of the space waits on the reader", () => {
		expect(signalsOf({ waitingMissionCount: 3 }).missions).toBe("attention")
		expect(signalsOf({ waitingMissionCount: 0 }).missions).toBeUndefined()
	})

	it("reads the conversation signals of the selected space only", () => {
		const sources = {
			conversations: { atlas: badged(["attention", "done"]) },
		}
		const vocca = signalsOf({ ...sources, spaceId: "vocca" })
		const atlas = signalsOf({ ...sources, spaceId: "atlas" })
		expect(vocca).toEqual({ conversations: undefined, missions: undefined })
		expect(atlas).toEqual({ conversations: "attention", missions: undefined })
	})

	it("signals nothing on Companions and Applications", () => {
		const dots = signalsOf({
			conversations: { vocca: badged(["attention"]) },
			waitingMissionCount: 1,
		})
		expect(dots).not.toHaveProperty("companions")
		expect(dots).not.toHaveProperty("applications")
	})

	it("signals nothing when no space is selected", () => {
		const dots = signalsOf({
			conversations: { vocca: badged(["attention"]) },
			spaceId: null,
		})
		expect(dots).toEqual({ conversations: undefined, missions: undefined })
	})
})
