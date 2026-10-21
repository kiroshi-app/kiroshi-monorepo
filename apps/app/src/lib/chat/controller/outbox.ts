import type { AgentQuestions } from "./agent-questions"
import {
	type BotChat,
	canDeliver,
	canSend,
	isRunOutsideOpenThread,
} from "./bot-chat"
import type { ChatContext } from "./chat-context"
import type { PromptRows } from "./prompt-rows"
import type { PromptSubmission } from "./prompt-submission"
import type { SessionRunner } from "./session-runner"

import {
	canStopTurn,
	isSessionReady,
	toCancelError,
	toTransportError,
} from "../chat-state"
import { isPostedRequest } from "../posted-question"
import { answersFromText } from "../question-message"
import type { CancelOutcome, RuntimeScope } from "../../agent/contract"
import { keyOf } from "../../conversations/foreign-turns"

type OutboxParts = {
	openedFor: SessionRunner["openedFor"]
	promptRows: PromptRows
	prompts: PromptSubmission
	answer: AgentQuestions["answer"]
}

export const createOutbox = (
	{ driver, newId, dispatch, announce, report, write }: ChatContext,
	{
		openedFor,
		promptRows: { promptRow, storePrompt, showPrompt },
		prompts: { claim, sendPrompt, runInOpenThread },
		answer,
	}: OutboxParts,
) => {
	const cancellingForeignScopes = new Set<string>()

	const sessionForOutbox = async (bot: BotChat) => {
		if (isSessionReady(bot.state)) {
			return true
		}
		await openedFor(bot)
		return canSend(bot)
	}

	const drainOutbox = async (bot: BotChat) => {
		if (!(await sessionForOutbox(bot))) {
			return
		}
		while (canSend(bot)) {
			const entry = bot.state.outbox[0]
			if (!entry) {
				return
			}
			dispatch(bot, { type: "outboxEntryRemoved", id: entry.id })
			const outcome = await claim(bot, () =>
				sendPrompt(bot, entry.text, entry.repliedToMessageId ?? undefined),
			)
			if (outcome === "unwritten") {
				dispatch(bot, { type: "promptReturned", entry })
			}
			if (outcome !== "submitted") {
				return
			}
		}
	}

	const pump = (bot: BotChat) => {
		if (bot.draining || bot.state.outbox.length === 0 || !canDeliver(bot)) {
			return
		}
		bot.draining = drainOutbox(bot)
			.catch((reason) => report(bot, reason))
			.finally(() => {
				bot.draining = null
			})
	}

	const send = async (bot: BotChat, text: string, repliedTo?: string) => {
		const trimmed = text.trim()
		if (trimmed.length === 0) {
			return
		}
		const asked = bot.state.question
		if (asked && !isPostedRequest(asked) && !isRunOutsideOpenThread(bot)) {
			await answer(bot, asked.id, answersFromText(asked, trimmed))
			return
		}
		if (asked) {
			await runInOpenThread(bot)
		}
		const outcome = canSend(bot)
			? await claim(bot, () => sendPrompt(bot, trimmed, repliedTo))
			: "unwritten"
		if (outcome === "unwritten") {
			dispatch(bot, {
				type: "promptHeld",
				entry: {
					id: newId(),
					text: trimmed,
					repliedToMessageId: repliedTo ?? null,
				},
			})
		}
		pump(bot)
	}

	const recordHeld = (bot: BotChat) => {
		const conversationId = bot.state.conversationId
		if (!conversationId) {
			return
		}
		bot.run.carried = false
		const held = bot.state.outbox
		dispatch(bot, { type: "outboxCleared" })
		for (const entry of held) {
			const said = promptRow(
				conversationId,
				entry.text,
				entry.repliedToMessageId ?? undefined,
			)
			write(
				bot,
				() => storePrompt(said, []),
				() => showPrompt(said),
			)
		}
	}

	const leaveStopping = (bot: BotChat) => {
		if (bot.state.turn !== "stopping") {
			return
		}
		announce(bot, { type: "turnChanged", state: "idle" })
		pump(bot)
	}

	const settleStop = (bot: BotChat, outcome: CancelOutcome) => {
		if (outcome.kind !== "failed") {
			leaveStopping(bot)
			return
		}
		for (const failure of outcome.failures) {
			dispatch(bot, { type: "stopRejected", error: toCancelError(failure) })
		}
	}

	const cancel = async (bot: BotChat, scope: RuntimeScope) => {
		try {
			settleStop(bot, await driver.cancelTurn(scope))
		} catch (reason) {
			dispatch(bot, { type: "stopRejected", error: toTransportError(reason) })
		}
	}

	const stopOwnTurn = async (bot: BotChat) => {
		const runtime = bot.state.runtime
		if (!runtime) {
			return
		}
		announce(bot, { type: "turnChanged", state: "stopping" })
		recordHeld(bot)
		await cancel(bot, runtime)
	}

	const stopForeignTurn = async (bot: BotChat, scope: RuntimeScope) => {
		const key = keyOf(scope)
		if (cancellingForeignScopes.has(key)) {
			return
		}
		cancellingForeignScopes.add(key)
		try {
			await cancel(bot, scope)
		} finally {
			cancellingForeignScopes.delete(key)
		}
	}

	const stop = async (bot: BotChat) => {
		if (canStopTurn(bot.state.turn)) {
			await stopOwnTurn(bot)
			return
		}
		const { foreignTurn } = bot.state
		if (foreignTurn) {
			await stopForeignTurn(bot, foreignTurn.scope)
		}
	}

	return { pump, send, stop }
}
