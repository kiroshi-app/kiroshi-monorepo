import {
	type BotChat,
	isAnswerable,
	isRunOutsideOpenThread,
	submittedTurnOf,
} from "./bot-chat"
import type { CarriedContext } from "./carried-context"
import type { ChatContext } from "./chat-context"
import type { ConversationLanding } from "./conversation-landing"
import type { PromptRows } from "./prompt-rows"
import type { RunRotation } from "./run-rotation"
import type { SessionRunner } from "./session-runner"
import type { TranscriptPaging } from "./transcript-paging"

import type { SubmittedAttachment } from "../attachments-contract"
import {
	isTurnBusy,
	type OutboxEntry,
	type StoreRefusal,
	toStoreError,
	toTransportError,
} from "../chat-state"
import type { TranscriptMessage } from "../../conversations/transcript-contract"

type HeldPrompt = Omit<OutboxEntry, "id">

type PromptOutcome =
	| { kind: "submitted" }
	| { kind: "refused" }
	| { kind: "unwritten"; refusal?: StoreRefusal }

const outcomeOf = (isSubmitted: boolean): PromptOutcome =>
	isSubmitted ? { kind: "submitted" } : { kind: "refused" }

type PromptSubmissionParts = {
	startFor: SessionRunner["startFor"]
	rotateIfDue: RunRotation["rotateIfDue"]
	contextFor: CarriedContext["contextFor"]
	loadLatest: TranscriptPaging["loadLatest"]
	promptRows: PromptRows
	landedConversationOf: ConversationLanding["landedConversationOf"]
}

export type PromptSubmission = ReturnType<typeof createPromptSubmission>

export const createPromptSubmission = (
	{ driver, bots, enqueue, dispatch, report }: ChatContext,
	{
		startFor,
		rotateIfDue,
		contextFor,
		loadLatest,
		promptRows: { promptRow, storePrompt, showPrompt },
		landedConversationOf,
	}: PromptSubmissionParts,
) => {
	const submit = async (bot: BotChat, id: string, text: string) => {
		const runtime = bot.state.runtime
		if (!runtime || !isAnswerable(bot)) {
			dispatch(bot, {
				type: "promptRejected",
				id,
				error: { kind: "notStarted" },
			})
			return false
		}
		let carried: string
		try {
			carried = await contextFor(bot, id, text)
		} catch (refusal) {
			dispatch(bot, {
				type: "promptRejected",
				id,
				error: toStoreError(refusal),
			})
			return false
		}
		try {
			await driver.submitPrompt(runtime, carried, submittedTurnOf(bot))
			bot.run.carried = true
			bot.run.prompts += 1
			return true
		} catch (reason) {
			dispatch(bot, {
				type: "promptRejected",
				id,
				error: toTransportError(reason),
			})
			return false
		}
	}

	const admit = async (bot: BotChat, submission: () => Promise<void>) => {
		if (bot.sending || isTurnBusy(bot.state.turn)) {
			report(bot, { kind: "turnAlreadyRunning" })
			return
		}
		await claim(bot, submission)
	}

	const claim = async <T>(bot: BotChat, submission: () => Promise<T>) => {
		bot.sending = true
		try {
			return await submission()
		} finally {
			bot.sending = false
		}
	}

	const runInOpenThread = async (bot: BotChat) =>
		!isRunOutsideOpenThread(bot) || (await startFor(bot)) !== null

	const recordedPromptOf = (bot: BotChat, refusal?: StoreRefusal) =>
		refusal
			? bot.state.messages.find(({ id }) => id === refusal.messageId)
			: undefined

	const submitRecorded = async (
		bot: BotChat,
		recorded: TranscriptMessage,
		{ text, refusal }: HeldPrompt,
	) => {
		if (refusal?.errorId) {
			dispatch(bot, { type: "errorDismissed", id: refusal.errorId })
		}
		bot.activeTurn = {
			id: recorded.turnId,
			promptId: recorded.id,
			conversationId: recorded.conversationId,
		}
		return outcomeOf(await submit(bot, recorded.id, text))
	}

	const sendPrompt = async (
		bot: BotChat,
		prompt: HeldPrompt,
	): Promise<PromptOutcome> => {
		const unwritten: PromptOutcome = {
			kind: "unwritten",
			refusal: prompt.refusal,
		}
		const conversationId = await landedConversationOf(bot)
		if (!conversationId) {
			return unwritten
		}
		const isWritable =
			(await loadLatest(bot)) && bot.state.conversationId === conversationId
		if (!isWritable || !(await runInOpenThread(bot))) {
			return unwritten
		}
		await rotateIfDue(bot)
		dispatch(bot, { type: "promptSubmitted" })

		const recorded = recordedPromptOf(bot, prompt.refusal)
		if (recorded) {
			return submitRecorded(bot, recorded, prompt)
		}
		const said = promptRow(
			conversationId,
			prompt.text,
			prompt.replyLinks,
			prompt.documents,
			prompt.refusal?.messageId,
		)
		try {
			await enqueue(() => storePrompt(said, [bot.id]))
		} catch (reason) {
			dispatch(bot, {
				type: "promptRejected",
				id: null,
				error: toStoreError(reason),
			})
			return {
				kind: "unwritten",
				refusal: {
					messageId: said.id,
					errorId: bot.state.errors.at(-1)?.id ?? null,
				},
			}
		}

		showPrompt(said)
		bot.activeTurn = { id: said.turnId, promptId: said.id, conversationId }
		return outcomeOf(await submit(bot, said.id, prompt.text))
	}

	const retryPrompt = async (bot: BotChat, id: string) => {
		if (bot.state.rejectedPromptId !== id) {
			return
		}
		const target = bot.state.messages.find((message) => message.id === id)
		if (target?.role !== "user" || !(await runInOpenThread(bot))) {
			return
		}
		dispatch(bot, { type: "promptRetried", id })
		await rotateIfDue(bot)
		bot.activeTurn = {
			id: target.turnId,
			promptId: id,
			conversationId: target.conversationId,
		}
		await submit(bot, id, target.content)
	}

	const storeAttachments = (
		botId: string,
		attachments: SubmittedAttachment[],
	): Promise<string[]> => {
		const conversationId = bots.get(botId)?.state.conversationId
		if (!conversationId) {
			return Promise.reject({
				kind: "unwritable",
				detail: "no conversation is open to attach them to",
			})
		}
		return driver.storeAttachments(conversationId, attachments)
	}

	return {
		admit,
		claim,
		runInOpenThread,
		sendPrompt,
		retryPrompt,
		storeAttachments,
	}
}
