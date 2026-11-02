import type { SummonsDropReason } from "./summons-trace"

export type Summons = {
	botId: string
	promptId: string
}

export type TurnQueue = {
	wave: Summons[]
	waiting: Summons[]
	handedBotIds: string[]
}

export const MAX_SUMMONS_PER_CHAIN = 5

export const emptyQueue: TurnQueue = {
	wave: [],
	waiting: [],
	handedBotIds: [],
}

export const reopenedFor = (
	queue: TurnQueue,
	summoned: Summons[],
): TurnQueue => ({
	...queue,
	waiting: [...summoned],
	handedBotIds: [],
})

export const openedWave = (queue: TurnQueue): TurnQueue =>
	queue.waiting.length === 0
		? queue
		: { ...queue, wave: queue.waiting, waiting: [] }

const isHeld = (queue: TurnQueue, botId: string) =>
	queue.waiting.some((summons) => summons.botId === botId)

const timesHanded = (queue: TurnQueue, botId: string) =>
	queue.handedBotIds.filter((handed) => handed === botId).length

export const refusalOf = (
	queue: TurnQueue,
	from: string,
	{ botId }: Summons,
): SummonsDropReason | null => {
	if (botId === from) {
		return "selfMention"
	}
	if (isHeld(queue, botId)) {
		return null
	}
	return timesHanded(queue, botId) >= MAX_SUMMONS_PER_CHAIN
		? "summonLimit"
		: null
}

export const handedOver = (
	queue: TurnQueue,
	from: string,
	summons: Summons,
): TurnQueue => {
	if (isHeld(queue, summons.botId) || refusalOf(queue, from, summons)) {
		return queue
	}
	return {
		...queue,
		waiting: [...queue.waiting, summons],
		handedBotIds: [...queue.handedBotIds, summons.botId],
	}
}

export const droppedWaiting = (queue: TurnQueue, botId: string): TurnQueue => {
	const waiting = queue.waiting.filter((summons) => summons.botId !== botId)
	return waiting.length === queue.waiting.length ? queue : { ...queue, waiting }
}
