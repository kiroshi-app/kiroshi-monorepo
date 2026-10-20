import type { ActivityIndicatorKind } from "@workspace/ui/components/activity-indicator"
import type { ChatEmptyStateStatus } from "@workspace/ui/components/chat-empty-state"
import type { TurnState } from "@workspace/ui/components/turn"
import type { ChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { type ChatState, isTurnBusy } from "./chat-state"
import { toPublishedBlocks } from "./markdown-blocks"
import { messageWithAttachments } from "./message-attachments"
import type { MessageAuthorship } from "./thread-authorship"
import { type WorkingState, workingFor } from "./working-kind"

import type { ConnectionState, TransportError } from "../agent/contract"
import type { MessageReference } from "../conversations/store-contract"
import type {
	TranscriptCompletion,
	TranscriptMessage,
	TranscriptRole,
} from "../conversations/transcript-contract"
import { isTerminalCompletion } from "../conversations/transcript-state"
import {
	NO_REPORTED_RUNS,
	type ReportedRunsByTurnId,
} from "../routines/routine-contract"

export type TranscriptRow = MessageAuthorship & {
	messageId: string
	turnId: string
	blockIndex: number
	quotedMessageId: string | null
	authorBotId: string | null
	role: TranscriptRole
	text: string
	timestamp: number
	completion: TurnState
}

const TURN_STATE: Record<TranscriptCompletion, TurnState> = {
	pending: "streaming",
	streaming: "streaming",
	complete: "complete",
	cancelled: "cancelled",
	failed: "failed",
	interrupted: "cancelled",
}

const SESSION_ENDING: Record<TransportError["kind"], boolean> = {
	binaryNotFound: true,
	notAuthenticated: true,
	authCheckFailed: true,
	spawnFailed: true,
	startupTimeout: true,
	crashed: true,
	notStarted: true,
	resumeFailed: false,
	invalidFrame: false,
	settingsRejected: false,
	serverEnvRejected: false,
	turnAlreadyRunning: false,
	transitionInProgress: false,
	noActiveTurn: false,
	staleRuntimeSession: false,
	unknownPermission: false,
	writeFailed: false,
	readFailed: false,
	unknownFailure: false,
	hostOffline: false,
}

const RUN_GAP_MS = 5 * 60_000

function toRow(
	message: TranscriptMessage,
	fields: Pick<TranscriptRow, "text" | "completion"> & {
		blockIndex?: number
	},
): TranscriptRow {
	const { blockIndex = 0, ...rest } = fields
	return {
		messageId: message.id,
		turnId: message.turnId,
		blockIndex,
		quotedMessageId:
			message.role === "user" ? message.repliedToMessageId : null,
		authorBotId: message.authorBotId,
		authorAccountId: message.authorAccountId,
		authorName: message.authorName,
		writtenFrom: message.writtenFrom,
		role: message.role,
		timestamp: message.createdAt,
		...rest,
	}
}

function assistantRows(message: TranscriptMessage): TranscriptRow[] {
	const unfinished = !isTerminalCompletion(message.completion)
	const ending = TURN_STATE[message.completion]
	const blocks = toPublishedBlocks(message.content, unfinished)

	if (blocks.length === 0) {
		return ending === "failed"
			? [toRow(message, { text: "", completion: ending })]
			: []
	}

	return blocks.map((text, blockIndex) => {
		const closes = blockIndex === blocks.length - 1 && !unfinished
		return toRow(message, {
			blockIndex,
			text,
			completion: closes ? ending : "complete",
		})
	})
}

const rowsByMessage = new WeakMap<TranscriptMessage, TranscriptRow[]>()

export function toTranscriptRows(
	messages: TranscriptMessage[],
): TranscriptRow[] {
	return messages.flatMap((message) => {
		const cached = rowsByMessage.get(message)
		if (cached) {
			return cached
		}
		const rows =
			message.role === "user"
				? [
						toRow(message, {
							text: message.content,
							completion: TURN_STATE[message.completion],
						}),
					]
				: assistantRows(message)
		rowsByMessage.set(message, rows)
		return rows
	})
}

const isPartedByCause = (
	previous: TranscriptRow,
	row: TranscriptRow,
	causes: ReportedRunsByTurnId,
) =>
	previous.turnId !== row.turnId &&
	(causes.has(previous.turnId) || causes.has(row.turnId))

const localDayOf = (timestamp: number) => new Date(timestamp).toDateString()

const isSameLocalDay = (earlier: number, later: number) =>
	localDayOf(earlier) === localDayOf(later)

export function toRuns(
	rows: TranscriptRow[],
	causes: ReportedRunsByTurnId = NO_REPORTED_RUNS,
): TranscriptRow[][] {
	const runs: TranscriptRow[][] = []
	for (const row of rows) {
		const current = runs.at(-1)
		const previous = current?.at(-1)
		if (
			current &&
			previous &&
			previous.role === row.role &&
			previous.authorBotId === row.authorBotId &&
			previous.authorAccountId === row.authorAccountId &&
			row.timestamp - previous.timestamp <= RUN_GAP_MS &&
			isSameLocalDay(previous.timestamp, row.timestamp) &&
			!isPartedByCause(previous, row, causes)
		) {
			current.push(row)
		} else {
			runs.push([row])
		}
	}
	return runs
}

export const opensNewDay = (
	runs: TranscriptRow[][],
	runIndex: number,
): boolean => {
	const closingBefore = runs[runIndex - 1]?.at(-1)
	const opening = runs[runIndex]?.[0]
	if (!closingBefore || !opening) {
		return false
	}
	return !isSameLocalDay(closingBefore.timestamp, opening.timestamp)
}

export type ReplyTarget = MessageAuthorship & {
	messageId: string
	role: TranscriptRole
	excerpt: string
	authorBotId: string | null
}

const targetsByMessage = new WeakMap<TranscriptMessage, ReplyTarget>()

function replyTargetOf(message: TranscriptMessage): ReplyTarget {
	const held = targetsByMessage.get(message)
	if (held) {
		return held
	}
	const target: ReplyTarget = {
		messageId: message.id,
		role: message.role,
		excerpt: messageWithAttachments(message.content).text.trim(),
		authorBotId: message.authorBotId,
		authorAccountId: message.authorAccountId,
		authorName: message.authorName,
		writtenFrom: message.writtenFrom,
	}
	targetsByMessage.set(message, target)
	return target
}

export function replyTargetOfReference(
	reference: MessageReference,
): ReplyTarget {
	return {
		messageId: reference.messageId,
		role: reference.role,
		excerpt: reference.excerpt,
		authorBotId: null,
		authorAccountId: null,
		authorName: null,
	}
}

export function quotedMessageIdsIn(messages: TranscriptMessage[]): string[] {
	const ids = new Set<string>()
	for (const message of messages) {
		if (message.role === "user" && message.repliedToMessageId) {
			ids.add(message.repliedToMessageId)
		}
	}
	return [...ids]
}

export function quotedTargetsIn(
	messages: TranscriptMessage[],
	wanted: string[],
): Map<string, ReplyTarget> {
	const asked = new Set(wanted)
	const found = new Map<string, ReplyTarget>()
	for (const message of messages) {
		if (asked.has(message.id)) {
			found.set(message.id, replyTargetOf(message))
		}
	}
	return found
}

export const bubbleIdOf = (messageId: string, blockIndex: number): string =>
	blockIndex === 0 ? messageId : `${messageId}#${blockIndex}`

export function bubbleOf(
	message: TranscriptMessage,
	blockIndex: number,
): TranscriptRow | undefined {
	const bubbles = toTranscriptRows([message])
	return bubbles[blockIndex] ?? bubbles[0]
}

const foreignWorkFor = ({ foreignTurn }: ChatState): WorkingState | null =>
	foreignTurn
		? {
				...workingFor(foreignTurn.activities, foreignTurn.hasWritten),
				startedAt: foreignTurn.startedAt,
			}
		: null

export function workingStateFor(state: ChatState): WorkingState | null {
	if (!isTurnBusy(state.turn)) {
		return foreignWorkFor(state)
	}
	if (state.question) {
		return { kind: "waiting", label: state.question.questions[0]?.question }
	}
	if (state.permission) {
		return { kind: "waiting", label: state.permission.title }
	}

	const latest = state.messages.at(-1)
	const isWriting = latest?.role === "assistant" && latest.content.length > 0
	const working = workingFor(state.activities, isWriting)
	return state.turnStartedAt === null
		? working
		: { ...working, startedAt: state.turnStartedAt }
}

export type SidebarActivity = {
	isWorking: boolean
	kind?: ActivityIndicatorKind
}

export function sidebarActivityFor(state: ChatState): SidebarActivity {
	const working = workingStateFor(state)
	if (!working) {
		return { isWorking: false }
	}
	return { isWorking: true, kind: working.kind }
}

export function isSignedOut(error: TransportError): boolean {
	return error.kind === "notAuthenticated"
}

export function emptyStateStatusFor(
	connection: ConnectionState,
	latestError: TransportError | undefined,
): ChatEmptyStateStatus | null {
	if (connection === "ready") {
		return "ready"
	}
	if (latestError && isSignedOut(latestError)) {
		return "notConnected"
	}
	return connection === "checking" ? null : "unavailable"
}

export function needsFreshSession(error: TransportError): boolean {
	return SESSION_ENDING[error.kind]
}

export function noticeTitleFor(t: ChatCopy, error: TransportError): string {
	if (isSignedOut(error)) {
		return t("screen.notice.notAuthenticated")
	}
	if (error.kind === "crashed") {
		return t("screen.notice.crashed")
	}
	if (error.kind === "resumeFailed") {
		return t("screen.notice.resumeFailed")
	}
	if (error.kind === "settingsRejected") {
		return t("screen.notice.settingsRejected")
	}
	if (error.kind === "serverEnvRejected") {
		return t("screen.notice.serverEnvRejected")
	}
	if (error.kind === "readFailed") {
		return t("screen.notice.readFailed")
	}
	if (needsFreshSession(error)) {
		return t("screen.notice.unavailable")
	}
	return t("screen.notice.failed")
}

export type ComposerFocusClaim = {
	threadId: string
	focusedThreadId: string | null
	isPromptPending: boolean
	isSettingsOpen: boolean
	isOverlayOpen: boolean
}

export function claimsComposerFocus(claim: ComposerFocusClaim): boolean {
	return (
		claim.threadId !== claim.focusedThreadId &&
		!claim.isPromptPending &&
		!claim.isSettingsOpen &&
		!claim.isOverlayOpen
	)
}

export function markedRunsOf(
	runs: TranscriptRow[][],
	workingBotIds: (string | null)[],
): Set<number> {
	const closingRunOfBot = new Map<string, number>()

	runs.forEach((run, index) => {
		const botId = run[0].authorBotId
		if (botId && !workingBotIds.includes(botId)) {
			closingRunOfBot.set(botId, index)
		}
	})

	return new Set(closingRunOfBot.values())
}

export type RunPresentation = {
	isMarked: boolean
	faceIndexes: number[]
	hasBareTables: boolean
}

export type RunPresentationInput = {
	runs: TranscriptRow[][]
	workingBotIds: (string | null)[]
	hasSingleBot: boolean
	isWorking: boolean
}

const NO_FACE: number[] = []

const opensAndClosesRun = (run: TranscriptRow[]) =>
	run.length > 1 ? [0, run.length - 1] : [0]

export function runPresentationsOf({
	runs,
	workingBotIds,
	hasSingleBot,
	isWorking,
}: RunPresentationInput): RunPresentation[] {
	if (!hasSingleBot) {
		const marked = markedRunsOf(runs, workingBotIds)
		return runs.map((_, index) => ({
			isMarked: marked.has(index),
			faceIndexes: NO_FACE,
			hasBareTables: false,
		}))
	}

	const newestIndex = runs.length - 1
	return runs.map((run, index) => {
		const isNewest = index === newestIndex
		return {
			isMarked: isNewest,
			faceIndexes: isWorking && isNewest ? NO_FACE : opensAndClosesRun(run),
			hasBareTables: true,
		}
	})
}
