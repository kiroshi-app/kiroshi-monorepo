import {
	type CompanionArrival,
	type TerminalCompletion,
	TRANSCRIPT_PAGE_SIZE,
	TRANSCRIPT_WINDOW_SIZE,
	type TranscriptCompletion,
	type TranscriptDraft,
	type TranscriptMessage,
	type TranscriptPage,
	type TranscriptWindow,
} from "./transcript-contract"

export type TranscriptDelta = {
	conversationId: string
	id: string
	text: string
}

export type TranscriptRevision = {
	conversationId: string
	id: string
	text: string
}

export type TranscriptSettlement = {
	conversationId: string
	id: string
	completion: TerminalCompletion
	settledText?: string
}

type TranscriptConversation = {
	messages: TranscriptMessage[]
	arrivals: CompanionArrival[]
	hasMore: boolean
	hasNewer: boolean
	hasAnswered: boolean
}

export type TranscriptState = {
	conversations: Record<string, TranscriptConversation>
}

export type TranscriptAction =
	| { type: "pageLoaded"; page: TranscriptPage }
	| { type: "firstPageFailed"; conversationId: string }
	| { type: "windowLanded"; window: TranscriptWindow }
	| { type: "latestLoaded"; page: TranscriptPage }
	| { type: "newerLoaded"; window: TranscriptWindow }
	| {
			type: "messageAppended"
			draft: TranscriptDraft
			isAtLiveEdge: boolean
	  }
	| { type: "arrivalAnnounced"; arrival: CompanionArrival }
	| { type: "messageStreamed"; delta: TranscriptDelta }
	| { type: "messageSettled"; settlement: TranscriptSettlement }
	| { type: "messageRevised"; revision: TranscriptRevision }
	| { type: "threadLeft"; conversationId: string }

export const initialTranscriptState: TranscriptState = { conversations: {} }

const NO_MESSAGES: TranscriptMessage[] = []

const NO_ARRIVALS: CompanionArrival[] = []

const EMPTY_CONVERSATION: TranscriptConversation = {
	messages: NO_MESSAGES,
	arrivals: NO_ARRIVALS,
	hasMore: false,
	hasNewer: false,
	hasAnswered: false,
}

const FORGOTTEN_CONVERSATION: TranscriptConversation = {
	messages: NO_MESSAGES,
	arrivals: NO_ARRIVALS,
	hasMore: true,
	hasNewer: false,
	hasAnswered: false,
}

const isAwayFromNewest = (held: TranscriptConversation): boolean =>
	held.hasNewer || (held.messages.length === 0 && held.hasMore)

const TERMINAL_RANK = 2

const COMPLETION_RANK: Record<TranscriptCompletion, number> = {
	pending: 0,
	streaming: 1,
	complete: TERMINAL_RANK,
	cancelled: TERMINAL_RANK,
	failed: TERMINAL_RANK,
	interrupted: TERMINAL_RANK,
}

export const isTerminalCompletion = (
	completion: TranscriptCompletion,
): boolean => COMPLETION_RANK[completion] === TERMINAL_RANK

export const selectMessages = (
	state: TranscriptState,
	conversationId: string,
): TranscriptMessage[] =>
	state.conversations[conversationId]?.messages ?? NO_MESSAGES

export const selectArrivals = (
	state: TranscriptState,
	conversationId: string,
): CompanionArrival[] =>
	state.conversations[conversationId]?.arrivals ?? NO_ARRIVALS

export const selectHasMore = (
	state: TranscriptState,
	conversationId: string,
): boolean => state.conversations[conversationId]?.hasMore ?? false

export const selectHasNewer = (
	state: TranscriptState,
	conversationId: string,
): boolean => state.conversations[conversationId]?.hasNewer ?? false

export const selectIsFirstLoadPending = (
	state: TranscriptState,
	conversationId: string,
): boolean => !state.conversations[conversationId]?.hasAnswered

export type LastWord = {
	text?: string
	at: number
	authorBotId?: string
}

export type ConversationPreviews = Record<string, LastWord | undefined>

export const lastWordIn = (
	messages: TranscriptMessage[],
): LastWord | undefined => {
	const settled = messages.findLast((message) =>
		isTerminalCompletion(message.completion),
	)
	if (!settled) {
		return undefined
	}
	return {
		text: settled.content.trim() || undefined,
		at: settled.createdAt,
		authorBotId: settled.authorBotId ?? undefined,
	}
}

const oldestSeq = (messages: TranscriptMessage[]): number | null =>
	messages[0]?.seq ?? null

export const selectOldestSeq = (
	state: TranscriptState,
	conversationId: string,
): number | null => oldestSeq(selectMessages(state, conversationId))

export const selectNewestSeq = (
	state: TranscriptState,
	conversationId: string,
): number | null => selectMessages(state, conversationId).at(-1)?.seq ?? null

const byPosition = (
	left: TranscriptMessage,
	right: TranscriptMessage,
): number => {
	if (left.seq !== right.seq) {
		return left.seq - right.seq
	}
	if (left.id === right.id) {
		return 0
	}
	return left.id < right.id ? -1 : 1
}

const byArrivalPosition = (
	left: CompanionArrival,
	right: CompanionArrival,
): number => {
	if (left.lastMessageSeq !== right.lastMessageSeq) {
		return left.lastMessageSeq - right.lastMessageSeq
	}
	if (left.createdAt !== right.createdAt) {
		return left.createdAt - right.createdAt
	}
	if (left.id === right.id) {
		return 0
	}
	return left.id < right.id ? -1 : 1
}

const orderedArrivals = (arrivals: CompanionArrival[]): CompanionArrival[] =>
	arrivals.length === 0 ? NO_ARRIVALS : [...arrivals].sort(byArrivalPosition)

const mergeArrivals = (
	current: CompanionArrival[],
	incoming: CompanionArrival[],
): CompanionArrival[] => {
	if (incoming.length === 0) {
		return current
	}
	const byId = new Map(current.map((arrival) => [arrival.id, arrival]))
	for (const arrival of incoming) {
		byId.set(arrival.id, arrival)
	}
	return orderedArrivals([...byId.values()])
}

const arrivalsFrom = (
	arrivals: CompanionArrival[],
	messages: TranscriptMessage[],
): CompanionArrival[] => {
	const oldest = oldestSeq(messages)
	if (oldest === null) {
		return arrivals
	}
	const kept = arrivals.filter(({ lastMessageSeq }) => lastMessageSeq >= oldest)
	return kept.length === arrivals.length ? arrivals : kept
}

const recoveredFromPort = (message: TranscriptMessage): TranscriptMessage =>
	message.completion === "streaming"
		? { ...message, completion: "interrupted" }
		: message

const longerContent = (
	local: TranscriptMessage,
	durable: TranscriptMessage,
): string =>
	local.content.length >= durable.content.length
		? local.content
		: durable.content

const reconciledFromEnding = (
	local: TranscriptMessage,
	durable: TranscriptMessage,
): TranscriptMessage => ({
	...durable,
	completion: local.completion,
	content:
		durable.completion === local.completion ? durable.content : local.content,
})

const reconciledFromUnfinished = (
	local: TranscriptMessage,
	durable: TranscriptMessage,
): TranscriptMessage => {
	if (isTerminalCompletion(durable.completion)) {
		return durable
	}
	const durableWins =
		COMPLETION_RANK[durable.completion] >= COMPLETION_RANK[local.completion]
	return {
		...durable,
		completion: durableWins ? durable.completion : local.completion,
		content: longerContent(local, durable),
	}
}

const reconciled = (
	local: TranscriptMessage,
	durable: TranscriptMessage,
): TranscriptMessage =>
	isTerminalCompletion(local.completion)
		? reconciledFromEnding(local, durable)
		: reconciledFromUnfinished(local, durable)

const mergePage = (
	current: TranscriptMessage[],
	incoming: TranscriptMessage[],
): TranscriptMessage[] => {
	const byId = new Map(current.map((message) => [message.id, message]))
	for (const durable of incoming) {
		const local = byId.get(durable.id)
		byId.set(
			durable.id,
			local ? reconciled(local, durable) : recoveredFromPort(durable),
		)
	}
	return [...byId.values()].sort(byPosition)
}

const nextHasMore = (
	current: TranscriptConversation,
	page: TranscriptPage,
	merged: TranscriptMessage[],
): boolean => {
	if (page.messages.length === 0) {
		return page.hasMore
	}
	const loadedOldest = oldestSeq(current.messages)
	const mergedOldest = oldestSeq(merged)
	if (loadedOldest === null || mergedOldest === null) {
		return page.hasMore
	}
	return mergedOldest < loadedOldest ? page.hasMore : current.hasMore
}

const withConversation = (
	state: TranscriptState,
	conversationId: string,
	conversation: TranscriptConversation,
): TranscriptState => ({
	conversations: { ...state.conversations, [conversationId]: conversation },
})

const applyPageLoaded = (
	state: TranscriptState,
	page: TranscriptPage,
): TranscriptState => {
	const current = state.conversations[page.conversationId] ?? EMPTY_CONVERSATION
	if (
		current.hasAnswered &&
		page.messages.length === 0 &&
		page.arrivals.length === 0 &&
		page.hasMore === current.hasMore
	) {
		return state
	}
	const messages = mergePage(current.messages, page.messages)
	return withConversation(state, page.conversationId, {
		...current,
		messages,
		arrivals: mergeArrivals(current.arrivals, page.arrivals),
		hasMore: nextHasMore(current, page, messages),
		hasAnswered: true,
	})
}

const applyFirstPageFailed = (
	state: TranscriptState,
	conversationId: string,
): TranscriptState => {
	const current = state.conversations[conversationId] ?? EMPTY_CONVERSATION
	if (current.hasAnswered) {
		return state
	}
	return withConversation(state, conversationId, {
		...current,
		hasAnswered: true,
	})
}

const applyWindowLanded = (
	state: TranscriptState,
	window: TranscriptWindow,
): TranscriptState =>
	withConversation(state, window.conversationId, {
		messages: window.messages.map(recoveredFromPort),
		arrivals: orderedArrivals(window.arrivals),
		hasMore: window.hasOlder,
		hasNewer: window.hasNewer,
		hasAnswered: true,
	})

const applyLatestLoaded = (
	state: TranscriptState,
	page: TranscriptPage,
): TranscriptState =>
	withConversation(state, page.conversationId, {
		messages: page.messages.map(recoveredFromPort),
		arrivals: orderedArrivals(page.arrivals),
		hasMore: page.hasMore,
		hasNewer: false,
		hasAnswered: true,
	})

const applyNewerLoaded = (
	state: TranscriptState,
	window: TranscriptWindow,
): TranscriptState => {
	const current =
		state.conversations[window.conversationId] ?? EMPTY_CONVERSATION
	return withConversation(state, window.conversationId, {
		...current,
		messages: mergePage(current.messages, window.messages),
		arrivals: mergeArrivals(current.arrivals, window.arrivals),
		hasNewer: window.hasNewer,
	})
}

const droppedCount = (
	messages: TranscriptMessage[],
	kept: number,
	isHeld: (message: TranscriptMessage) => boolean,
): number => {
	const overflow = messages.length - kept
	if (overflow <= 0) {
		return 0
	}
	const held = messages.findIndex(isHeld)
	return held === -1 ? overflow : Math.min(overflow, held)
}

const isUnfinished = (message: TranscriptMessage): boolean =>
	!isTerminalCompletion(message.completion)

const applyMessageAppended = (
	state: TranscriptState,
	draft: TranscriptDraft,
	isAtLiveEdge: boolean,
): TranscriptState => {
	const current =
		state.conversations[draft.conversationId] ?? EMPTY_CONVERSATION
	if (isAwayFromNewest(current)) {
		return state
	}
	if (current.messages.some((message) => message.id === draft.id)) {
		return state
	}
	const seq = (current.messages.at(-1)?.seq ?? 0) + 1
	const grown = [...current.messages, { ...draft, seq }]
	const isRunning = (message: TranscriptMessage) =>
		message.turnId === draft.turnId || isUnfinished(message)
	const dropped = isAtLiveEdge
		? droppedCount(grown, TRANSCRIPT_WINDOW_SIZE, isRunning)
		: 0
	const messages = grown.slice(dropped)
	return withConversation(state, draft.conversationId, {
		...current,
		messages,
		arrivals:
			dropped > 0 ? arrivalsFrom(current.arrivals, messages) : current.arrivals,
		hasMore: current.hasMore || dropped > 0,
	})
}

const applyThreadLeft = (
	state: TranscriptState,
	conversationId: string,
): TranscriptState => {
	const current = state.conversations[conversationId]
	if (!current) {
		return state
	}
	if (current.hasNewer) {
		return withConversation(state, conversationId, FORGOTTEN_CONVERSATION)
	}
	const dropped = droppedCount(
		current.messages,
		TRANSCRIPT_PAGE_SIZE,
		isUnfinished,
	)
	if (dropped === 0) {
		return state
	}
	const messages = current.messages.slice(dropped)
	return withConversation(state, conversationId, {
		...current,
		messages,
		arrivals: arrivalsFrom(current.arrivals, messages),
		hasMore: true,
	})
}

const applyArrivalAnnounced = (
	state: TranscriptState,
	arrival: CompanionArrival,
): TranscriptState => {
	const current =
		state.conversations[arrival.conversationId] ?? EMPTY_CONVERSATION
	if (isAwayFromNewest(current)) {
		return state
	}
	if (current.arrivals.some(({ id }) => id === arrival.id)) {
		return state
	}
	return withConversation(state, arrival.conversationId, {
		...current,
		arrivals: mergeArrivals(current.arrivals, [arrival]),
	})
}

const applyMessageStreamed = (
	state: TranscriptState,
	delta: TranscriptDelta,
): TranscriptState => {
	const current = state.conversations[delta.conversationId]
	if (!current) {
		return state
	}
	const index = current.messages.findIndex((message) => message.id === delta.id)
	if (index === -1) {
		return state
	}
	const target = current.messages[index]
	if (target.completion !== "streaming") {
		return state
	}
	return withConversation(state, delta.conversationId, {
		...current,
		messages: current.messages.with(index, {
			...target,
			content: target.content + delta.text,
		}),
	})
}

const applyMessageSettled = (
	state: TranscriptState,
	settlement: TranscriptSettlement,
): TranscriptState => {
	if (!isTerminalCompletion(settlement.completion)) {
		return state
	}
	const current = state.conversations[settlement.conversationId]
	if (!current) {
		return state
	}
	const index = current.messages.findIndex(
		(message) => message.id === settlement.id,
	)
	if (index === -1) {
		return state
	}
	const target = current.messages[index]
	if (isTerminalCompletion(target.completion)) {
		return state
	}
	return withConversation(state, settlement.conversationId, {
		...current,
		messages: current.messages.with(index, {
			...target,
			completion: settlement.completion,
			content: settlement.settledText ?? target.content,
		}),
	})
}

const applyMessageRevised = (
	state: TranscriptState,
	revision: TranscriptRevision,
): TranscriptState => {
	const current = state.conversations[revision.conversationId]
	if (!current) {
		return state
	}
	const index = current.messages.findIndex(
		(message) => message.id === revision.id,
	)
	if (index === -1) {
		return state
	}
	const target = current.messages[index]
	if (
		!isTerminalCompletion(target.completion) ||
		target.content === revision.text
	) {
		return state
	}
	return withConversation(state, revision.conversationId, {
		...current,
		messages: current.messages.with(index, {
			...target,
			content: revision.text,
		}),
	})
}

export const transcriptReducer = (
	state: TranscriptState,
	action: TranscriptAction,
): TranscriptState => {
	switch (action.type) {
		case "pageLoaded":
			return applyPageLoaded(state, action.page)
		case "firstPageFailed":
			return applyFirstPageFailed(state, action.conversationId)
		case "windowLanded":
			return applyWindowLanded(state, action.window)
		case "latestLoaded":
			return applyLatestLoaded(state, action.page)
		case "newerLoaded":
			return applyNewerLoaded(state, action.window)
		case "messageAppended":
			return applyMessageAppended(state, action.draft, action.isAtLiveEdge)
		case "arrivalAnnounced":
			return applyArrivalAnnounced(state, action.arrival)
		case "messageStreamed":
			return applyMessageStreamed(state, action.delta)
		case "messageSettled":
			return applyMessageSettled(state, action.settlement)
		case "messageRevised":
			return applyMessageRevised(state, action.revision)
		case "threadLeft":
			return applyThreadLeft(state, action.conversationId)
	}
}
