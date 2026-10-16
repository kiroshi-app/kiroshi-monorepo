import { toMentionTokens } from "./mentions"
import { type ConversationReader, readConversation } from "./read-conversation"
import { presentParticipants } from "./roster-conversations"
import type { TranscriptStore } from "./store-port"
import type { TerminalCompletion } from "./transcript-contract"

import { createQueue } from "../queue"
import type {
	AgentEvent,
	ChatMessage,
	QuestionRequest,
	RuntimeScope,
	SubmittedTurn,
} from "../agent/contract"
import type { ChatDriver } from "../chat/driver"
import {
	questionMessageIdOf,
	questionMessageText,
} from "../chat/question-message"
import {
	ENDING_FOR,
	ENDING_FOR_OUTCOME,
	isWorthKeeping,
} from "../chat/reply-endings"

const MENTION_SIGN = "@"

type OpenTurn = SubmittedTurn & {
	held: ChatMessage | null
	streamed: Map<string, number>
	written: Map<string, string>
	settled: Set<string>
}

type Desk = {
	scope: RuntimeScope
	turn: OpenTurn | null
}

const deskKeyOf = ({ conversationId, botId, runtimeSessionId }: RuntimeScope) =>
	`${conversationId} ${botId} ${runtimeSessionId}`

const openedTurn = (turn: SubmittedTurn): OpenTurn => ({
	...turn,
	held: null,
	streamed: new Map(),
	written: new Map(),
	settled: new Set(),
})

const isUnwritten = (turn: OpenTurn, id: string) =>
	!turn.streamed.has(id) && !turn.settled.has(id)

export const withFakeHostWrites = (
	driver: ChatDriver,
	store: TranscriptStore,
): ChatDriver => {
	const desks = new Map<string, Desk>()
	const enqueue = createQueue()
	const seatsReader: ConversationReader = {
		spaces: store.spaces,
		conversations: store.conversations,
	}

	const deskFor = (scope: RuntimeScope) => {
		const key = deskKeyOf(scope)
		const known = desks.get(key)
		if (known) {
			return known
		}
		const desk: Desk = { scope, turn: null }
		desks.set(key, desk)
		return desk
	}

	const write = (operation: () => Promise<unknown>) => {
		void enqueue(operation).catch((reason) =>
			console.error("the fake host could not write a reply", reason),
		)
	}

	const settledMentions = async (conversationId: string, written: string) => {
		if (!written.includes(MENTION_SIGN)) {
			return undefined
		}
		const seated = await readConversation(seatsReader, conversationId)
		if (!seated) {
			return undefined
		}
		const present = presentParticipants(seated).map(({ botId, name }) => ({
			id: botId,
			name,
		}))
		const settled = toMentionTokens(written, present)
		return settled === written ? undefined : settled
	}

	const append = (desk: Desk, id: string, seq: number, text: string) => {
		const turn = desk.turn
		const streamed = turn?.streamed.get(id)
		if (
			!turn ||
			text.length === 0 ||
			streamed === undefined ||
			seq <= streamed
		) {
			return
		}
		turn.streamed.set(id, seq)
		turn.written.set(id, (turn.written.get(id) ?? "") + text)
		write(() => store.appendText(id, text))
	}

	const open = (desk: Desk, message: ChatMessage) => {
		const turn = desk.turn
		if (!turn || !isUnwritten(turn, message.id)) {
			return
		}
		turn.streamed.set(message.id, 0)
		write(() =>
			store.openAssistantMessage({
				id: message.id,
				conversationId: desk.scope.conversationId,
				turnId: turn.turnId,
				authorBotId: desk.scope.botId,
				repliedToMessageId: turn.promptId,
				createdAt: message.timestamp,
			}),
		)
		append(desk, message.id, 1, message.text)
	}

	const stream = (desk: Desk, id: string, seq: number, text: string) => {
		const turn = desk.turn
		if (!turn || text.length === 0) {
			return
		}
		if (turn.held?.id === id) {
			const held = turn.held
			turn.held = null
			open(desk, held)
		}
		append(desk, id, seq, text)
	}

	const settle = (desk: Desk, id: string, completion: TerminalCompletion) => {
		const turn = desk.turn
		if (!turn?.streamed.delete(id)) {
			return
		}
		turn.settled.add(id)
		const written = turn.written.get(id) ?? ""
		const { conversationId } = desk.scope
		write(async () =>
			store.finalizeMessage(
				id,
				completion,
				await settledMentions(conversationId, written),
			),
		)
	}

	const writeReply = (
		desk: Desk,
		message: ChatMessage,
		completion: TerminalCompletion,
	) => {
		open(desk, message)
		settle(desk, message.id, completion)
	}

	const settleCompleted = (desk: Desk, message: ChatMessage) => {
		const completion = ENDING_FOR[message.completion]
		const turn = desk.turn
		if (!completion || !turn || turn.settled.has(message.id)) {
			return
		}
		if (turn.held?.id === message.id) {
			turn.held = null
		}
		if (isUnwritten(turn, message.id) && !isWorthKeeping(message, completion)) {
			return
		}
		writeReply(desk, message, completion)
	}

	const settleOpen = (desk: Desk, completion: TerminalCompletion) => {
		const turn = desk.turn
		if (!turn) {
			return
		}
		const held = turn.held
		turn.held = null
		if (held && isWorthKeeping(held, completion)) {
			writeReply(desk, held, completion)
		}
		for (const id of [...turn.streamed.keys()]) {
			settle(desk, id, completion)
		}
	}

	const writeQuestion = (desk: Desk, request: QuestionRequest) => {
		const turn = desk.turn
		const id = questionMessageIdOf(request.id)
		if (!turn || !isUnwritten(turn, id)) {
			return
		}
		turn.settled.add(id)
		write(async () => {
			await store.openAssistantMessage({
				id,
				conversationId: desk.scope.conversationId,
				turnId: turn.turnId,
				authorBotId: desk.scope.botId,
				repliedToMessageId: turn.promptId,
				createdAt: Date.now(),
			})
			await store.appendText(id, questionMessageText(request))
			await store.finalizeMessage(id, "complete")
		})
	}

	const end = (desk: Desk, completion: TerminalCompletion) => {
		settleOpen(desk, completion)
		desk.turn = null
	}

	const record = (desk: Desk, event: AgentEvent) => {
		const turn = desk.turn
		if (!turn) {
			return
		}
		switch (event.type) {
			case "messageStarted":
				if (isUnwritten(turn, event.message.id)) {
					turn.held = event.message
				}
				return
			case "messageDelta":
				stream(desk, event.id, event.seq, event.text)
				return
			case "messageCompleted":
				settleCompleted(desk, event.message)
				return
			case "questionRequested":
				settleOpen(desk, "complete")
				writeQuestion(desk, event.request)
				return
			case "turnEnded":
				end(desk, ENDING_FOR_OUTCOME[event.ended.outcome])
				return
			case "turnChanged":
				if (event.state === "failed") {
					end(desk, "failed")
				}
				return
		}
	}

	const submitPrompt = async (
		scope: RuntimeScope,
		text: string,
		turn?: SubmittedTurn,
	) => {
		const desk = deskFor(scope)
		if (turn) {
			end(desk, "cancelled")
			desk.turn = openedTurn(turn)
		}
		try {
			await driver.submitPrompt(scope, text, turn)
		} catch (reason) {
			end(desk, "failed")
			throw reason
		}
	}

	return {
		check: (scope) => driver.check(scope),
		namingFor: (text) => driver.namingFor(text),
		startOrResumeSession: (...opening) =>
			driver.startOrResumeSession(...opening),
		submitPrompt,
		storeAttachments: (conversationId, attachments) =>
			driver.storeAttachments(conversationId, attachments),
		cancelTurn: (scope) => driver.cancelTurn(scope),
		respondToPermission: (scope, id, decision) =>
			driver.respondToPermission(scope, id, decision),
		answerQuestion: (...answering) => driver.answerQuestion(...answering),
		shutdown: (scope) => driver.shutdown(scope),
		pendingQuestions: (conversationId) =>
			driver.pendingQuestions(conversationId),
		subscribe: (onEvent) =>
			driver.subscribe((scoped) => {
				if (scoped.scope) {
					record(deskFor(scoped.scope), scoped.event)
				}
				onEvent(scoped)
			}),
	}
}
