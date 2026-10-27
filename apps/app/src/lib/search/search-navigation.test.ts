import { expect, it } from "vitest"

import {
	openSearchTarget,
	type SearchNavigation,
	type SearchTarget,
} from "./search-navigation"

const ROW = { kind: "bot", id: "bot-1" } as const

const tracedNavigation = () => {
	const trace: string[] = []

	const navigation: SearchNavigation = {
		selectBot: (botId) => trace.push(`bot:${botId}`),
		selectConversation: (id) => trace.push(`conversation:${id}`),
		selectSpace: (spaceId) => trace.push(`space:${spaceId}`),
		openMission: ({ missionId }) => trace.push(`mission:${missionId}`),
		leaveMission: () => trace.push("mission:left"),
		openRoutine: ({ routineId }) => trace.push(`routine:${routineId}`),
		openActivityPanel: () => trace.push("activity"),
		recordLanding: ({ messageId }) => trace.push(`landing:${messageId}`),
		openThreadInNewTab: (thread) =>
			trace.push(`new-tab:${JSON.stringify(thread)}`),
	}

	return { navigation, trace }
}

const MESSAGE_HIT: SearchTarget = {
	kind: "chat",
	row: ROW,
	spaceId: "space-1",
	landing: { conversationId: "c-1", messageId: "m-1", seq: 7 },
}

it("leaves the mission on screen before it shows the thread of the row", () => {
	const { navigation, trace } = tracedNavigation()

	openSearchTarget(MESSAGE_HIT, navigation)

	expect(trace).toEqual([
		"mission:left",
		"landing:m-1",
		"bot:bot-1",
		"space:space-1",
	])
})

it("holds the mission it was asked to open", () => {
	const { navigation, trace } = tracedNavigation()

	openSearchTarget(
		{ kind: "mission", missionId: "mi-1", botId: "bot-1", spaceId: "space-1" },
		navigation,
	)

	expect(trace).toEqual(["bot:bot-1", "space:space-1", "mission:mi-1"])
})

it("leaves the mission on screen before it opens a routine", () => {
	const { navigation, trace } = tracedNavigation()

	openSearchTarget(
		{
			kind: "routine",
			routineId: "r-1",
			row: ROW,
			conversationId: "c-1",
			spaceId: "space-1",
		},
		navigation,
	)

	expect(trace).toEqual([
		"mission:left",
		"bot:bot-1",
		"space:space-1",
		"activity",
		"routine:r-1",
	])
})
