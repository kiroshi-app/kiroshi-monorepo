import { describe, expect, it } from "vitest"

import {
	botHostStatesIn,
	withNeedsYou,
	workingFromHost,
} from "./host-state-rows"
import type { ObservedState, PendingPrompt } from "./store-contract"

import type { ConversationHostStates } from "../bots/roster-pages"

const asked = (text: string): PendingPrompt => ({
	promptId: `prompt-${text}`,
	kind: "question",
	text,
})

const needingYou = (text: string): ObservedState => ({
	state: "needs_you",
	pendingPrompt: asked(text),
	workingBotIds: [],
})

const IDLE: ObservedState = {
	state: "idle",
	pendingPrompt: null,
	workingBotIds: [],
}

const workingBy = (...workingBotIds: string[]): ObservedState => ({
	state: "working",
	pendingPrompt: null,
	workingBotIds,
})

type ShownRow = {
	id: string
	lastMessage: string
	badge?: "done" | "attention"
	pendingQuestion?: string
}

describe("a conversation row against its host state", () => {
	const rows: ShownRow[] = [
		{ id: "room-one", lastMessage: "On it" },
		{ id: "room-two", lastMessage: "Done", badge: "done" },
		{ id: "room-three", lastMessage: "Hello" },
	]

	it("needs you with the text of the pending prompt the host reads", () => {
		const [roomOne] = withNeedsYou(rows, {
			"room-one": needingYou("Which branch?"),
		})

		expect(roomOne).toEqual({
			id: "room-one",
			lastMessage: "On it",
			badge: "attention",
			pendingQuestion: "Which branch?",
		})
	})

	it("needs you without a text when the host reads needs_you with no readable prompt", () => {
		const [, , roomThree] = withNeedsYou(rows, {
			"room-three": { state: "needs_you", pendingPrompt: null },
		})

		expect(roomThree).toMatchObject({ badge: "attention" })
		expect(roomThree.pendingQuestion).toBeUndefined()
	})

	it("returns to its normal state with no text once the prompt is cleared", () => {
		const asking = { "room-one": needingYou("Which branch?") }
		const cleared = { "room-one": IDLE }

		expect(withNeedsYou(rows, asking)[0].pendingQuestion).toBe("Which branch?")
		expect(withNeedsYou(rows, cleared)).toEqual(rows)
	})

	it("shows no question while the host reads idle or working", () => {
		expect(
			withNeedsYou(rows, { "room-one": workingBy("atlas"), "room-two": IDLE }),
		).toEqual(rows)
	})

	it("is working exactly when the host reads working, with the pose heard in memory", () => {
		expect(
			workingFromHost(
				{
					"room-one": workingBy("atlas"),
					"room-two": IDLE,
					"room-three": needingYou("Which file?"),
				},
				{
					"room-one": { isWorking: true, kind: "searching" },
					"room-two": { isWorking: true, kind: "writing" },
				},
			),
		).toEqual({ "room-one": { isWorking: true, kind: "searching" } })
	})

	it("is working without a pose when no runtime is held in memory", () => {
		expect(workingFromHost({ atlas: workingBy("atlas") }, {})).toEqual({
			atlas: { isWorking: true, kind: undefined },
		})
	})
})

describe("a companion row against the host state of its solo thread", () => {
	const soloThreads = {
		"atlas-home": { spaceId: "home", botId: "atlas" },
		"atlas-work": { spaceId: "work", botId: "atlas" },
		"beacon-home": { spaceId: "home", botId: "beacon" },
	}

	const statesIn = (hostStates: ConversationHostStates) =>
		botHostStatesIn({ hostStates, soloThreads, spaceId: "home" })

	const companionRowsIn = (hostStates: ConversationHostStates) =>
		withNeedsYou([{ id: "atlas" }, { id: "beacon" }], statesIn(hostStates))

	it("needs you with the text its solo thread asks", () => {
		expect(
			companionRowsIn({
				"atlas-home": needingYou("Which name?"),
				"beacon-home": IDLE,
			}),
		).toEqual([
			{ id: "atlas", badge: "attention", pendingQuestion: "Which name?" },
			{ id: "beacon" },
		])
	})

	it("leaves the companion row at rest when it asks in a room", () => {
		const atlasAndBeaconRoom = "walls"

		expect(
			companionRowsIn({
				[atlasAndBeaconRoom]: needingYou("Which wall?"),
				"atlas-home": IDLE,
			}),
		).toEqual([{ id: "atlas" }, { id: "beacon" }])
	})

	it("returns to its normal state once its solo thread prompt is cleared", () => {
		expect(companionRowsIn({ "atlas-home": IDLE })).toEqual([
			{ id: "atlas" },
			{ id: "beacon" },
		])
	})

	it("is working when its solo thread in the space is working", () => {
		expect(statesIn({ "atlas-home": workingBy("atlas") })).toEqual({
			atlas: workingBy("atlas"),
		})
	})

	it("reads only the solo thread of the space it is listed in", () => {
		expect(
			statesIn({ "atlas-work": needingYou("Which desk?"), "atlas-home": IDLE }),
		).toEqual({ atlas: IDLE })
	})

	it.each([
		["needs_you", needingYou("Which wall?")],
		["working", workingBy("atlas", "beacon")],
	] as const)(
		"leaves both companions seated in a %s room without a state",
		(_, observed) => {
			expect(statesIn({ walls: observed })).toEqual({})
		},
	)
})
