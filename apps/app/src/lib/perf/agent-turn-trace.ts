import { endInvokePhase, startInvokePhase } from "./invoke-tally-devtools"

import type { AgentEvent } from "../agent/contract"
import { isTurnBusy } from "../chat/chat-state"

const hasTurnStarted = (event: AgentEvent) =>
	event.type === "turnChanged" && isTurnBusy(event.state)

const hasTurnEnded = (event: AgentEvent) =>
	event.type === "turnEnded" ||
	(event.type === "turnChanged" && !isTurnBusy(event.state))

const traceTurn = (event: AgentEvent) => {
	if (hasTurnStarted(event)) {
		startInvokePhase("agent turn")
	} else if (hasTurnEnded(event)) {
		endInvokePhase("agent turn")
	}
}

export const traceAgentTurn: (event: AgentEvent) => void = import.meta.env.DEV
	? traceTurn
	: () => {}
