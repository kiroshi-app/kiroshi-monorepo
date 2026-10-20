import { isPostedRequest } from "./posted-question"
import { withActivity } from "./working-kind"

import { describeFailure } from "../failure-report"
import type {
	ActivityEvent,
	AgentCommand,
	AgentEvent,
	ConnectionState,
	MessageCompletion,
	PermissionDecision,
	PermissionRequest,
	QuestionRequest,
	RuntimeScope,
	TransportError,
	TurnEnded,
	TurnOutcome,
	TurnState,
} from "../agent/contract"
import type { ForeignSpeaker } from "../conversations/foreign-turns"
import type { TranscriptMessage } from "../conversations/transcript-contract"
import { isHostOffline } from "../host/host-offline"
import {
	NO_REPORTED_RUNS,
	type ReportedRunsByTurnId,
} from "../routines/routine-contract"

export type ChatError = {
	id: string
	error: TransportError
	botId?: string
}

export type OutboxEntry = {
	id: string
	text: string
	repliedToMessageId: string | null
}

export type ChatState = {
	runtime: RuntimeScope | null
	connection: ConnectionState
	turn: TurnState
	turnStartedAt: number | null
	sessionOpen: boolean
	sessionId: string | null
	commands: AgentCommand[]
	binaryVersion: string | null
	conversationId: string | null
	messages: TranscriptMessage[]
	hasOlder: boolean
	loadingOlder: boolean
	hasNewer: boolean
	loadingNewer: boolean
	isFirstLoadPending: boolean
	rejectedPromptId: string | null
	outbox: OutboxEntry[]
	activities: ActivityEvent[]
	permission: PermissionRequest | null
	question: QuestionRequest | null
	errors: ChatError[]
	errorCount: number
	reportedCauses: ReportedRunsByTurnId
	foreignTurn: ForeignSpeaker | null
}

export type ChatAction =
	| { type: "driverEvent"; scope: RuntimeScope | null; event: AgentEvent }
	| { type: "sessionReset"; runtime: RuntimeScope; sessionId: string | null }
	| { type: "sessionOpened" }
	| { type: "commandsRecalled"; commands: AgentCommand[] }
	| { type: "conversationOpened"; conversationId: string }
	| {
			type: "transcriptChanged"
			messages: TranscriptMessage[]
			hasOlder: boolean
			hasNewer: boolean
			isFirstLoadPending: boolean
	  }
	| { type: "olderLoading"; loading: boolean }
	| { type: "newerLoading"; loading: boolean }
	| { type: "promptSubmitted" }
	| { type: "promptHeld"; entry: OutboxEntry }
	| { type: "promptReturned"; entry: OutboxEntry }
	| { type: "outboxEntryRemoved"; id: string }
	| { type: "outboxCleared" }
	| { type: "promptRejected"; id: string | null; error: TransportError }
	| { type: "promptRetried"; id: string }
	| { type: "stopRejected"; error: TransportError }
	| { type: "errorDismissed"; id: string }
	| { type: "binaryVersion"; version: string | null }
	| { type: "questionPosted"; request: QuestionRequest }
	| { type: "questionWithdrawn"; id: string }
	| { type: "causesChanged"; causes: ReportedRunsByTurnId }
	| { type: "foreignTurnChanged"; speaker: ForeignSpeaker | null }

export const initialChatState: ChatState = {
	runtime: null,
	connection: "checking",
	turn: "idle",
	turnStartedAt: null,
	sessionOpen: false,
	sessionId: null,
	commands: [],
	binaryVersion: null,
	conversationId: null,
	messages: [],
	hasOlder: false,
	loadingOlder: false,
	hasNewer: false,
	loadingNewer: false,
	isFirstLoadPending: false,
	rejectedPromptId: null,
	outbox: [],
	activities: [],
	permission: null,
	question: null,
	errors: [],
	errorCount: 0,
	reportedCauses: NO_REPORTED_RUNS,
	foreignTurn: null,
}

const TRANSPORT_KINDS: Record<TransportError["kind"], true> = {
	binaryNotFound: true,
	notAuthenticated: true,
	authCheckFailed: true,
	spawnFailed: true,
	startupTimeout: true,
	crashed: true,
	resumeFailed: true,
	invalidFrame: true,
	settingsRejected: true,
	serverEnvRejected: true,
	notStarted: true,
	turnAlreadyRunning: true,
	transitionInProgress: true,
	noActiveTurn: true,
	staleRuntimeSession: true,
	unknownPermission: true,
	writeFailed: true,
	runLapsed: true,
	readFailed: true,
	unknownFailure: true,
	hostOffline: true,
}

const fieldIn = (reason: unknown, field: string): unknown =>
	typeof reason === "object" && reason !== null && field in reason
		? (reason as Record<string, unknown>)[field]
		: undefined

const kindIn = (reason: unknown): string | null => {
	const kind = fieldIn(reason, "kind")
	return kind === undefined ? null : String(kind)
}

const isTransportError = (reason: unknown): reason is TransportError => {
	const kind = kindIn(reason)
	return kind !== null && Object.hasOwn(TRANSPORT_KINDS, kind)
}

const detailOf = (reason: unknown): string =>
	kindIn(reason) ?? describeFailure(reason)

export const toTransportError = (reason: unknown): TransportError =>
	isTransportError(reason)
		? reason
		: { kind: "unknownFailure", detail: detailOf(reason) }

const failureOf = (reason: unknown): string | null => {
	const failure = fieldIn(reason, "failure")
	const kind = kindIn(failure)
	if (kind === null) {
		return null
	}
	const detail = fieldIn(failure, "detail")
	return typeof detail === "string" ? `${kind}: ${detail}` : kind
}

const refusalOf = (reason: unknown): string => {
	const failure = failureOf(reason)
	const outer = detailOf(reason)
	return failure === null ? outer : `${outer}, ${failure}`
}

const unlessHostOffline =
	(toError: (reason: unknown) => TransportError) =>
	(reason: unknown): TransportError =>
		isHostOffline(reason) ? reason : toError(reason)

export const toStoreError = unlessHostOffline((reason) => ({
	kind: "writeFailed",
	detail: `the transcript store refused it (${refusalOf(reason)})`,
}))

export const toAnswerError = unlessHostOffline((reason) => ({
	kind: "unknownFailure",
	detail: refusalOf(reason),
}))

export const toReadError = unlessHostOffline((reason) => ({
	kind: "readFailed",
	detail: detailOf(reason),
}))

export const chatErrorOf = (
	error: TransportError,
	count: number,
): ChatError => ({
	id: `${error.kind}-${count}`,
	error,
})

const MAX_ERRORS = 20

const TURN_TRANSITIONS: Record<TurnState, TurnState[]> = {
	idle: ["submitting"],
	submitting: ["running", "stopping", "idle", "failed"],
	running: ["stopping", "idle", "failed"],
	stopping: ["idle", "failed"],
	failed: ["submitting", "idle"],
}

export function isTurnBusy(turn: TurnState): boolean {
	return turn === "submitting" || turn === "running" || turn === "stopping"
}

export function canStopTurn(turn: TurnState): boolean {
	return turn === "submitting" || turn === "running"
}

export function isSessionReady(state: ChatState): boolean {
	return state.connection === "ready" && state.sessionOpen
}

export function isSameRuntimeScope(
	left: RuntimeScope | null,
	right: RuntimeScope | null,
): boolean {
	if (left === null || right === null) {
		return left === right
	}
	return (
		left.runtimeSessionId === right.runtimeSessionId &&
		left.epoch === right.epoch &&
		left.conversationId === right.conversationId &&
		left.botId === right.botId
	)
}

export function isSameCommandList(
	left: AgentCommand[],
	right: AgentCommand[],
): boolean {
	return (
		left.length === right.length &&
		left.every(
			(command, index) =>
				command.name === right[index].name &&
				command.description === right[index].description,
		)
	)
}

export function completionForOutcome(outcome: TurnOutcome): MessageCompletion {
	switch (outcome) {
		case "completed":
			return "complete"
		case "cancelled":
			return "cancelled"
		case "failed":
			return "failed"
	}
}

export function turnForOutcome(outcome: TurnOutcome): TurnState {
	return outcome === "failed" ? "failed" : "idle"
}

function setTurn(state: ChatState, next: TurnState): ChatState {
	if (state.turn === next) {
		return state
	}
	if (!TURN_TRANSITIONS[state.turn].includes(next)) {
		return state
	}
	return { ...state, turn: next }
}

function pushError(state: ChatState, error: TransportError): ChatState {
	const entry = chatErrorOf(error, state.errorCount)
	return {
		...state,
		errorCount: state.errorCount + 1,
		errors: [...state.errors, entry].slice(-MAX_ERRORS),
	}
}

function applyErrorDismissed(state: ChatState, id: string): ChatState {
	if (state.errors.at(-1)?.id !== id) {
		return state
	}
	return { ...state, errors: [] }
}

function applyActivity(state: ChatState, activity: ActivityEvent): ChatState {
	const activities = withActivity(state.activities, activity)
	return activities === state.activities ? state : { ...state, activities }
}

function takesRequest(
	state: ChatState,
	held: { id: string } | null,
	id: string,
): boolean {
	return canStopTurn(state.turn) && (held === null || held.id === id)
}

function applyPermissionRequested(
	state: ChatState,
	request: PermissionRequest,
): ChatState {
	return takesRequest(state, state.permission, request.id)
		? { ...state, permission: request }
		: state
}

function applyQuestionRequested(
	state: ChatState,
	request: QuestionRequest,
): ChatState {
	return takesRequest(state, state.question, request.id)
		? { ...state, question: request }
		: state
}

const postedQuestionOf = (question: QuestionRequest | null) =>
	question && isPostedRequest(question) ? question : null

function applyQuestionWithdrawn(state: ChatState, id: string): ChatState {
	return state.question?.id === id ? { ...state, question: null } : state
}

function clearRequest(state: ChatState, id: string): ChatState {
	if (state.permission?.id === id) {
		return { ...state, permission: null }
	}
	if (state.question?.id === id) {
		return { ...state, question: null }
	}
	return state
}

function applyPermissionResolved(
	state: ChatState,
	id: string,
	decision: PermissionDecision,
): ChatState {
	const cleared = clearRequest(state, id)
	const index = cleared.activities.findIndex((activity) => activity.id === id)
	if (index === -1) {
		return cleared
	}
	const target = cleared.activities[index]
	if (target.status !== "pending") {
		return cleared
	}
	return {
		...cleared,
		activities: cleared.activities.with(index, {
			...target,
			status: decision === "allowOnce" ? "succeeded" : "failed",
		}),
	}
}

function applyTurnEnded(state: ChatState, ended: TurnEnded): ChatState {
	if (state.turn === "idle" || state.turn === "failed") {
		return state
	}
	const next = setTurn(state, turnForOutcome(ended.outcome))
	return {
		...next,
		sessionId: ended.sessionId ?? state.sessionId,
		permission: null,
		question: postedQuestionOf(state.question),
	}
}

function applyFailure(state: ChatState, error: TransportError): ChatState {
	const next = pushError(state, error)
	return error.kind === "resumeFailed" && error.forgotSessionId
		? { ...next, sessionId: null }
		: next
}

function applyEvent(state: ChatState, event: AgentEvent): ChatState {
	switch (event.type) {
		case "connectionChanged":
			return state.connection === event.state
				? state
				: { ...state, connection: event.state }
		case "turnChanged":
			return setTurn(state, event.state)
		case "sessionReady":
			return { ...state, sessionId: event.sessionId }
		case "commandsListed":
			return applyCommands(state, event.commands)
		case "messageStarted":
		case "messageDelta":
		case "messageCompleted":
			return state
		case "activity":
			return applyActivity(state, event.activity)
		case "permissionRequested":
			return applyPermissionRequested(state, event.request)
		case "questionRequested":
			return applyQuestionRequested(state, event.request)
		case "permissionResolved":
			return applyPermissionResolved(state, event.id, event.decision)
		case "turnEnded":
			return applyTurnEnded(state, event.ended)
		case "botEvolved":
		case "botEvolutionFailed":
			return state
		case "failed":
			return applyFailure(state, event.error)
	}
}

function applyCommands(state: ChatState, commands: AgentCommand[]): ChatState {
	return isSameCommandList(state.commands, commands)
		? state
		: { ...state, commands }
}

function applySessionReset(
	state: ChatState,
	runtime: RuntimeScope,
	sessionId: string | null,
): ChatState {
	return {
		...state,
		runtime,
		turn: "idle",
		sessionOpen: false,
		sessionId,
		permission: null,
		question: postedQuestionOf(state.question),
		activities: [],
	}
}

type TranscriptChange = Extract<ChatAction, { type: "transcriptChanged" }>

function applyTranscriptChanged(
	state: ChatState,
	{ messages, hasOlder, hasNewer, isFirstLoadPending }: TranscriptChange,
): ChatState {
	if (
		state.messages === messages &&
		state.hasOlder === hasOlder &&
		state.hasNewer === hasNewer &&
		state.isFirstLoadPending === isFirstLoadPending
	) {
		return state
	}
	return { ...state, messages, hasOlder, hasNewer, isFirstLoadPending }
}

function applyPromptRejected(
	state: ChatState,
	id: string | null,
	error: TransportError,
): ChatState {
	const next = pushError(state, error)
	return {
		...next,
		rejectedPromptId: id,
		turn: next.turn === "submitting" ? "failed" : next.turn,
	}
}

function applyPromptRetried(state: ChatState, id: string): ChatState {
	if (state.rejectedPromptId !== id) {
		return state
	}
	return setTurn({ ...state, rejectedPromptId: null }, "submitting")
}

function applyOutboxEntryRemoved(state: ChatState, id: string): ChatState {
	const outbox = state.outbox.filter((entry) => entry.id !== id)
	return outbox.length === state.outbox.length ? state : { ...state, outbox }
}

function applyStopRejected(state: ChatState, error: TransportError): ChatState {
	const next = pushError(state, error)
	return next.turn === "stopping" ? { ...next, turn: "failed" } : next
}

const turnInstantOf = (
	state: ChatState,
	next: ChatState,
	at: number,
): number | null => {
	if (!isTurnBusy(next.turn)) {
		return null
	}
	return isTurnBusy(state.turn) ? state.turnStartedAt : at
}

const withTurnInstant = (
	state: ChatState,
	next: ChatState,
	at: number,
): ChatState => {
	const turnStartedAt = turnInstantOf(state, next, at)
	return turnStartedAt === next.turnStartedAt
		? next
		: { ...next, turnStartedAt }
}

export function chatReducer(
	state: ChatState,
	action: ChatAction,
	at: number,
): ChatState {
	return withTurnInstant(state, reducedChat(state, action), at)
}

function reducedChat(state: ChatState, action: ChatAction): ChatState {
	switch (action.type) {
		case "driverEvent":
			return isSameRuntimeScope(action.scope, state.runtime)
				? applyEvent(state, action.event)
				: state
		case "sessionOpened":
			return state.sessionOpen ? state : { ...state, sessionOpen: true }
		case "commandsRecalled":
			return applyCommands(state, action.commands)
		case "sessionReset":
			return applySessionReset(state, action.runtime, action.sessionId)
		case "conversationOpened":
			return state.conversationId === action.conversationId
				? state
				: { ...state, conversationId: action.conversationId, foreignTurn: null }
		case "causesChanged":
			return { ...state, reportedCauses: action.causes }
		case "foreignTurnChanged":
			return state.foreignTurn === action.speaker
				? state
				: { ...state, foreignTurn: action.speaker }
		case "transcriptChanged":
			return applyTranscriptChanged(state, action)
		case "olderLoading":
			return state.loadingOlder === action.loading
				? state
				: { ...state, loadingOlder: action.loading }
		case "newerLoading":
			return state.loadingNewer === action.loading
				? state
				: { ...state, loadingNewer: action.loading }
		case "promptSubmitted":
			return setTurn({ ...state, rejectedPromptId: null }, "submitting")
		case "promptHeld":
			return { ...state, outbox: [...state.outbox, action.entry] }
		case "promptReturned":
			return { ...state, outbox: [action.entry, ...state.outbox] }
		case "outboxEntryRemoved":
			return applyOutboxEntryRemoved(state, action.id)
		case "outboxCleared":
			return state.outbox.length === 0 ? state : { ...state, outbox: [] }
		case "promptRejected":
			return applyPromptRejected(state, action.id, action.error)
		case "promptRetried":
			return applyPromptRetried(state, action.id)
		case "stopRejected":
			return applyStopRejected(state, action.error)
		case "errorDismissed":
			return applyErrorDismissed(state, action.id)
		case "binaryVersion":
			return { ...state, binaryVersion: action.version }
		case "questionPosted":
			return { ...state, question: action.request }
		case "questionWithdrawn":
			return applyQuestionWithdrawn(state, action.id)
	}
}
