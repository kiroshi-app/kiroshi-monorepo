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

type RevealOutcome = "revealed" | "absent" | "failed"

type RevealAnswer = {
	askId: string
	outcome: RevealOutcome
}

const isRevealedBy = (outcome: RevealOutcome) => {
	if (outcome === "failed") {
		throw new Error("the other window could not come forward")
	}
	return outcome === "revealed"
}

const answerWithinBound = (answered: Promise<RevealOutcome>) => {
	let timeout: ReturnType<typeof setTimeout> | undefined
	const unanswered = new Promise<never>((_, reject) => {
		timeout = setTimeout(
			() => reject(new Error("the other window did not answer")),
			REVEAL_ANSWER_TIMEOUT_MS,
		)
	})
	return Promise.race([answered, unanswered]).finally(() =>
		clearTimeout(timeout),
	)
}

export const askReveal = async (request: RevealRequest) => {
	const askId = crypto.randomUUID()
	let hear: (outcome: RevealOutcome) => void = () => undefined
	const answered = new Promise<RevealOutcome>((resolve) => {
		hear = resolve
	})
	const stopListening = await listenOnThisComputer<RevealAnswer>(
		REVEAL_ANSWER_EVENT,
		({ payload }) => {
			if (payload.askId === askId) {
				hear(payload.outcome)
			}
		},
	)
	try {
		await emitOnThisComputer(REVEAL_ASK_EVENT, { ...request, askId })
		return isRevealedBy(await answerWithinBound(answered))
	} finally {
		stopListening()
	}
}

const reportUnrevealed = (reason: unknown): RevealOutcome => {
	console.error("the tab could not be revealed for another window", reason)
	return "failed"
}

const reportUnanswered = (reason: unknown) => {
	console.error("the reveal answer could not be sent", reason)
}

const answerReveal = (answer: RevealAnswer) =>
	emitOnThisComputer(REVEAL_ANSWER_EVENT, answer).catch(reportUnanswered)

const outcomeOf = (isRevealed: boolean): RevealOutcome =>
	isRevealed ? "revealed" : "absent"

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
			.then(outcomeOf, reportUnrevealed)
			.then((outcome) => answerReveal({ askId, outcome }))
	})
