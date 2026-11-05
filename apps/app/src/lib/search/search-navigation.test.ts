import { expect, it } from "vitest"

import {
	openSearchTarget,
	openSearchTargetInNewTab,
	type SearchNavigation,
	type SearchTarget,
} from "./search-navigation"

const ROW = { kind: "bot", id: "bot-1" } as const

const tracedNavigation = (isShownInATab = false) => {
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
		openThreadInNewTab: (thread, spaceId = "open") =>
			trace.push(`new-tab:${JSON.stringify(thread)}:${spaceId}`),
		openConversation: async ({ conversationId, openInPlace }) => {
			trace.push(`open:${conversationId}`)
			if (isShownInATab) {
				trace.push(`revealed:${conversationId}`)
				return
			}
			openInPlace()
		},
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

it("opens a Cmd-clicked result of the open Space in a background tab of that Space", () => {
	const { navigation, trace } = tracedNavigation()

	openSearchTargetInNewTab(MESSAGE_HIT, "space-1", navigation)

	expect(trace).toEqual(['new-tab:{"bot":"bot-1"}:open'])
})

it("opens a Cmd-clicked result of another Space in a background tab of that Space", () => {
	const { navigation, trace } = tracedNavigation()

	openSearchTargetInNewTab(
		{ kind: "mission", missionId: "mi-1", botId: "bot-1", spaceId: "space-2" },
		"space-1",
		navigation,
	)

	expect(trace).toEqual(['new-tab:{"bot":"bot-1","mission":"mi-1"}:space-2'])
})

const CONVERSATION_HIT: SearchTarget = {
	kind: "chat",
	row: { kind: "conversation", id: "c-1" },
	spaceId: "space-1",
	landing: { conversationId: "c-1", messageId: "m-1", seq: 7 },
}

it("opens a conversation result in place through the shared path when no tab shows it", () => {
	const { navigation, trace } = tracedNavigation()

	openSearchTarget(CONVERSATION_HIT, navigation)

	expect(trace).toEqual([
		"landing:m-1",
		"open:c-1",
		"mission:left",
		"conversation:c-1",
		"space:space-1",
	])
})

it("brings forward the tab showing a conversation result and leaves the shown thread alone", () => {
	const { navigation, trace } = tracedNavigation(true)

	openSearchTarget(CONVERSATION_HIT, navigation)

	expect(trace).toEqual(["landing:m-1", "open:c-1", "revealed:c-1"])
})

it("opens a Cmd-clicked conversation result in a background tab even when a tab shows it", () => {
	const { navigation, trace } = tracedNavigation(true)

	openSearchTargetInNewTab(CONVERSATION_HIT, "space-1", navigation)

	expect(trace).toEqual(['new-tab:{"conversation":"c-1"}:open'])
})
