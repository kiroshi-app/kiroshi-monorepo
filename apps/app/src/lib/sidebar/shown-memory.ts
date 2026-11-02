import type {
	OpenedMission,
	SelectedRow,
} from "../missions/opened-mission-controller"

type ShownRoster = SelectedRow & { spaceRowId: string | null }

type Source<State> = {
	getState: () => State
	subscribe: (listener: () => void) => () => void
}

export type ShownMemorySources = {
	roster: Source<ShownRoster>
	openedMission: Pick<Source<OpenedMission | null>, "getState">
}

export type ShownMemory = {
	lastRowIn: (spaceId: string) => string | null
}

const rowOf = ({ selectedBotId, selectedConversationId }: SelectedRow) =>
	selectedBotId ?? selectedConversationId

export const createShownMemory = ({
	roster,
	openedMission,
}: ShownMemorySources): ShownMemory => {
	const lastRows = new Map<string, string>()
	let seenSpaceRowId: string | null = null
	let seenRowId: string | null = null

	const rememberRow = () => {
		const state = roster.getState()
		const rowId = rowOf(state)
		const hasMoved = state.spaceRowId !== seenSpaceRowId || rowId !== seenRowId
		seenSpaceRowId = state.spaceRowId
		seenRowId = rowId
		if (!hasMoved || openedMission.getState() || !state.spaceRowId || !rowId) {
			return
		}
		lastRows.set(state.spaceRowId, rowId)
	}

	roster.subscribe(rememberRow)

	return {
		lastRowIn: (spaceId) => lastRows.get(spaceId) ?? null,
	}
}
