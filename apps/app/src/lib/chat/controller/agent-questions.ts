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
	const claimedRequestIds = new Set<string>()

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

	const sendDecision = async (
		bot: BotChat,
		id: string,
		decision: PermissionDecision,
	) => {
		const foreign = foreignTurns.scopeAsking(id)
		if (foreign) {
			return answerForeign(bot, foreign, id, () =>
				driver.respondToPermission(foreign, id, decision),
			)
		}
		const runtime = bot.state.runtime
		if (!runtime) {
			return false
		}
		try {
			await driver.respondToPermission(runtime, id, decision)
			return true
		} catch (reason) {
			report(bot, reason)
			return false
		}
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

	const answerForeignQuestion = async (
		bot: BotChat,
		foreign: ForeignQuestion,
		answers: QuestionAnswers,
	) => {
		const id = foreign.request.id
		const isAccepted = await answerForeign(bot, foreign.scope, id, () =>
			driver.answerQuestion(foreign.scope, id, answers),
		)
		if (isAccepted) {
			recordForeignAnswers(bot, foreign, answers)
		}
		return isAccepted
	}

	const answerAsked = async (
		bot: BotChat,
		id: string,
		answers: QuestionAnswers,
	) => {
		const runtime = bot.state.runtime
		const request = bot.state.question
		if (!runtime || request?.id !== id || isRunOutsideOpenThread(bot)) {
			return false
		}
		const conversationId = bot.state.conversationId
		const isAnswerable =
			(await loadLatest(bot)) && bot.state.conversationId === conversationId
		if (!isAnswerable) {
			return false
		}
		try {
			await driver.answerQuestion(runtime, id, answers)
			recordAnswers(bot, request, answers)
			return true
		} catch (reason) {
			report(bot, reason)
			return false
		}
	}

	const replyOnce = async (id: string, send: () => Promise<boolean>) => {
		if (claimedRequestIds.has(id)) {
			return
		}
		claimedRequestIds.add(id)
		try {
			if (!(await send())) {
				claimedRequestIds.delete(id)
			}
		} catch (reason) {
			claimedRequestIds.delete(id)
			throw reason
		}
	}

	const respond = (bot: BotChat, id: string, decision: PermissionDecision) =>
		replyOnce(id, () => sendDecision(bot, id, decision))

	const answer = (bot: BotChat, id: string, answers: QuestionAnswers) => {
		const foreign = foreignTurns.questionAsking(id)
		if (foreign) {
			return replyOnce(id, () => answerForeignQuestion(bot, foreign, answers))
		}
		const posted = pendingPostOf(bot, id)
		if (posted) {
			return answerPosted(bot, posted, answers)
		}
		return replyOnce(id, () => answerAsked(bot, id, answers))
	}

	return { respond, answer }
}
