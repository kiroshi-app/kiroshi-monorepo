import { describe, expect, it } from "vitest"

import {
	botHostStatesIn,
	withNeedsYou,
	workingFromHost,
} from "./host-state-rows"
import type { Conversation, Participant } from "./store-contract"

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

const seatOf = (botId: string, fields: Partial<Participant> = {}) => ({
	botId,
	role: "assistant" as const,
	joinedAt: 1,
	leftAt: null,
	name: botId,
	avatarBlot: null,
	avatarImagePath: null,
	isDeleted: false,
	...fields,
})

const roomOf = (id: string, participants: Participant[]): Conversation => ({
	id,
	spaceId: "home",
	sectionId: null,
	pinPosition: null,
	title: id,
	instructions: "",
	icon: null,
	color: null,
	createdAt: 1,
	updatedAt: 1,
	participants,
})

describe("a bot row against the host states of its conversations", () => {
	const soloThreads = {
		"atlas-home": { spaceId: "home", botId: "atlas" },
		"atlas-work": { spaceId: "work", botId: "atlas" },
		"beacon-home": { spaceId: "home", botId: "beacon" },
	}

	const statesIn = (
		hostStates: ConversationHostStates,
		conversations: Conversation[] = [],
	) =>
		botHostStatesIn({ hostStates, soloThreads, conversations, spaceId: "home" })

	it("needs you when any of its conversations in the space needs you", () => {
		expect(
			statesIn(
				{ "atlas-home": "working", "beacon-home": "idle", walls: "needs_you" },
				[roomOf("walls", [seatOf("atlas")])],
			),
		).toEqual({ atlas: "needs_you", beacon: "idle" })
	})

	it("is working when one reads working and none needs you", () => {
		expect(
			statesIn({ "atlas-home": "idle", walls: "working" }, [
				roomOf("walls", [seatOf("atlas")]),
			]),
		).toEqual({ atlas: "working" })
	})

	it("reads only the conversations of the space it is listed in", () => {
		expect(
			statesIn({ "atlas-work": "needs_you", "atlas-home": "idle" }),
		).toEqual({ atlas: "idle" })
	})

	it("leaves out a conversation the bot has left", () => {
		expect(
			statesIn({ "atlas-home": "idle", walls: "needs_you" }, [
				roomOf("walls", [seatOf("atlas", { leftAt: 2 })]),
			]),
		).toEqual({ atlas: "idle" })
	})

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
