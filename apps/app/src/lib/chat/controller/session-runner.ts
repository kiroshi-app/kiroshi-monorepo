import { type BotChat, isAnswerable, isMutedRefusal } from "./bot-chat"
import type { ChatContext } from "./chat-context"
import type { ConversationLanding } from "./conversation-landing"
import type { EventRouting } from "./event-routing"
import type { ReplyWriter } from "./reply-writer"

import { isTurnBusy, toTransportError } from "../chat-state"
import {
	openedRun,
	type RotationReason,
	rotationReasonForStartFailure,
} from "../rotation"
import type { RuntimeScope } from "../../agent/contract"
import type { TerminalCompletion } from "../../conversations/transcript-contract"

const INTERRUPTED: TerminalCompletion = "interrupted"

type StartOrigin = "asked" | "reopen"

type SessionRunnerParts = {
	settleOpenReplies: ReplyWriter["settleOpenReplies"]
	connect: EventRouting["connect"]
	isAttached: EventRouting["isAttached"]
	pump: (bot: BotChat) => void
	landedConversationOf: ConversationLanding["landedConversationOf"]
}

export type SessionRunner = ReturnType<typeof createSessionRunner>

export const createSessionRunner = (
	{
		driver,
		store,
		now,
		foreignTurns,
		listeners,
		dispatch,
		announce,
		report,
		reportStore,
		showForeignTurn,
	}: ChatContext,
	{
		settleOpenReplies,
		connect,
		isAttached,
		pump,
		landedConversationOf,
	}: SessionRunnerParts,
) => {
	const checkFor = async (bot: BotChat) => {
		try {
			const result = await driver.check(bot.state.runtime)
			dispatch(bot, { type: "binaryVersion", version: result.binaryVersion })
			announce(bot, { type: "connectionChanged", state: result.connection })
			if (result.error) {
				report(bot, result.error)
			}
			return result
		} catch (reason) {
			report(bot, reason)
			return null
		}
	}

	const openRun = async (
		conversationId: string,
		bot: BotChat,
		reason: RotationReason | null,
	): Promise<RuntimeScope> => {
		const opened = await store.openRuntimeSession(
			conversationId,
			bot.id,
			now(),
			bot.state.runtime?.runtimeSessionId ?? null,
			reason,
		)
		const scope = {
			conversationId: opened.conversationId,
			botId: opened.botId,
			runtimeSessionId: opened.id,
			epoch: opened.seq,
		}
		foreignTurns.claim(scope)
		showForeignTurn(bot)
		return scope
	}

	const startFor = async (
		bot: BotChat,
		resume?: string,
		rotatedFor: RotationReason | null = null,
		origin: StartOrigin = "asked",
	) => {
		const conversationId = await landedConversationOf(bot)
		if (!conversationId) {
			return null
		}
		settleOpenReplies(bot, INTERRUPTED, conversationId)
		bot.activeTurn = null

		let runtime: RuntimeScope
		try {
			runtime = await openRun(conversationId, bot, rotatedFor)
		} catch (reason) {
			reportStore(bot, reason)
			return null
		}

		bot.run = openedRun(Boolean(resume))
		bot.mutesResumeRefusal = origin === "reopen"
		dispatch(bot, { type: "sessionReset", runtime, sessionId: resume ?? null })
		try {
			if (isAttached()) {
				await connect()
			}
			const handle = await driver.startOrResumeSession(runtime, resume)
			dispatch(bot, { type: "sessionOpened" })
			pump(bot)
			return handle
		} catch (reason) {
			const error = toTransportError(reason)
			bot.run.spent ??= rotationReasonForStartFailure(error)
			if (!isMutedRefusal(bot, error)) {
				announce(bot, { type: "failed", error })
			}
			return null
		}
	}

	const runPreflight = async (
		bot: BotChat,
		resume?: string,
		origin: StartOrigin = "asked",
	) => {
		const checked = await checkFor(bot)
		if (checked?.connection !== "ready") {
			return null
		}
		return startFor(bot, resume, bot.run.spent, origin)
	}

	const preflightFor = (
		bot: BotChat,
		resume?: string,
		origin: StartOrigin = "asked",
	) => {
		bot.pendingPreflight ??= runPreflight(bot, resume, origin).finally(() => {
			bot.pendingPreflight = null
		})
		return bot.pendingPreflight
	}

	const turnEnded = (bot: BotChat) =>
		new Promise<void>((resolve) => {
			if (!isTurnBusy(bot.state.turn)) {
				resolve()
				return
			}
			const watch = () => {
				if (isTurnBusy(bot.state.turn)) {
					return
				}
				listeners.delete(watch)
				resolve()
			}
			listeners.add(watch)
		})

	const reopenFor = async (bot: BotChat) => {
		await turnEnded(bot)
		return preflightFor(bot, bot.state.sessionId ?? undefined, "reopen")
	}

	const openedFor = (bot: BotChat) =>
		isAnswerable(bot) ? Promise.resolve(null) : preflightFor(bot)

	return { checkFor, startFor, preflightFor, reopenFor, openedFor }
}
