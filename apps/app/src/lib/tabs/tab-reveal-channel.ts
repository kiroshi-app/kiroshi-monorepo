import { emitOnThisComputer, listenOnThisComputer } from "../host"

const REVEAL_ASK_EVENT = "window://tab-reveal-asked"

const REVEAL_ANSWER_EVENT = "window://tab-reveal-answered"

const REVEAL_ANSWER_TIMEOUT_MS = 2000

export type RevealRequest = {
	windowLabel: string
	conversationId: string
	href: string
}

type RevealAsk = RevealRequest & {
	askId: string
}

type RevealAnswer = {
	askId: string
	isRevealed: boolean
}

const answerWithinBound = (answered: Promise<boolean>) => {
	let timeout: ReturnType<typeof setTimeout> | undefined
	const unanswered = new Promise<boolean>((resolve) => {
		timeout = setTimeout(() => resolve(false), REVEAL_ANSWER_TIMEOUT_MS)
	})
	return Promise.race([answered, unanswered]).finally(() =>
		clearTimeout(timeout),
	)
}

export const askReveal = async (request: RevealRequest) => {
	const askId = crypto.randomUUID()
	let hear: (isRevealed: boolean) => void = () => undefined
	const answered = new Promise<boolean>((resolve) => {
		hear = resolve
	})
	const stopListening = await listenOnThisComputer<RevealAnswer>(
		REVEAL_ANSWER_EVENT,
		({ payload }) => {
			if (payload.askId === askId) {
				hear(payload.isRevealed)
			}
		},
	)
	try {
		await emitOnThisComputer(REVEAL_ASK_EVENT, { ...request, askId })
		return await answerWithinBound(answered)
	} finally {
		stopListening()
	}
}

const reportUnrevealed = (reason: unknown) => {
	console.error("the tab could not be revealed for another window", reason)
	return false
}

const answerReveal = (answer: RevealAnswer) =>
	emitOnThisComputer(REVEAL_ANSWER_EVENT, answer).catch(reportUnrevealed)

export const watchRevealAsks = (
	windowLabel: string,
	reveal: (request: RevealRequest) => Promise<boolean>,
) =>
	listenOnThisComputer<RevealAsk>(REVEAL_ASK_EVENT, ({ payload }) => {
		const { askId, ...request } = payload
		if (request.windowLabel !== windowLabel) {
			return
		}
		void reveal(request)
			.catch(reportUnrevealed)
			.then((isRevealed) => answerReveal({ askId, isRevealed }))
	})
