import type { MissionLanding } from "./mission-actions"

import {
	createOpenedController,
	type OpenedController,
} from "../opened-controller"

export type OpenedMission = {
	missionId: string
	rowId: string
	spaceId: string
	landing?: MissionLanding
}

export type OpenedMissionController = OpenedController<OpenedMission>

export type SelectedRow = {
	selectedBotId: string | null
	selectedConversationId: string | null
}

export type SelectedRowSource = {
	getState: () => SelectedRow
	subscribe: (listener: () => void) => () => void
}

const selectedRowIn = ({ getState }: SelectedRowSource) => {
	const { selectedBotId, selectedConversationId } = getState()

	return selectedBotId ?? selectedConversationId
}

export const createOpenedMissionController = (
	roster: SelectedRowSource,
): OpenedMissionController => {
	const opened = createOpenedController<OpenedMission>()

	roster.subscribe(() => {
		const held = opened.getState()
		if (held && held.rowId !== selectedRowIn(roster)) {
			opened.leave()
		}
	})

	return opened
}
