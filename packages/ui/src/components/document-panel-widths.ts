type PanelWidthsInput = {
	room: number
	askedWidth: number
	minWidth: number
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
	threadMinWidth,
}: PanelWidthsInput): PanelWidths => {
	const reachableMaxWidth = Math.max(room - threadMinWidth, minWidth)
	return {
		width: Math.min(Math.max(askedWidth, minWidth), reachableMaxWidth),
		minWidth,
		maxWidth: reachableMaxWidth,
	}
}

export { panelWidthsInRoom }
