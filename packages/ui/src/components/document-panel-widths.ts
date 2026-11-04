type PanelWidthsInput = {
	room: number
	askedWidth: number
	minWidth: number
	maxWidth: number
	threadMinWidth: number
}

type PanelWidths = {
	width: number
	minWidth: number
	maxWidth: number
}

const panelWidthsInRoom = ({
	room,
	askedWidth,
	minWidth,
	maxWidth,
	threadMinWidth,
}: PanelWidthsInput): PanelWidths => {
	const reachableMaxWidth = Math.min(
		Math.max(room - threadMinWidth, minWidth),
		maxWidth,
	)
	return {
		width: Math.min(Math.max(askedWidth, minWidth), reachableMaxWidth),
		minWidth,
		maxWidth: reachableMaxWidth,
	}
}

export { panelWidthsInRoom }
