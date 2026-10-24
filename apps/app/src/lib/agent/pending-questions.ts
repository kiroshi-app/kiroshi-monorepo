import type { RuntimeScope, ScopedEvent } from "./contract"

export type PendingQuestion = {
	id: string
	scope: RuntimeScope
	text: string
}

export type QuestionTexts = Record<string, string>

export type SpaceQuestions = {
	spaceRowId: string | null
	byConversation: QuestionTexts
	byBot: QuestionTexts
}

type QuestionRow = {
	id: string
	pendingQuestion?: string
}

const NO_TEXTS: QuestionTexts = {}

const askedIn = ({ scope, event }: ScopedEvent): PendingQuestion[] => {
	const text =
		event.type === "questionRequested" && event.request.questions[0]?.question
	return scope && text ? [{ id: event.request.id, scope, text }] : []
}

export const pendingQuestionsOf = (events: ScopedEvent[]): PendingQuestion[] =>
	events.flatMap(askedIn)

export const changesPendingQuestions = ({ event }: ScopedEvent): boolean =>
	event.type === "questionRequested" ||
	event.type === "permissionResolved" ||
	event.type === "turnEnded"

const withAsked = (
	questions: PendingQuestion[],
	asked: PendingQuestion[],
): PendingQuestion[] => {
	const unheard = asked.filter(
		({ id }) => !questions.some((question) => question.id === id),
	)
	return unheard.length === 0 ? questions : [...questions, ...unheard]
}

const sameUnlessRemoved = (
	questions: PendingQuestion[],
	kept: PendingQuestion[],
): PendingQuestion[] => (kept.length === questions.length ? questions : kept)

const withoutQuestion = (
	questions: PendingQuestion[],
	id: string,
): PendingQuestion[] =>
	sameUnlessRemoved(
		questions,
		questions.filter((question) => question.id !== id),
	)

const withoutQuestionsOf = (
	questions: PendingQuestion[],
	scope: RuntimeScope | null,
): PendingQuestion[] =>
	scope === null
		? questions
		: sameUnlessRemoved(
				questions,
				questions.filter(
					(question) =>
						question.scope.runtimeSessionId !== scope.runtimeSessionId,
				),
			)

export const pendingQuestionsAfter = (
	questions: PendingQuestion[],
	scoped: ScopedEvent,
	isInSpace: (conversationId: string) => boolean,
): PendingQuestion[] => {
	const { scope, event } = scoped
	if (event.type === "permissionResolved") {
		return withoutQuestion(questions, event.id)
	}
	if (event.type === "turnEnded") {
		return withoutQuestionsOf(questions, scope)
	}
	return withAsked(
		questions,
		askedIn(scoped).filter((asked) => isInSpace(asked.scope.conversationId)),
	)
}

export const firstQuestionByConversation = (
	questions: PendingQuestion[],
): QuestionTexts =>
	Object.fromEntries(
		questions
			.toReversed()
			.map(({ scope, text }) => [scope.conversationId, text]),
	)

export const latestQuestionByBot = (
	questions: PendingQuestion[],
): QuestionTexts =>
	Object.fromEntries(questions.map(({ scope, text }) => [scope.botId, text]))

export const questionsByBotIn = (
	questions: SpaceQuestions,
	spaceRowId: string | null,
): QuestionTexts =>
	questions.spaceRowId === spaceRowId ? questions.byBot : NO_TEXTS

export const questionsByConversationIn = (
	questions: SpaceQuestions,
	spaceRowId: string | null,
): QuestionTexts =>
	questions.spaceRowId === spaceRowId ? questions.byConversation : NO_TEXTS

export const withPendingQuestions = <Row extends QuestionRow>(
	rows: Row[],
	texts: QuestionTexts,
): Row[] =>
	rows.map((row) => {
		const text = texts[row.id]
		return text === undefined ? row : { ...row, pendingQuestion: text }
	})
