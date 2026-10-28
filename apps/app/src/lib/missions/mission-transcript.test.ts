import { describe, expect, it } from "vitest"

import type { MissionEventModel } from "@workspace/ui/components/mission"

import type { Mission } from "./mission-contract"
import {
	BEFORE_FIRST_RUN,
	placeMissionEvents,
	placeMissions,
	withoutMissionSummons,
} from "./mission-transcript"

import type { TranscriptRow } from "@/lib/chat/screen-model"

const rowOf = (
	authorBotId: string | null,
	timestamp: number,
): TranscriptRow => ({
	messageId: `m-${timestamp}`,
	turnId: `t-${timestamp}`,
	blockIndex: 0,
	quotedMessageId: null,
	authorBotId,
	authorAccountId: null,
	authorName: null,
	role: authorBotId ? "assistant" : "user",
	text: "said",
	timestamp,
	completion: "complete",
})

const missionOf = (id: string, openedAt: number, botId = "bot-1"): Mission => ({
	id,
	originConversationId: "c-1",
	spaceId: null,
	botId,
	threadConversationId: `c-${id}`,
	objective: "Rewrite the changelog parser",
	ticket: {
		platform: "linear",
		externalId: "OPE-42",
		url: "https://linear.app/ope-42",
		title: "Changelog parser",
	},
	tools: ["Read"],
	state: "working",
	stateSeq: 1,
	isAgentRunning: false,
	openedAt,
	closedAt: null,
	reportedAt: null,
	reportedTurnId: null,
	status: null,
	lastActivityAt: null,
	lastActivity: null,
	commitsAhead: null,
	dirtyFiles: null,
	pullRequestUrl: null,
	branch: null,
	workspacePath: null,
})

const eventOf = (id: string, createdAt: number): MissionEventModel => ({
	id,
	kind: "note",
	source: "github",
	createdAt,
	text: "The pull request was opened",
})

const PROMPT = [rowOf(null, 0)]
const ANSWER = [rowOf("bot-1", 100)]
const LATER_PROMPT = [rowOf(null, 400)]
const LATER_ANSWER = [rowOf("bot-1", 500)]
const OTHER_BOT_ANSWER = [rowOf("bot-2", 250)]

const RUNS = [PROMPT, ANSWER, LATER_PROMPT, LATER_ANSWER]

describe("placeMissions", () => {
	const placedIn = (runs: TranscriptRow[][], missions: Mission[]) =>
		placeMissions({ runs, missions, hasOlder: false })

	it("places a mission after the last run opened before it", () => {
		expect(placedIn(RUNS, [missionOf("m-1", 200)])).toEqual([
			{ mission: missionOf("m-1", 200), runIndex: 1 },
		])
	})

	it("orders the missions placed on the same run by the time they were opened", () => {
		const placed = placedIn(
			[PROMPT, ANSWER],
			[missionOf("m-late", 300), missionOf("m-early", 200)],
		)

		expect(placed.map(({ mission }) => mission.id)).toEqual([
			"m-early",
			"m-late",
		])
	})

	it("places a mission after the last run opened before it whatever companion wrote it", () => {
		expect(
			placedIn(
				[PROMPT, ANSWER, OTHER_BOT_ANSWER, LATER_PROMPT],
				[missionOf("m-1", 300)],
			),
		).toEqual([{ mission: missionOf("m-1", 300), runIndex: 2 }])
	})

	it("places a mission opened after the oldest run in a feed holding no run of its companion", () => {
		expect(
			placedIn(
				[PROMPT, OTHER_BOT_ANSWER, LATER_PROMPT],
				[missionOf("m-1", 300)],
			),
		).toEqual([{ mission: missionOf("m-1", 300), runIndex: 1 }])
	})

	it("places a mission on the run opened at its very moment", () => {
		expect(placedIn(RUNS, [missionOf("m-1", 500)])).toEqual([
			{ mission: missionOf("m-1", 500), runIndex: 3 },
		])
	})

	it("keeps two missions of one companion apart when the runs in between are absent", () => {
		expect(
			placedIn(RUNS, [missionOf("m-early", 200), missionOf("m-late", 450)]),
		).toEqual([
			{ mission: missionOf("m-early", 200), runIndex: 1 },
			{ mission: missionOf("m-late", 450), runIndex: 2 },
		])
	})

	it("leaves a closed mission where it was opened when its companion ran again later", () => {
		const closed: Mission = {
			...missionOf("m-1", 200),
			state: "done",
			stateSeq: 4,
			closedAt: 480,
			reportedAt: 500,
			reportedTurnId: "t-500",
		}

		expect(placedIn(RUNS, [closed])).toEqual([{ mission: closed, runIndex: 1 }])
	})

	it("leaves a mission opened before the oldest loaded run out while older messages remain", () => {
		expect(
			placeMissions({
				runs: [LATER_PROMPT, LATER_ANSWER],
				missions: [missionOf("m-1", 200)],
				hasOlder: true,
			}),
		).toEqual([])
	})

	it("draws a mission opened before the oldest loaded run ahead of them once no older message remains", () => {
		expect(
			placedIn([LATER_PROMPT, LATER_ANSWER], [missionOf("m-1", 200)]),
		).toEqual([{ mission: missionOf("m-1", 200), runIndex: BEFORE_FIRST_RUN }])
	})

	it("draws a mission of a feed holding no run ahead of the runs", () => {
		expect(
			placeMissions({
				runs: [],
				missions: [missionOf("m-1", 200)],
				hasOlder: true,
			}),
		).toEqual([{ mission: missionOf("m-1", 200), runIndex: BEFORE_FIRST_RUN }])
	})
})

describe("placeMissionEvents", () => {
	it("places an event after the last run opened at or before its creation", () => {
		expect(placeMissionEvents(RUNS, [eventOf("e-1", 400)])).toEqual([
			{ event: eventOf("e-1", 400), runIndex: 2 },
		])
	})

	it("places an event created before every loaded run ahead of them", () => {
		expect(
			placeMissionEvents([LATER_PROMPT, LATER_ANSWER], [eventOf("e-1", 200)]),
		).toEqual([{ event: eventOf("e-1", 200), runIndex: BEFORE_FIRST_RUN }])
	})

	it("orders the events placed on the same run by the time they were created", () => {
		const placed = placeMissionEvents(RUNS, [
			eventOf("e-late", 300),
			eventOf("e-early", 200),
		])

		expect(placed.map(({ event }) => event.id)).toEqual(["e-early", "e-late"])
	})
})

const spokenRowOf = (
	authorBotId: string | null,
	timestamp: number,
	text: string,
): TranscriptRow => ({ ...rowOf(authorBotId, timestamp), text })

const transcriptAfter = (summons: string) =>
	withoutMissionSummons(
		[spokenRowOf(null, 0, summons), spokenRowOf("bot-1", 100, "On it")],
		"bot-1",
	)

describe("withoutMissionSummons", () => {
	it("hides the waiting_bot summons and names the answer it caused", () => {
		expect(
			transcriptAfter(
				"The coding session of this mission is blocked and waiting on you.",
			),
		).toEqual({
			rows: [spokenRowOf("bot-1", 100, "On it")],
			summonsCauses: [{ turnId: "t-100", state: "waiting_bot" }],
		})
	})

	it("hides the waiting_bot summons a thread already holds in its former wording", () => {
		expect(
			transcriptAfter(
				"The coding agent of this mission is blocked and waiting on you.",
			),
		).toEqual({
			rows: [spokenRowOf("bot-1", 100, "On it")],
			summonsCauses: [{ turnId: "t-100", state: "waiting_bot" }],
		})
	})

	it("hides the working summons and names the answer it caused", () => {
		expect(transcriptAfter("Carry out this mission.")).toEqual({
			rows: [spokenRowOf("bot-1", 100, "On it")],
			summonsCauses: [{ turnId: "t-100", state: "working" }],
		})
	})

	it("keeps a user message that is no summons", () => {
		expect(transcriptAfter("toString").rows).toHaveLength(2)
	})
})
