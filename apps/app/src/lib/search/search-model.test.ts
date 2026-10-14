import { expect, it, vi } from "vitest"

import type { CatalogueMission } from "./catalogue-contract"
import { createSearchLookups, toSearchGroups } from "./search-model"
import type { SearchRead } from "./use-search-reads"

import type { MissionState } from "@/lib/missions/mission-contract"

const A_MISSION: CatalogueMission = {
	id: "m-1",
	threadConversationId: "c-1",
	objective: "Roadmap the parser",
	ticketPlatform: "linear",
	ticketExternalId: "OPE-51",
	ticketTitle: "Parser",
	state: "working",
	botId: "b-1",
	spaceId: "work",
}

const readOf = (missions: CatalogueMission[]): SearchRead => ({
	messages: [],
	chats: [],
	missions,
	routines: [],
})

const identityOfMissionIn = (state: MissionState) => {
	const groups = toSearchGroups({
		read: readOf([{ ...A_MISSION, state }]),
		recents: [],
		query: "roadmap",
		lookups: createSearchLookups({
			rosters: {},
			conversationRosters: {},
			readerName: "You",
			now: 1,
		}),
		open: vi.fn(),
	})

	return groups.find((group) => group.kind === "missions")?.results[0].identity
}

it("gives a mission result no badge where its state carries none", () => {
	expect(identityOfMissionIn("working")).toMatchObject({
		kind: "mission",
		badge: undefined,
	})
})

it("gives a mission result the badge its own state carries", () => {
	expect(identityOfMissionIn("waiting_human")).toMatchObject({
		kind: "mission",
		badge: "attention",
	})
})
