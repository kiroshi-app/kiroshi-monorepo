import { i18n } from "@workspace/ui/lib/i18n"

import { createArrivalsListener } from "./create-arrivals-listener"
import {
	createMessageStoredListener,
	createReconnectionListener,
	type MessageStoredListener,
	type ReconnectionListener,
} from "./create-live-listeners"
import { createForeignTurns, type ForeignSpeaker } from "./foreign-turns"
import { addresseesIn, toMentionTokens } from "./mentions"
import { readConversation } from "./read-conversation"
import {
	isNameless,
	leadOf,
	presentParticipants,
	type StoredConversation,
	storedSpeakerIdsOf,
} from "./roster-conversations"
import type {
	ActiveTurn,
	Conversation,
	MessagePin,
	NewUserMessage,
} from "./store-contract"
import type { TranscriptStore } from "./store-port"
import type {
	CompanionArrival,
	CompanionSpoke,
	TerminalCompletion,
	TranscriptDraft,
	TranscriptMessage,
} from "./transcript-contract"
import { createTranscriptController } from "./transcript-controller"
import {
	selectArrivals,
	selectHasMore,
	selectHasNewer,
	selectIsFirstLoadPending,
	selectMessages,
} from "./transcript-state"
import {
	emptyQueue,
	handedOver,
	openedWave,
	reopenedFor,
	type Summons,
	type TurnQueue,
} from "./turn-queue"

import { createQueue } from "../queue"
import { createStore } from "../store"
import type {
	ActivityEvent,
	AgentEvent,
	ChatMessage,
	ConversationNaming,
	PermissionDecision,
	PermissionRequest,
	QuestionAnswers,
	QuestionRequest,
	RuntimeScope,
	ScopedEvent,
	TransportError,
} from "../agent/contract"
import type { ChatError } from "../chat/chat-state"
import {
	chatErrorOf,
	isSameRuntimeScope,
	toReadError,
	toTransportError,
} from "../chat/chat-state"
import type { ChatDriver } from "../chat/driver"
import { toPublishedBlocks } from "../chat/markdown-blocks"
import {
	answeredText,
	questionMessageIdOf,
	questionMessageText,
} from "../chat/question-message"
import {
	ENDING_FOR,
	ENDING_FOR_OUTCOME,
	isWorthKeeping,
} from "../chat/reply-endings"
import { needsFreshSession } from "../chat/screen-model"
import {
	type WorkingState,
	withActivity,
	workingFor,
} from "../chat/working-kind"
import { createReportedRunsReader } from "../routines/create-run-port"
import {
	NO_REPORTED_RUNS,
	type ReportedRun,
	type ReportedRunsByTurnId,
	type RunReportDraft,
} from "../routines/routine-contract"
import type { ReportedRunsReader } from "../routines/run-port"
import {
	causeOf,
	readReportedCauses,
	writeReportTurn,
} from "../routines/run-report"

export type RefusedMessage = {
	id: string
	text: string
	repliedToMessageId: string | null
}

export type UnresolvedMention = {
	botId: string
	name: string | null
}

export type PendingPrompt =
	| { kind: "question"; botId: string; request: QuestionRequest }
	| { kind: "permission"; botId: string; request: PermissionRequest }

export type SpeakingBot = {
	botId: string
	work: WorkingState
	hasPublished: boolean
	isForeign: boolean
	stop: (() => Promise<void>) | null
}

export type ConversationState = {
	conversationId: string | null
	messages: TranscriptMessage[]
	arrivals: CompanionArrival[]
	hasOlder: boolean
	isLoadingOlder: boolean
	hasNewer: boolean
	isLoadingNewer: boolean
	isFirstLoadPending: boolean
	speakers: SpeakingBot[]
	waitingBotIds: string[]
	refusedMessage: RefusedMessage | null
	pendingPrompt: PendingPrompt | null
	latestError: ChatError | null
	reportedCauses: ReportedRunsByTurnId
	unresolvedMentions: UnresolvedMention[]
}

export type ConversationController = {
	getState: () => ConversationState
	subscribe: (listener: () => void) => () => void
	attach: () => () => void
	open: (conversation: StoredConversation) => Promise<void>
	loadOlder: () => Promise<void>
	loadNewer: () => Promise<void>
	loadLatest: () => Promise<boolean>
	landOn: (seq: number) => Promise<TranscriptMessage[]>
	follow: (isAtLiveEdge: boolean) => void
	leave: () => void
	send: (text: string, repliedToMessageId?: string) => Promise<void>
	sendAgain: (messageId: string) => Promise<void>
	reportRun: (draft: RunReportDraft) => Promise<string>
	relayRunReport: (scope: RuntimeScope, message: ChatMessage) => Promise<void>
	relaySpoken: (spoken: CompanionSpoke) => Promise<boolean>
	pin: (messageId: string, blockIndex: number) => Promise<void>
	unpin: (messageId: string, blockIndex: number) => Promise<void>
	pins: () => Promise<MessagePin[]>
	dismissError: (id: string) => void
	dismissUnresolvedMentions: () => void
	answer: (id: string, answers: QuestionAnswers) => Promise<void>
	respond: (id: string, decision: PermissionDecision) => Promise<void>
	stop: () => Promise<void>
	shutdown: () => Promise<void>
}

export type CompanionArrivalListener = (
	listener: (arrival: CompanionArrival) => void,
) => Promise<() => void>

export type ConversationControllerOptions = {
	newId?: () => string
	now?: () => number
	onNamed?: (conversationId: string, naming: ConversationNaming) => void
	readReportedRuns?: ReportedRunsReader
	onCompanionArrived?: CompanionArrivalListener
	onMessageStored?: MessageStoredListener
	onReconnected?: ReconnectionListener
	onForeignSpeakerSilent?: (conversationId: string) => void
	senderAccountId?: () => string | null
}

type Seating = "held" | "unknown" | "unreadable"

type AnswerPlace = Pick<NewUserMessage, "conversationId" | "turnId">

type OpenTurn = {
	id: string
	promptId: string
}

type SentPrompt = {
	turn: OpenTurn
	conversationId: string
	content: string
	answered: TranscriptMessage | null
}

type HandedMention = {
	fromBotId: string
	botId: string
	promptId: string
}

type Speaker = {
	botId: string
	promptId: string
	scope: RuntimeScope | null
	turn: OpenTurn
	openMessages: Map<string, number>
	settledMessages: Set<string>
	heldReply: ChatMessage | null
	written: Map<string, string>
	activities: ActivityEvent[]
	pending: PendingPrompt | null
	askedAt: number
	startedAt: number
	isDropped: boolean
}

const NO_MESSAGES: TranscriptMessage[] = []

const NO_ARRIVALS: CompanionArrival[] = []

const NO_PINS: MessagePin[] = []

const NO_SPEAKERS: SpeakingBot[] = []

const NO_UNRESOLVED_MENTIONS: UnresolvedMention[] = []

const isSameWork = (left: WorkingState | null, right: WorkingState | null) =>
	left?.kind === right?.kind &&
	left?.label === right?.label &&
	left?.startedAt === right?.startedAt

const isSameOrder = (left: string[], right: string[]) =>
	left.length === right.length && left.every((id, rank) => id === right[rank])

const isSameSpeakers = (left: SpeakingBot[], right: SpeakingBot[]) =>
	left.length === right.length &&
	left.every(
		(speaking, rank) =>
			speaking.botId === right[rank].botId &&
			speaking.hasPublished === right[rank].hasPublished &&
			speaking.isForeign === right[rank].isForeign &&
			(speaking.stop === null) === (right[rank].stop === null) &&
			isSameWork(speaking.work, right[rank].work),
	)

const isSameState = (left: ConversationState, right: ConversationState) =>
	left.conversationId === right.conversationId &&
	left.messages === right.messages &&
	left.arrivals === right.arrivals &&
	left.hasOlder === right.hasOlder &&
	left.isLoadingOlder === right.isLoadingOlder &&
	left.hasNewer === right.hasNewer &&
	left.isLoadingNewer === right.isLoadingNewer &&
	left.isFirstLoadPending === right.isFirstLoadPending &&
	isSameSpeakers(left.speakers, right.speakers) &&
	isSameOrder(left.waitingBotIds, right.waitingBotIds) &&
	left.refusedMessage === right.refusedMessage &&
	left.pendingPrompt === right.pendingPrompt &&
	left.latestError === right.latestError &&
	left.reportedCauses === right.reportedCauses &&
	left.unresolvedMentions === right.unresolvedMentions

const promptWork = (pending: PendingPrompt): WorkingState => ({
	kind: "waiting",
	label:
		pending.kind === "question"
			? pending.request.questions[0]?.question
			: pending.request.title,
})

const speakerWork = (held: Speaker, hasPublished: boolean): WorkingState =>
	held.pending
		? promptWork(held.pending)
		: {
				...workingFor(held.activities, hasPublished),
				startedAt: held.startedAt,
			}

const initialState: ConversationState = {
	conversationId: null,
	messages: NO_MESSAGES,
	arrivals: NO_ARRIVALS,
	hasOlder: false,
	isLoadingOlder: false,
	hasNewer: false,
	isLoadingNewer: false,
	isFirstLoadPending: false,
	speakers: NO_SPEAKERS,
	waitingBotIds: [],
	refusedMessage: null,
	pendingPrompt: null,
	latestError: null,
	reportedCauses: NO_REPORTED_RUNS,
	unresolvedMentions: NO_UNRESOLVED_MENTIONS,
}

export const createConversationController = (
	driver: ChatDriver,
	store: TranscriptStore,
	options: ConversationControllerOptions = {},
): ConversationController => {
	const newId = options.newId ?? (() => crypto.randomUUID())
	const now = options.now ?? (() => Date.now())
	const senderAccountId = options.senderAccountId ?? (() => null)
	const readReportedRuns =
		options.readReportedRuns ?? createReportedRunsReader()
	const onCompanionArrived =
		options.onCompanionArrived ?? createArrivalsListener()
	const onMessageStored =
		options.onMessageStored ?? createMessageStoredListener()
	const onReconnected = options.onReconnected ?? createReconnectionListener()
	const transcript = createTranscriptController(store)
	const hearSilence = ({ conversationId }: RuntimeScope) => {
		sync()
		options.onForeignSpeakerSilent?.(conversationId)
	}
	const foreignTurns = createForeignTurns(transcript, now, hearSilence)
	const enqueue = createQueue()

	const stateStore = createStore(initialState)
	const current = stateStore.getState
	let conversation: StoredConversation | null = null
	let queue: TurnQueue = emptyQueue
	let activeTurn: OpenTurn | null = null
	const speakers = new Map<string, Speaker>()
	let asks = 0
	const runs = new Map<string, RuntimeScope>()
	let refused: RefusedMessage | null = null
	let reportedCauses: ReportedRunsByTurnId = NO_REPORTED_RUNS
	let latestError: ChatError | null = null
	let arrivedBotIds: string[] = []
	let unresolvedMentions: UnresolvedMention[] = NO_UNRESOLVED_MENTIONS
	let errorCount = 0
	let detach: Promise<() => void> | null = null
	let stopArrivals: Promise<() => void> | null = null
	let stopStoredMessages: Promise<() => void> | null = null
	let stopReconnections: (() => void) | null = null
	let shouldRebuildForeignTurns = false

	const settle = (next: ConversationState) => {
		if (isSameState(current(), next)) {
			return
		}
		stateStore.setState(next)
	}

	const noteFailure = (error: TransportError) => {
		latestError = chatErrorOf(error, errorCount)
		errorCount += 1
	}

	const noteSpeakerFailure = (botId: string, error: TransportError) => {
		latestError = { ...chatErrorOf(error, errorCount), botId }
		errorCount += 1
	}

	const forgetFailure = () => {
		latestError = null
	}

	const forgetFailureSeen = (seen: ChatError | null) => {
		if (latestError !== seen) {
			return
		}
		forgetFailure()
	}

	const readTranscript = () => {
		const conversationId = conversation?.id
		if (!conversationId) {
			return {
				messages: NO_MESSAGES,
				arrivals: NO_ARRIVALS,
				hasOlder: false,
				hasNewer: false,
				isFirstLoadPending: false,
			}
		}
		const held = transcript.getState()
		return {
			messages: selectMessages(held, conversationId),
			arrivals: selectArrivals(held, conversationId),
			hasOlder: selectHasMore(held, conversationId),
			hasNewer: selectHasNewer(held, conversationId),
			isFirstLoadPending: selectIsFirstLoadPending(held, conversationId),
		}
	}

	const runningSpeakers = (): Speaker[] =>
		queue.wave.flatMap(({ botId }) => speakers.get(botId) ?? [])

	const hasPublishedBlock = (held: Speaker): boolean =>
		[...held.written].some(
			([id, text]) =>
				toPublishedBlocks(text, held.openMessages.has(id)).length > 0,
		)

	const localSpeakingBots = (): SpeakingBot[] =>
		runningSpeakers().map((held) => {
			const hasPublished = hasPublishedBlock(held)
			return {
				botId: held.botId,
				work: speakerWork(held, hasPublished),
				hasPublished,
				isForeign: false,
				stop: () => stopSpeaker(held.botId),
			}
		})

	const foreignSpeakingBot = (
		speaker: ForeignSpeaker,
		startedAt = speaker.startedAt,
	): SpeakingBot => ({
		botId: speaker.scope.botId,
		work: {
			...workingFor(speaker.activities, speaker.hasWritten),
			startedAt,
		},
		hasPublished: speaker.hasWritten,
		isForeign: true,
		stop: () => stopForeignTurn(speaker.scope),
	})

	const unheardSpeakingBot = (
		botId: string,
		startedAt: number,
	): SpeakingBot => ({
		botId,
		work: { ...workingFor([], false), startedAt },
		hasPublished: false,
		isForeign: true,
		stop: null,
	})

	const storedSpeakingBots = (
		conversationId: string,
		{ startedAt, botIds }: ActiveTurn,
	): SpeakingBot[] => {
		const heard = foreignTurns.speakersIn(conversationId)
		return botIds.map((botId) => {
			const speaker = heard.find(({ scope }) => scope.botId === botId)
			return speaker
				? foreignSpeakingBot(speaker, startedAt)
				: unheardSpeakingBot(botId, startedAt)
		})
	}

	const foreignSpeakingBots = (): SpeakingBot[] => {
		if (!conversation) {
			return []
		}
		const { id, activeTurn } = conversation
		if (activeTurn === undefined) {
			return foreignTurns
				.speakersIn(id)
				.map((speaker) => foreignSpeakingBot(speaker))
		}
		return activeTurn ? storedSpeakingBots(id, activeTurn) : NO_SPEAKERS
	}

	const speakingBots = (): SpeakingBot[] => {
		const foreign = new Map(
			foreignSpeakingBots().map((speaking) => [speaking.botId, speaking]),
		)
		for (const botId of speakers.keys()) {
			foreign.delete(botId)
		}
		return [...localSpeakingBots(), ...foreign.values()]
	}

	const localPrompt = (): PendingPrompt | null =>
		runningSpeakers()
			.filter((held) => held.pending !== null)
			.sort((left, right) => left.askedAt - right.askedAt)[0]?.pending ?? null

	const foreignPromptOf = ({
		scope,
		permission,
		question,
	}: ForeignSpeaker): PendingPrompt | null => {
		if (permission) {
			return { kind: "permission", botId: scope.botId, request: permission }
		}
		return question
			? { kind: "question", botId: scope.botId, request: question }
			: null
	}

	const foreignPrompt = (): PendingPrompt | null =>
		conversation
			? (foreignTurns
					.speakersIn(conversation.id)
					.map(foreignPromptOf)
					.find((prompt) => prompt !== null) ?? null)
			: null

	const oldestPrompt = (): PendingPrompt | null =>
		localPrompt() ?? foreignPrompt()

	const sync = () => {
		settle({
			...current(),
			...readTranscript(),
			conversationId: conversation?.id ?? null,
			speakers: speakingBots(),
			waitingBotIds: queue.waiting.map(({ botId }) => botId),
			refusedMessage: refused,
			pendingPrompt: oldestPrompt(),
			latestError,
			reportedCauses,
			unresolvedMentions,
		})
	}

	transcript.subscribe(sync)

	const write = (operation: () => Promise<unknown>, shown?: () => void) => {
		void enqueue(operation).then(
			() => shown?.(),
			(reason) => {
				noteFailure(toReadError(reason))
				sync()
			},
		)
	}

	const participants = () =>
		conversation ? presentParticipants(conversation) : []

	const presentBotIds = () => [
		...new Set([...participants().map(({ botId }) => botId), ...arrivedBotIds]),
	]

	const mentionBots = () =>
		participants().map(({ botId, name }) => ({ id: botId, name }))

	const isUnwritten = (held: Speaker, id: string) =>
		!held.openMessages.has(id) && !held.settledMessages.has(id)

	const openReply = (held: Speaker, message: ChatMessage) => {
		if (!conversation || !held.scope || !isUnwritten(held, message.id)) {
			return
		}
		const conversationId = conversation.id
		const { runtimeSessionId } = held.scope
		held.openMessages.set(message.id, 0)
		transcript.append({
			id: message.id,
			conversationId,
			turnId: held.turn.id,
			role: "assistant",
			content: "",
			completion: "streaming",
			createdAt: message.timestamp,
			authorBotId: held.botId,
			authorAccountId: null,
			authorName: null,
			repliedToMessageId: held.turn.promptId,
			runtimeSessionId,
		})
		streamReply(held, message.id, 1, message.text)
	}

	const streamReply = (
		held: Speaker,
		id: string,
		seq: number,
		text: string,
	) => {
		if (text.length === 0 || !conversation) {
			return
		}
		const conversationId = conversation.id
		if (held.heldReply?.id === id) {
			const pending = held.heldReply
			held.heldReply = null
			openReply(held, pending)
		}
		const streamed = held.openMessages.get(id)
		if (streamed === undefined || seq <= streamed) {
			return
		}
		held.openMessages.set(id, seq)
		held.written.set(id, (held.written.get(id) ?? "") + text)
		transcript.stream({ conversationId, id, text })
	}

	const settleMentions = (held: Speaker, id: string) => {
		const written = held.written.get(id) ?? ""
		const settled = toMentionTokens(written, mentionBots())
		if (settled === written) {
			return undefined
		}
		held.written.set(id, settled)
		return settled
	}

	const settleReply = (
		held: Speaker,
		id: string,
		completion: TerminalCompletion,
	) => {
		if (!held.openMessages.has(id) || !conversation) {
			return
		}
		const conversationId = conversation.id
		held.openMessages.delete(id)
		held.settledMessages.add(id)
		const settledText = settleMentions(held, id)
		transcript.settle({ conversationId, id, completion, settledText })
	}

	const writeReply = (
		held: Speaker,
		message: ChatMessage,
		completion: TerminalCompletion,
	) => {
		openReply(held, message)
		settleReply(held, message.id, completion)
	}

	const reviseSettled = (held: Speaker, message: ChatMessage) => {
		const revised = toMentionTokens(message.text, mentionBots())
		if (!conversation || !revised || revised === held.written.get(message.id)) {
			return
		}
		held.written.set(message.id, revised)
		transcript.revise({
			conversationId: conversation.id,
			id: message.id,
			text: revised,
		})
	}

	const settleCompleted = (held: Speaker, message: ChatMessage) => {
		const completion = ENDING_FOR[message.completion]
		if (!completion) {
			return
		}
		if (held.settledMessages.has(message.id)) {
			return reviseSettled(held, message)
		}
		if (held.heldReply?.id === message.id) {
			held.heldReply = null
		}
		if (isUnwritten(held, message.id) && !isWorthKeeping(message, completion)) {
			return
		}
		writeReply(held, message, completion)
	}

	const settleOpenReplies = (held: Speaker, completion: TerminalCompletion) => {
		const pending = held.heldReply
		held.heldReply = null
		if (pending && isWorthKeeping(pending, completion)) {
			writeReply(held, pending, completion)
		}
		for (const id of [...held.openMessages.keys()]) {
			settleReply(held, id, completion)
		}
	}

	const readSeating = async (conversationId: string) => {
		try {
			return await readConversation(store, conversationId)
		} catch (reason) {
			noteFailure(toReadError(reason))
			return null
		}
	}

	const nameSeatedIn = (seated: Conversation | null, botId: string) =>
		seated?.participants.find((participant) => participant.botId === botId)
			?.name ?? null

	const isBetterThan = (
		found: UnresolvedMention,
		known: UnresolvedMention | undefined,
	) => !known || (found.name !== null && known.name === null)

	const rememberUnresolved = (missed: UnresolvedMention[]) => {
		const held = new Map(
			unresolvedMentions.map((mention) => [mention.botId, mention]),
		)
		const fresh = missed.filter((found) =>
			isBetterThan(found, held.get(found.botId)),
		)
		if (fresh.length === 0) {
			return
		}
		for (const found of fresh) {
			held.set(found.botId, found)
		}
		unresolvedMentions = [...held.values()]
	}

	const seatedFromStore = async (
		handed: HandedMention[],
	): Promise<HandedMention[]> => {
		const conversationId = conversation?.id
		if (handed.length === 0 || !conversationId) {
			return []
		}
		const seated = await readSeating(conversationId)
		if (conversation?.id !== conversationId) {
			return []
		}
		const present = seated
			? presentParticipants(seated).map(({ botId }) => botId)
			: []
		const found: HandedMention[] = []
		const missed: UnresolvedMention[] = []
		for (const mention of handed) {
			if (present.includes(mention.botId)) {
				found.push(mention)
				continue
			}
			missed.push({
				botId: mention.botId,
				name: nameSeatedIn(seated, mention.botId),
			})
		}
		rememberUnresolved(missed)
		return found
	}

	const handOver = (handed: HandedMention[]) => {
		for (const { fromBotId, botId, promptId } of handed) {
			queue = handedOver(queue, fromBotId, { botId, promptId })
		}
	}

	const mentionsHandedBy = (
		fromBotId: string,
		promptId: string,
		botIds: string[],
	): HandedMention[] => botIds.map((botId) => ({ fromBotId, botId, promptId }))

	const noteHandovers = (held: Speaker): HandedMention[] => {
		const present = presentBotIds()
		const unseated: HandedMention[] = []
		for (const [promptId, text] of held.written) {
			const { named, unresolved } = addresseesIn(text, present)
			handOver(mentionsHandedBy(held.botId, promptId, named))
			unseated.push(...mentionsHandedBy(held.botId, promptId, unresolved))
		}
		return unseated
	}

	const syncAndDrive = () => {
		sync()
		drive()
	}

	const closeSpeaker = (held: Speaker, completion: TerminalCompletion) => {
		if (speakers.get(held.botId) !== held) {
			return
		}
		speakers.delete(held.botId)
		settleOpenReplies(held, completion)
		void shutdownSpeaker(held)
		const handed = held.isDropped ? [] : noteHandovers(held)
		if (handed.length === 0) {
			syncAndDrive()
			return
		}
		void seatedFromStore(handed).then((seated) => {
			handOver(seated)
			syncAndDrive()
		})
	}

	const failSpeaker = (held: Speaker, error: TransportError) => {
		noteSpeakerFailure(held.botId, error)
		if (needsFreshSession(error)) {
			closeSpeaker(held, "failed")
			return
		}
		sync()
	}

	const noteActivity = (held: Speaker, activity: ActivityEvent) => {
		held.activities = withActivity(held.activities, activity)
		sync()
	}

	const holdPrompt = (held: Speaker, pending: PendingPrompt) => {
		held.pending = pending
		held.askedAt = asks
		asks += 1
		sync()
	}

	const releasePrompt = (held: Speaker, id: string) => {
		if (held.pending?.request.id !== id) {
			return
		}
		held.pending = null
		sync()
	}

	const writeQuestionRow = (held: Speaker, request: QuestionRequest) => {
		const id = questionMessageIdOf(request.id)
		if (!conversation || !held.scope || !isUnwritten(held, id)) {
			return
		}
		held.settledMessages.add(id)
		const row: TranscriptDraft = {
			id,
			conversationId: conversation.id,
			turnId: held.turn.id,
			role: "assistant",
			content: questionMessageText(request),
			completion: "complete",
			createdAt: now(),
			authorBotId: held.botId,
			authorAccountId: null,
			authorName: null,
			repliedToMessageId: held.turn.promptId,
			runtimeSessionId: held.scope.runtimeSessionId,
		}
		transcript.append(row)
	}

	const askQuestion = (held: Speaker, request: QuestionRequest) => {
		settleOpenReplies(held, "complete")
		writeQuestionRow(held, request)
		holdPrompt(held, { kind: "question", botId: held.botId, request })
	}

	const apply = (held: Speaker, event: AgentEvent) => {
		switch (event.type) {
			case "messageStarted":
				if (isUnwritten(held, event.message.id)) {
					held.heldReply = event.message
				}
				return
			case "messageDelta":
				return streamReply(held, event.id, event.seq, event.text)
			case "activity":
				return noteActivity(held, event.activity)
			case "messageCompleted":
				return settleCompleted(held, event.message)
			case "questionRequested":
				return askQuestion(held, event.request)
			case "permissionRequested":
				return holdPrompt(held, {
					kind: "permission",
					botId: held.botId,
					request: event.request,
				})
			case "permissionResolved":
				return releasePrompt(held, event.id)
			case "turnEnded":
				return closeSpeaker(held, ENDING_FOR_OUTCOME[event.ended.outcome])
			case "failed":
				return failSpeaker(held, event.error)
			default:
				return
		}
	}

	const speakerAt = (scope: RuntimeScope | null) =>
		[...speakers.values()].find(
			(held) => held.scope !== null && isSameRuntimeScope(scope, held.scope),
		)

	const isOpenConversation = (conversationId: string) =>
		conversationId === conversation?.id

	const route = ({ scope, turn, event }: ScopedEvent) => {
		const held = speakerAt(scope)
		if (held) {
			apply(held, event)
			return
		}
		if (scope && turn && isOpenConversation(turn.conversationId)) {
			foreignTurns.render(scope, turn, event)
			sync()
		}
	}

	const routeOpen = (conversationId: string, pending: ScopedEvent[]) => {
		if (isOpenConversation(conversationId)) {
			pending.forEach(route)
		}
	}

	const routePendingQuestions = async (conversationId: string) => {
		try {
			const pending = await driver.pendingQuestions(conversationId)
			await enqueue(async () => routeOpen(conversationId, pending))
		} catch (reason) {
			noteFailure(toReadError(reason))
			sync()
		}
	}

	const seatArrival = (botId: string) => {
		if (arrivedBotIds.includes(botId)) {
			return
		}
		arrivedBotIds = [...arrivedBotIds, botId]
	}

	const announce = (arrival: CompanionArrival) => {
		if (arrival.conversationId !== conversation?.id) {
			return
		}
		seatArrival(arrival.botId)
		transcript.announce(arrival)
	}

	const reloadOpenPage = async () => {
		if (!conversation) {
			return
		}
		const conversationId = conversation.id
		try {
			await enqueue(() => transcript.load(conversationId))
		} catch (reason) {
			noteFailure(toReadError(reason))
			sync()
		}
	}

	const reloadStoredPage = ({ conversationId }: TranscriptMessage) => {
		if (isOpenConversation(conversationId)) {
			void reloadOpenPage()
		}
	}

	const disconnect = () => {
		detach?.then((unlisten) => unlisten())
		detach = null
		stopArrivals?.then((unlisten) => unlisten())
		stopArrivals = null
		stopStoredMessages?.then((unlisten) => unlisten())
		stopStoredMessages = null
		stopReconnections?.()
		stopReconnections = null
		foreignTurns.dispose()
	}

	const catchUpAfterReconnection = () => {
		shouldRebuildForeignTurns = true
		void reloadOpenPage()
	}

	const rebuildForeignTurns = (shown: StoredConversation) => {
		const storedIds = storedSpeakerIdsOf(shown)
		if (!shouldRebuildForeignTurns || !storedIds) {
			return
		}
		shouldRebuildForeignTurns = false
		foreignTurns.keepOnly(shown.id, storedIds)
	}

	const connect = () => {
		disconnect()
		stopArrivals = onCompanionArrived(announce)
		stopStoredMessages = onMessageStored(reloadStoredPage)
		stopReconnections = onReconnected(catchUpAfterReconnection)
		detach = driver.subscribe((scoped) => route(scoped))
		return detach
	}

	const attach = () => {
		connect()
		return disconnect
	}

	const openScope = async (
		conversationId: string,
		botId: string,
	): Promise<RuntimeScope> => {
		const opened = await store.openRuntimeSession(
			conversationId,
			botId,
			now(),
			runs.get(botId)?.runtimeSessionId ?? null,
			null,
		)
		const scope = {
			conversationId: opened.conversationId,
			botId: opened.botId,
			runtimeSessionId: opened.id,
			epoch: opened.seq,
		}
		foreignTurns.claim(scope)
		runs.set(botId, scope)
		return scope
	}

	const speak = async (held: Speaker) => {
		if (!conversation) {
			return
		}
		const conversationId = conversation.id
		const scope = await openScope(conversationId, held.botId)
		held.scope = scope
		await driver.startOrResumeSession(scope)
		const context = await store.boundedContext(
			conversationId,
			held.botId,
			scope.runtimeSessionId,
			held.promptId,
		)
		await driver.submitPrompt(scope, context, {
			turnId: held.turn.id,
			promptId: held.turn.promptId,
		})
	}

	const newSpeaker = (
		{ botId, promptId }: Summons,
		turn: OpenTurn,
	): Speaker => ({
		botId,
		promptId,
		scope: null,
		turn,
		openMessages: new Map(),
		settledMessages: new Set(),
		heldReply: null,
		written: new Map(),
		activities: [],
		pending: null,
		askedAt: 0,
		startedAt: now(),
		isDropped: false,
	})

	const openWave = (): Speaker[] => {
		const turn = activeTurn
		if (!turn || speakers.size > 0 || queue.waiting.length === 0) {
			return []
		}
		queue = openedWave(queue)
		const started = queue.wave.map((summons) => newSpeaker(summons, turn))
		for (const held of started) {
			speakers.set(held.botId, held)
		}
		sync()
		return started
	}

	const begin = async (held: Speaker) => {
		const seen = latestError
		try {
			await speak(held)
			forgetFailureSeen(seen)
		} catch (reason) {
			speakers.delete(held.botId)
			void shutdownSpeaker(held)
			noteSpeakerFailure(held.botId, toTransportError(reason))
		}
		sync()
	}

	const completeIdleTurn = () => {
		if (!activeTurn || speakers.size > 0 || queue.waiting.length > 0) {
			return
		}
		activeTurn = null
	}

	const drive = () => {
		const started = openWave()
		if (started.length === 0) {
			completeIdleTurn()
			return
		}
		void Promise.all(started.map(begin)).then(drive)
	}

	const storePrompt = (said: TranscriptMessage, summoned: Summons[]) =>
		store.sendUserMessage(
			{
				id: said.id,
				conversationId: said.conversationId,
				turnId: said.turnId,
				authorBotId: null,
				repliedToMessageId: said.repliedToMessageId,
				content: said.content,
				createdAt: said.createdAt,
			},
			summoned.map(({ botId }) => botId),
		)

	const messageAnsweredIn = (conversationId: string, messageId?: string) => {
		if (!messageId) {
			return null
		}
		const shown = selectMessages(transcript.getState(), conversationId)
		return shown.find((message) => message.id === messageId) ?? null
	}

	const sentMessage = ({
		turn,
		conversationId,
		content,
		answered,
	}: SentPrompt): TranscriptMessage => ({
		id: turn.promptId,
		conversationId,
		turnId: turn.id,
		seq: 0,
		role: "user",
		content,
		completion: "complete",
		createdAt: now(),
		authorBotId: null,
		authorAccountId: senderAccountId(),
		authorName: null,
		repliedToMessageId: answered?.id ?? null,
		runtimeSessionId: null,
	})

	const summonedBy = (
		said: TranscriptMessage,
		answered: TranscriptMessage | null,
	): Summons[] => {
		const present = presentBotIds()
		const { named } = addresseesIn(said.content, present)
		const author = answered?.authorBotId
		const addressed =
			author && present.includes(author)
				? [author, ...named.filter((botId) => botId !== author)]
				: named
		const lead = conversation ? leadOf(conversation) : undefined
		const answering = addressed.length > 0 ? addressed : lead ? [lead] : []
		return answering.map((botId) => ({ botId, promptId: said.id }))
	}

	const nameFrom = async (conversationId: string, text: string) => {
		const naming = await driver.namingFor(text).catch(() => null)
		if (naming?.title) {
			options.onNamed?.(conversationId, naming)
		}
	}

	const refuse = (said: TranscriptMessage, text: string) => {
		refused = {
			id: said.id,
			text,
			repliedToMessageId: said.repliedToMessageId,
		}
		sync()
	}

	const interruptRunningTurn = () => {
		for (const held of speakers.values()) {
			held.isDropped = true
		}
	}

	const send = async (text: string, repliedToMessageId?: string) => {
		const trimmed = text.trim()
		if (!conversation || trimmed.length === 0) {
			return
		}
		const conversationId = conversation.id
		const isNamingItself =
			isNameless(conversation) && current().messages.length === 0
		const content = toMentionTokens(trimmed, mentionBots())
		const answered = messageAnsweredIn(conversationId, repliedToMessageId)
		const turn: OpenTurn = { id: newId(), promptId: newId() }
		const said = sentMessage({ turn, conversationId, content, answered })

		if (!(await loadLatest())) {
			refuse(said, trimmed)
			return
		}
		if (conversation?.id !== conversationId) {
			return
		}

		const summoned = summonedBy(said, answered)
		try {
			await enqueue(() => storePrompt(said, summoned))
		} catch {
			refuse(said, trimmed)
			return
		}

		refused = null
		if (isNamingItself) {
			void nameFrom(conversationId, trimmed)
		}
		transcript.append(said)
		interruptRunningTurn()
		queue = reopenedFor(queue, summoned)
		activeTurn = turn
		sync()
		drive()
	}

	const sendAgain = (messageId: string) => {
		const held = refused
		return held?.id === messageId
			? send(held.text, held.repliedToMessageId ?? undefined)
			: Promise.resolve()
	}

	const rememberCause = (reported: ReportedRun) => {
		reportedCauses = new Map(reportedCauses).set(reported.turnId, reported)
	}

	const readCauses = async (conversationId: string) => {
		const reported = await readReportedCauses({
			read: readReportedRuns,
			conversationId,
			description: i18n.t("chat:transcript.cause.unavailable.description"),
		})
		if (reported) {
			reportedCauses = new Map([...reported, ...reportedCauses])
		}
		sync()
	}

	const seatingFor = async (conversationId: string): Promise<Seating> => {
		if (conversation?.id === conversationId) {
			return "held"
		}
		try {
			const seated = await readConversation(store, conversationId)
			if (!seated) {
				return "unknown"
			}
			await open(seated)
			return "held"
		} catch (reason) {
			noteFailure(toReadError(reason))
			return "unreadable"
		}
	}

	const openReportTurn = async (reported: TranscriptMessage) => {
		if (speakers.size > 0) {
			return true
		}
		const previous = activeTurn
		const turn: OpenTurn = { id: newId(), promptId: reported.id }
		try {
			await enqueue(() =>
				store.startTurn({
					id: turn.id,
					conversationId: reported.conversationId,
					startedAt: now(),
				}),
			)
		} catch (reason) {
			noteFailure(toReadError(reason))
			sync()
			return false
		}
		if (activeTurn === previous) {
			activeTurn = turn
		}
		return true
	}

	const relayReport = async (reported: TranscriptMessage) => {
		const author = reported.authorBotId
		if (!author) {
			return
		}
		const { named, unresolved } = addresseesIn(
			reported.content,
			presentBotIds(),
		)
		const summoned = [
			...mentionsHandedBy(author, reported.id, named),
			...(await seatedFromStore(
				mentionsHandedBy(author, reported.id, unresolved),
			)),
		]
		if (summoned.length === 0 || !(await openReportTurn(reported))) {
			return
		}
		handOver(summoned)
		sync()
		drive()
	}

	const reportRun = async (draft: RunReportDraft) => {
		const isSeated = (await seatingFor(draft.conversationId)) === "held"
		const text = isSeated
			? toMentionTokens(draft.text, mentionBots())
			: draft.text
		const reported = await enqueue(() =>
			writeReportTurn({ store, draft: { ...draft, text }, newId, now }),
		)
		rememberCause(causeOf(draft, reported.turnId))
		transcript.append(reported)
		if (isSeated) {
			await relayReport(reported)
		}
		return reported.turnId
	}

	const readableSeatingFor = async (conversationId: string) => {
		const seating = await seatingFor(conversationId)
		if (seating === "unreadable") {
			throw new Error(`the conversation ${conversationId} could not be read`)
		}
		return seating
	}

	const announcedReportOf = (
		scope: RuntimeScope,
		message: ChatMessage,
	): TranscriptMessage => ({
		id: message.id,
		conversationId: scope.conversationId,
		turnId: newId(),
		seq: 0,
		role: "assistant",
		content: message.text,
		completion: "complete",
		createdAt: message.timestamp,
		authorBotId: scope.botId,
		authorAccountId: null,
		authorName: null,
		repliedToMessageId: null,
		runtimeSessionId: scope.runtimeSessionId,
	})

	const relayRunReport = async (scope: RuntimeScope, message: ChatMessage) => {
		if ((await readableSeatingFor(scope.conversationId)) === "unknown") {
			return
		}
		const reported = announcedReportOf(scope, message)
		transcript.append(reported)
		await relayReport(reported)
	}

	const relaySpoken = async ({
		conversationId,
		authorBotId,
		text,
	}: CompanionSpoke) => {
		const seating = await readableSeatingFor(conversationId)

		if (seating === "unknown" || !presentBotIds().includes(authorBotId)) {
			return false
		}
		const spoken = await enqueue(() =>
			writeReportTurn({
				store,
				draft: {
					conversationId,
					botId: authorBotId,
					text: toMentionTokens(text, mentionBots()),
					runtimeSessionId: null,
				},
				newId,
				now,
			}),
		)
		transcript.append(spoken)
		await relayReport(spoken)
		return true
	}

	const recordAnswers = (
		{ conversationId, turnId }: AnswerPlace,
		request: QuestionRequest,
		answers: QuestionAnswers,
	) => {
		const content = answeredText(request, answers)
		if (content.length === 0) {
			return
		}
		const id = newId()
		const createdAt = now()
		const repliedToMessageId = questionMessageIdOf(request.id)
		write(
			() =>
				store.appendUserMessage({
					id,
					conversationId,
					turnId,
					authorBotId: null,
					repliedToMessageId,
					content,
					createdAt,
				}),
			() =>
				transcript.append({
					id,
					conversationId,
					turnId,
					role: "user",
					content,
					completion: "complete",
					createdAt,
					authorBotId: null,
					authorAccountId: senderAccountId(),
					authorName: null,
					repliedToMessageId,
					runtimeSessionId: null,
				}),
		)
	}

	const speakerAsked = (id: string) =>
		[...speakers.values()].find((held) => held.pending?.request.id === id)

	const answerForeign = async (
		scope: RuntimeScope,
		id: string,
		send: () => Promise<void>,
	) => {
		try {
			await send()
			foreignTurns.release(scope, id)
			return true
		} catch (reason) {
			noteSpeakerFailure(scope.botId, toTransportError(reason))
			return false
		} finally {
			sync()
		}
	}

	const answer = async (id: string, answers: QuestionAnswers) => {
		const foreign = foreignTurns.questionAsking(id)
		if (foreign) {
			const isAccepted = await answerForeign(foreign.scope, id, () =>
				driver.answerQuestion(foreign.scope, id, answers),
			)
			if (isAccepted) {
				recordAnswers(
					{
						conversationId: foreign.scope.conversationId,
						turnId: foreign.turnId,
					},
					foreign.request,
					answers,
				)
			}
			return
		}
		const held = speakerAsked(id)
		const pending = held?.pending
		if (!held?.scope || pending?.kind !== "question") {
			return
		}
		const conversationId = conversation?.id
		const isAnswerable =
			(await loadLatest()) && conversation?.id === conversationId
		if (!isAnswerable) {
			return
		}
		try {
			await driver.answerQuestion(held.scope, id, answers)
		} catch (reason) {
			noteSpeakerFailure(held.botId, toTransportError(reason))
			sync()
			return
		}
		const openId = conversation?.id
		if (openId) {
			recordAnswers(
				{ conversationId: openId, turnId: held.turn.id },
				pending.request,
				answers,
			)
		}
		releasePrompt(held, id)
	}

	const respond = async (id: string, decision: PermissionDecision) => {
		const foreign = foreignTurns.scopeAsking(id)
		if (foreign) {
			await answerForeign(foreign, id, () =>
				driver.respondToPermission(foreign, id, decision),
			)
			return
		}
		const held = speakerAsked(id)
		if (!held?.scope) {
			return
		}
		try {
			await driver.respondToPermission(held.scope, id, decision)
		} catch (reason) {
			noteSpeakerFailure(held.botId, toTransportError(reason))
			sync()
			return
		}
		releasePrompt(held, id)
	}

	const cancelSpeaker = async (held: Speaker) => {
		held.isDropped = true
		if (held.pending) {
			await respond(held.pending.request.id, "deny")
		}
		if (held.scope) {
			await driver.cancelTurn(held.scope).catch(() => undefined)
		}
	}

	const stopForeignTurn = async (scope: RuntimeScope) => {
		try {
			await driver.cancelTurn(scope)
		} catch (reason) {
			noteSpeakerFailure(scope.botId, toTransportError(reason))
			sync()
		}
	}

	const stopSpeaker = async (botId: string) => {
		const held = speakers.get(botId)
		if (!held) {
			return
		}
		await cancelSpeaker(held)
	}

	const stop = async () => {
		const running = [...speakers.values()]
		queue = reopenedFor(queue, [])
		sync()
		await Promise.all(running.map(cancelSpeaker))
		drive()
	}

	const readBack = async (conversationId: string) => {
		try {
			await enqueue(() => transcript.reopen(conversationId))
		} catch (reason) {
			noteFailure(toReadError(reason))
		}
		sync()
	}

	const open = async (next: StoredConversation) => {
		const isSameConversation = conversation?.id === next.id
		conversation = next
		rebuildForeignTurns(next)
		if (isSameConversation) {
			sync()
			await readBack(next.id)
			return
		}
		queue = emptyQueue
		activeTurn = null
		refused = null
		reportedCauses = NO_REPORTED_RUNS
		arrivedBotIds = []
		unresolvedMentions = NO_UNRESOLVED_MENTIONS
		forgetFailure()
		sync()
		void routePendingQuestions(next.id)
		await Promise.all([
			enqueue(() => transcript.load(next.id)).catch((reason) => {
				noteFailure(toReadError(reason))
			}),
			readCauses(next.id),
		])
		sync()
	}

	const follow = (isAtLiveEdge: boolean) => {
		if (conversation) {
			transcript.follow(conversation.id, isAtLiveEdge)
		}
	}

	const leave = () => {
		if (conversation) {
			transcript.leave(conversation.id)
		}
	}

	const dismissError = (id: string) => {
		if (latestError?.id !== id) {
			return
		}
		forgetFailure()
		sync()
	}

	const dismissUnresolvedMentions = () => {
		if (unresolvedMentions.length === 0) {
			return
		}
		unresolvedMentions = NO_UNRESOLVED_MENTIONS
		sync()
	}

	const loadOlder = async () => {
		const state = current()
		if (!conversation || !state.hasOlder || state.isLoadingOlder) {
			return
		}
		const conversationId = conversation.id
		settle({ ...state, isLoadingOlder: true })
		try {
			await enqueue(() => transcript.loadOlder(conversationId))
			forgetFailure()
		} catch (reason) {
			noteFailure(toReadError(reason))
		} finally {
			settle({ ...current(), isLoadingOlder: false, latestError })
		}
	}

	const loadNewer = async () => {
		const state = current()
		if (!conversation || !state.hasNewer || state.isLoadingNewer) {
			return
		}
		const conversationId = conversation.id
		settle({ ...state, isLoadingNewer: true })
		try {
			await enqueue(() => transcript.loadNewer(conversationId))
			forgetFailure()
		} catch (reason) {
			noteFailure(toReadError(reason))
		} finally {
			settle({ ...current(), isLoadingNewer: false, latestError })
		}
	}

	const loadLatest = async () => {
		if (!conversation || !current().hasNewer) {
			return true
		}
		const conversationId = conversation.id
		try {
			await enqueue(() => transcript.loadLatest(conversationId))
			return true
		} catch (reason) {
			noteFailure(toReadError(reason))
			settle({ ...current(), latestError })
			return false
		}
	}

	const landOn = (seq: number) => {
		const conversationId = conversation?.id
		if (!conversationId) {
			return Promise.resolve(NO_MESSAGES)
		}
		return enqueue(transcript.askLanding(conversationId, seq))
	}

	const pin = (messageId: string, blockIndex: number) => {
		const conversationId = conversation?.id
		return conversationId
			? enqueue(() =>
					store.pinMessage(conversationId, messageId, blockIndex, now()),
				)
			: Promise.resolve()
	}

	const unpin = (messageId: string, blockIndex: number) => {
		const conversationId = conversation?.id
		return conversationId
			? enqueue(() => store.unpinMessage(conversationId, messageId, blockIndex))
			: Promise.resolve()
	}

	const pins = () => {
		const conversationId = conversation?.id
		return conversationId
			? enqueue(() => store.pinnedMessages(conversationId))
			: Promise.resolve(NO_PINS)
	}

	const shutdownSpeaker = (held: Speaker) =>
		held.scope
			? driver.shutdown(held.scope).catch((reason) => {
					console.error(
						"conversation controller: agent_shutdown failed",
						reason,
					)
				})
			: Promise.resolve()

	const shutdown = async () => {
		await Promise.all([...speakers.values()].map(shutdownSpeaker))
		disconnect()
	}

	return {
		getState: current,
		subscribe: stateStore.subscribe,
		attach,
		open,
		loadOlder,
		loadNewer,
		loadLatest,
		landOn,
		follow,
		leave,
		send,
		sendAgain,
		reportRun,
		relayRunReport,
		relaySpoken,
		pin,
		unpin,
		pins,
		dismissError,
		dismissUnresolvedMentions,
		answer,
		respond,
		stop,
		shutdown,
	}
}
