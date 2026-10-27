import { expect, it, vi } from "vitest"

import type { CatalogueChat, CatalogueMission } from "./catalogue-contract"
import { createSearchLookups, toSearchGroups } from "./search-model"
import type { SearchRead } from "./use-search-reads"

import type { Conversation } from "@/lib/conversations/store-contract"
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

const A_GROUP_CHAT: CatalogueChat = {
	conversationId: "c-roadmap",
	kind: "topic",
	title: "Roadmap",
	botId: null,
	participants: ["Ada", "Zoe"],
	spaceId: "work",
}

const roomWearing = (
	look: Pick<Conversation, "icon" | "color">,
): Conversation => ({
	id: A_GROUP_CHAT.conversationId,
	spaceId: "work",
	sectionId: null,
	pinPosition: null,
	title: A_GROUP_CHAT.title,
	instructions: "",
	createdAt: 1,
	updatedAt: 1,
	participants: [],
	...look,
})

const readOf = (
	missions: CatalogueMission[],
	chats: CatalogueChat[] = [],
): SearchRead => ({
	messages: [],
	chats,
	missions,
	routines: [],
})

const identityOfMissionIn = (
	state: MissionState,
	liveness?: CatalogueMission["liveness"],
) => {
	const groups = toSearchGroups({
		read: readOf([{ ...A_MISSION, state, liveness }]),
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

it("gives a mission result the badge its own liveness carries over its stored state", () => {
	expect(identityOfMissionIn("working", "needs_you")).toMatchObject({
		kind: "mission",
		badge: "attention",
	})
	expect(identityOfMissionIn("waiting_human", "working")).toMatchObject({
		kind: "mission",
		badge: undefined,
	})
})

const identityOfGroupChatIn = (room: Conversation) => {
	const groups = toSearchGroups({
		read: readOf([], [A_GROUP_CHAT]),
		recents: [],
		query: "roadmap",
		lookups: createSearchLookups({
			rosters: {},
			conversationRosters: { work: [room] },
			readerName: "You",
			now: 1,
		}),
		open: vi.fn(),
	})

	return groups.find((group) => group.kind === "chats")?.results[0].identity
}

it("gives a group chat result the icon and the colour its conversation wears", () => {
	expect(
		identityOfGroupChatIn(roomWearing({ icon: "Rocket", color: 186 })),
	).toEqual({ kind: "chat-group", icon: "Rocket", color: 186 })
})

it("leaves the icon and the colour of a group chat result blank when its conversation wears none", () => {
	expect(
		identityOfGroupChatIn(roomWearing({ icon: null, color: null })),
	).toEqual({ kind: "chat-group", icon: undefined, color: null })
})
