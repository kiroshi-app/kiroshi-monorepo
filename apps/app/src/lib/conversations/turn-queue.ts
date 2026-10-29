import type { SummonsDropReason } from "./summons-trace"

export type Summons = {
	botId: string
	promptId: string
}

export type TurnQueue = {
	wave: Summons[]
	waiting: Summons[]
	endedBotIds: string[]
}

export const emptyQueue: TurnQueue = {
	wave: [],
	waiting: [],
	endedBotIds: [],
}

export const reopenedFor = (
	queue: TurnQueue,
	summoned: Summons[],
): TurnQueue => ({
	...queue,
	waiting: [...summoned],
	endedBotIds: [],
})

export const openedWave = (queue: TurnQueue): TurnQueue =>
	queue.waiting.length === 0
		? queue
		: { ...queue, wave: queue.waiting, waiting: [] }

export const endedIn = (queue: TurnQueue, botId: string): TurnQueue =>
	queue.endedBotIds.includes(botId)
		? queue
		: { ...queue, endedBotIds: [...queue.endedBotIds, botId] }

export const refusalOf = (
	queue: TurnQueue,
	from: string,
	{ botId }: Summons,
): SummonsDropReason | null => {
	if (botId === from) {
		return "selfMention"
	}
	return queue.endedBotIds.includes(botId) ? "ranInTurn" : null
}

export const handedOver = (
	queue: TurnQueue,
	from: string,
	summons: Summons,
): TurnQueue => {
	const isHeld = queue.waiting.some(({ botId }) => botId === summons.botId)
	if (isHeld || refusalOf(queue, from, summons)) {
		return queue
	}
	return {
		...queue,
		waiting: [...queue.waiting, summons],
	}
}

export const droppedWaiting = (queue: TurnQueue, botId: string): TurnQueue => {
	const waiting = queue.waiting.filter((summons) => summons.botId !== botId)
	return waiting.length === queue.waiting.length ? queue : { ...queue, waiting }
}
