export type Summons = {
	botId: string
	promptId: string
}

export type TurnQueue = {
	wave: Summons[]
	waiting: Summons[]
	ranBotIds: string[]
}

export const emptyQueue: TurnQueue = {
	wave: [],
	waiting: [],
	ranBotIds: [],
}

export const reopenedFor = (
	queue: TurnQueue,
	summoned: Summons[],
): TurnQueue => ({
	...queue,
	waiting: [...summoned],
	ranBotIds: [],
})

export const openedWave = (queue: TurnQueue): TurnQueue =>
	queue.waiting.length === 0
		? queue
		: {
				wave: queue.waiting,
				waiting: [],
				ranBotIds: [
					...queue.ranBotIds,
					...queue.waiting.map(({ botId }) => botId),
				],
			}

export const handedOver = (
	queue: TurnQueue,
	from: string,
	summons: Summons,
): TurnQueue => {
	const isHeld = queue.waiting.some(({ botId }) => botId === summons.botId)
	const hasRun = queue.ranBotIds.includes(summons.botId)
	if (summons.botId === from || isHeld || hasRun) {
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
