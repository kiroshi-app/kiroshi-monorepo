import { MAX_SUMMONS_PER_CHAIN, type SummonsDropReason } from "../bindings"

export type Summons = {
	botId: string
	promptId: string
}

type HeldSummons = Summons & {
	handedBy: string | null
}

export type TurnQueue = {
	wave: Summons[]
	waiting: HeldSummons[]
	handedBotIds: string[]
}

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
	waiting: summoned.map((summons) => ({ ...summons, handedBy: null })),
	handedBotIds: [],
})

export const startableIn = (
	queue: TurnQueue,
	speakingBotIds: string[],
): HeldSummons[] => {
	const isFree = (botId: string | null) =>
		botId === null || !speakingBotIds.includes(botId)
	return queue.waiting.filter(
		({ botId, handedBy }) => isFree(botId) && isFree(handedBy),
	)
}

export const openedWave = (
	queue: TurnQueue,
	speakingBotIds: string[],
): TurnQueue => {
	const startable = startableIn(queue, speakingBotIds)
	if (startable.length === 0) {
		return queue
	}
	return {
		...queue,
		wave: [
			...queue.wave.filter(({ botId }) => speakingBotIds.includes(botId)),
			...startable,
		],
		waiting: queue.waiting.filter((summons) => !startable.includes(summons)),
	}
}

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
		waiting: [...queue.waiting, { ...summons, handedBy: from }],
		handedBotIds: [...queue.handedBotIds, summons.botId],
	}
}

export const droppedWaiting = (queue: TurnQueue, botId: string): TurnQueue => {
	const waiting = queue.waiting.filter((summons) => summons.botId !== botId)
	return waiting.length === queue.waiting.length ? queue : { ...queue, waiting }
}
