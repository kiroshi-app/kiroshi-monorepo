import type { TurnEnded } from "./contract"

export type TurnEnding = "completed" | "cancelled" | "failed" | "connectionLost"

export type TurnPlace = {
	heardIn: string
	conversationId: string
	isOnScreen: boolean
}

const endingOf = ({ outcome, failure }: TurnEnded): TurnEnding =>
	outcome === "failed" && failure === "noConnection"
		? "connectionLost"
		: outcome

const logOffScreen = ({ heardIn, conversationId }: TurnPlace) => {
	console.info(
		`${heardIn}: a turn of conversation ${conversationId} ended for no connection in a Space that is not on screen`,
	)
}

export const createTurnEndHearing = (showConnectionLost: () => void) => {
	let isConnectionLostShown = false

	const noteConnectionLost = (place: TurnPlace) => {
		if (!place.isOnScreen) {
			logOffScreen(place)
			return
		}
		if (isConnectionLostShown) {
			return
		}
		isConnectionLostShown = true
		showConnectionLost()
	}

	return (ended: TurnEnded, place: TurnPlace): TurnEnding => {
		const ending = endingOf(ended)
		if (ending === "completed") {
			isConnectionLostShown = false
		}
		if (ending === "connectionLost") {
			noteConnectionLost(place)
		}
		return ending
	}
}

const showConnectionLostNotice = () => {
	// TODO: the transient notice comes from a packages/ui string that does not exist yet
}

export const hearTurnEnd = createTurnEndHearing(showConnectionLostNotice)
