import type { ScopedEvent } from "../agent/contract"

export const waitingQuestionIdsIn = (pending: ScopedEvent[]) =>
	new Set(
		pending.flatMap(({ event }) =>
			event.type === "questionRequested" ? [event.request.id] : [],
		),
	)
