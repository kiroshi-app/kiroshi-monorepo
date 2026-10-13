import {
	type BotChat,
	isRunOutsideOpenThread,
	isUnwritten,
	pendingPostOf,
} from "./bot-chat"
import type { ChatContext } from "./chat-context"
import type { PostedAnswers } from "./posted-answers"
import type { TranscriptPaging } from "./transcript-paging"

import { answeredText, questionMessageIdOf } from "../question-message"
import type {
	PermissionDecision,
	QuestionAnswers,
	QuestionRequest,
	RuntimeScope,
} from "../../agent/contract"
import type { ForeignQuestion } from "../../conversations/foreign-turns"
import type { NewUserMessage } from "../../conversations/store-contract"

type AnswerPlace = Pick<
	NewUserMessage,
	"conversationId" | "turnId" | "repliedToMessageId"
>

type AgentQuestionsParts = {
	loadLatest: TranscriptPaging["loadLatest"]
	answerPosted: PostedAnswers["answerPosted"]
}

export type AgentQuestions = ReturnType<typeof createAgentQuestions>

export const createAgentQuestions = (
	{
		driver,
		store,
		transcript,
		foreignTurns,
		newId,
		now,
		senderAccountId,
		report,
		write,
		botsShowing,
		showForeignTurn,
	}: ChatContext,
	{ loadLatest, answerPosted }: AgentQuestionsParts,
) => {
	const answerForeign = async (
		bot: BotChat,
		scope: RuntimeScope,
		id: string,
		send: () => Promise<void>,
	) => {
		try {
			await send()
			foreignTurns.release(scope, id)
			botsShowing(scope.conversationId).forEach(showForeignTurn)
			return true
		} catch (reason) {
			report(bot, reason)
			return false
		}
	}

	const respond = async (
		bot: BotChat,
		id: string,
		decision: PermissionDecision,
	) => {
		const foreign = foreignTurns.scopeAsking(id)
		if (foreign) {
			await answerForeign(bot, foreign, id, () =>
				driver.respondToPermission(foreign, id, decision),
			)
			return
		}
		const runtime = bot.state.runtime
		if (!runtime) {
			return
		}
		await driver
			.respondToPermission(runtime, id, decision)
			.catch((reason) => report(bot, reason))
	}

	const issuedAskingOf = (bot: BotChat, request: QuestionRequest) => {
		const id = questionMessageIdOf(request.id)
		return isUnwritten(bot, id) ? null : id
	}

	const showAnswerInOpenThread = (bot: BotChat, answered: NewUserMessage) => {
		if (bot.state.conversationId !== answered.conversationId) {
			return
		}
		transcript.append({
			...answered,
			role: "user",
			completion: "complete",
			authorAccountId: senderAccountId(),
			authorName: null,
			runtimeSessionId: null,
		})
	}

	const writeAnswers = (
		bot: BotChat,
		place: AnswerPlace,
		request: QuestionRequest,
		answers: QuestionAnswers,
	) => {
		const content = answeredText(request, answers)
		if (content.length === 0) {
			return
		}
		const answered: NewUserMessage = {
			...place,
			id: newId(),
			authorBotId: null,
			content,
			createdAt: now(),
		}
		write(
			bot,
			() => store.appendUserMessage(answered),
			() => showAnswerInOpenThread(bot, answered),
		)
	}

	const recordAnswers = (
		bot: BotChat,
		request: QuestionRequest,
		answers: QuestionAnswers,
	) => {
		const turn = bot.activeTurn
		if (!turn) {
			return
		}
		const place: AnswerPlace = {
			conversationId: turn.conversationId,
			turnId: turn.id,
			repliedToMessageId: issuedAskingOf(bot, request),
		}
		writeAnswers(bot, place, request, answers)
	}

	const recordForeignAnswers = (
		bot: BotChat,
		{ scope, turnId, request }: ForeignQuestion,
		answers: QuestionAnswers,
	) => {
		const place: AnswerPlace = {
			conversationId: scope.conversationId,
			turnId,
			repliedToMessageId: questionMessageIdOf(request.id),
		}
		writeAnswers(bot, place, request, answers)
	}

	const answer = async (bot: BotChat, id: string, answers: QuestionAnswers) => {
		const foreign = foreignTurns.questionAsking(id)
		if (foreign) {
			const isAccepted = await answerForeign(bot, foreign.scope, id, () =>
				driver.answerQuestion(foreign.scope, id, answers),
			)
			if (isAccepted) {
				recordForeignAnswers(bot, foreign, answers)
			}
			return
		}
		const posted = pendingPostOf(bot, id)
		if (posted) {
			await answerPosted(bot, posted, answers)
			return
		}
		const runtime = bot.state.runtime
		const request = bot.state.question
		if (!runtime || request?.id !== id || isRunOutsideOpenThread(bot)) {
			return
		}
		const conversationId = bot.state.conversationId
		const isAnswerable =
			(await loadLatest(bot)) && bot.state.conversationId === conversationId
		if (!isAnswerable) {
			return
		}
		try {
			await driver.answerQuestion(runtime, id, answers)
			recordAnswers(bot, request, answers)
		} catch (reason) {
			report(bot, reason)
		}
	}

	return { respond, answer }
}
