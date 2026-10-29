import { expect, it } from "vitest"

import {
	createOpenedMissionController,
	type SelectedRow,
} from "./opened-mission-controller"

import { createStore } from "../store"

const selectedBot = (selectedBotId: string): SelectedRow => ({
	selectedBotId,
	selectedConversationId: null,
})

const MISSION = { missionId: "m-1", rowId: "b-1", spaceId: "s-1" }

it("leaves the mission once the selected row moves away from the one it was opened from", () => {
	const roster = createStore(selectedBot("b-1"))
	const controller = createOpenedMissionController(roster)
	const published: unknown[] = []
	controller.subscribe(() => published.push(controller.getState()))
	controller.open(MISSION)

	roster.setState(selectedBot("b-2"))

	expect(published).toEqual([MISSION, null])
})

it("keeps the mission while its row stays selected", () => {
	const roster = createStore(selectedBot("b-1"))
	const controller = createOpenedMissionController(roster)
	controller.open(MISSION)

	roster.setState(selectedBot("b-1"))

	expect(controller.getState()).toBe(MISSION)
})
