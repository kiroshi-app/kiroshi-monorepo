import { describe, expect, it } from "vitest"

import {
	botHostStatesIn,
	withNeedsYou,
	workingFromHost,
} from "./host-state-rows"

import {
	questionsByBotIn,
	questionsByConversationIn,
	type SpaceQuestions,
} from "../agent/pending-questions"
import type { ConversationHostStates } from "../bots/roster-pages"

const QUESTIONS: SpaceQuestions = {
	spaceRowId: "home",
	byConversation: { "room-one": "Which branch?", "room-two": "Which file?" },
	byBot: { atlas: "Which name?" },
}

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

	it("needs you with the question asked when the host reads needs_you", () => {
		const [roomOne] = withNeedsYou(
			rows,
			{ "room-one": "needs_you" },
			questionsByConversationIn(QUESTIONS, "home"),
		)

		expect(roomOne).toEqual({
			id: "room-one",
			lastMessage: "On it",
			badge: "attention",
			pendingQuestion: "Which branch?",
		})
	})

	it("needs you without a text when the store holds no question for it", () => {
		const [, , roomThree] = withNeedsYou(
			rows,
			{ "room-three": "needs_you" },
			questionsByConversationIn(QUESTIONS, "home"),
		)

		expect(roomThree).toMatchObject({ badge: "attention" })
		expect(roomThree.pendingQuestion).toBeUndefined()
	})

	it("shows no question while the host reads idle or working, even if the store still holds one", () => {
		const shown = withNeedsYou(
			rows,
			{ "room-one": "working", "room-two": "idle" },
			questionsByConversationIn(QUESTIONS, "home"),
		)

		expect(shown).toEqual(rows)
	})

	it("leaves the rows of another space without the question of the shown space", () => {
		const [roomOne] = withNeedsYou(
			rows,
			{ "room-one": "needs_you" },
			questionsByConversationIn(QUESTIONS, "work"),
		)

		expect(roomOne.pendingQuestion).toBeUndefined()
	})

	it("is working exactly when the host reads working, with the pose heard in memory", () => {
		expect(
			workingFromHost(
				{
					"room-one": "working",
					"room-two": "idle",
					"room-three": "needs_you",
				},
				{
					"room-one": { isWorking: true, kind: "searching" },
					"room-two": { isWorking: true, kind: "writing" },
				},
			),
		).toEqual({ "room-one": { isWorking: true, kind: "searching" } })
	})

	it("is working without a pose when no runtime is held in memory", () => {
		expect(workingFromHost({ atlas: "working" }, {})).toEqual({
			atlas: { isWorking: true, kind: undefined },
		})
	})
})

describe("a bot row against the host state of its solo thread", () => {
	const soloThreads = {
		"atlas-home": { spaceId: "home", botId: "atlas" },
		"atlas-work": { spaceId: "work", botId: "atlas" },
		"beacon-home": { spaceId: "home", botId: "beacon" },
	}

	const statesIn = (hostStates: ConversationHostStates) =>
		botHostStatesIn({ hostStates, soloThreads, spaceId: "home" })

	it("needs you when its solo thread in the space needs you", () => {
		expect(
			statesIn({ "atlas-home": "needs_you", "beacon-home": "idle" }),
		).toEqual({ atlas: "needs_you", beacon: "idle" })
	})

	it("is working when its solo thread in the space is working", () => {
		expect(statesIn({ "atlas-home": "working" })).toEqual({ atlas: "working" })
	})

	it("reads only the solo thread of the space it is listed in", () => {
		expect(
			statesIn({ "atlas-work": "needs_you", "atlas-home": "idle" }),
		).toEqual({ atlas: "idle" })
	})

	it.each(["needs_you", "working"] as const)(
		"leaves both bots seated in a %s room without a state",
		(state) => {
			const atlasAndBeaconRoom = "walls"

			expect(statesIn({ [atlasAndBeaconRoom]: state })).toEqual({})
		},
	)

	it("carries the question of the bot only while it needs you", () => {
		const rows = [{ id: "atlas" }, { id: "beacon" }]

		expect(
			withNeedsYou(
				rows,
				{ atlas: "needs_you", beacon: "working" },
				questionsByBotIn(QUESTIONS, "home"),
			),
		).toEqual([
			{ id: "atlas", badge: "attention", pendingQuestion: "Which name?" },
			{ id: "beacon" },
		])
	})
})
