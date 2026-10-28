import { expect, vi } from "vitest"

import { type ChatController, createChatController } from "../chat-controller"
import type { ChatDriver } from "../driver"
import { createFakeChatDriver, type FakeChatDriver } from "../fake-driver"
import type { PostedRequest } from "../posted-question"
import { questionMessageIdOf } from "../question-message"
import type {
	AgentEvent,
	ChatMessage,
	CheckReport,
	RuntimeScope,
} from "../../agent/contract"
import type {
	MessageStoredListener,
	ReportTurnAnnouncer,
} from "../../conversations/create-live-listeners"
import { withFakeHostWrites } from "../../conversations/fake-host-writes"
import {
	createFakeTranscriptStore,
	FAKE_CHAT_ID,
} from "../../conversations/fake-transcript-store"
import type {
	NewAssistantMessage,
	NewUserMessage,
} from "../../conversations/store-contract"
import type { TranscriptStore } from "../../conversations/store-port"
import type { TranscriptMessage } from "../../conversations/transcript-contract"
import { message as storedMessage } from "../../conversations/transcript-fixtures"

export const STEP_MS = 10

export const REPLY = "one two three four five six"

export const BOT = "default"

export const STREAMING_MESSAGE: ChatMessage = {
	id: "msg-1",
	role: "assistant",
	text: "",
	completion: "streaming",
	timestamp: 0,
}

export const ROUNDS = 14

export const ANNOUNCED = "s-1"

export const toolRounds = (rounds: number): AgentEvent[] =>
	Array.from({ length: rounds }, (_, index) => index + 1).flatMap(
		(round): AgentEvent[] => [
			{
				type: "messageStarted",
				message: { ...STREAMING_MESSAGE, id: `msg-tool-${round}` },
			},
			{
				type: "activity",
				activity: {
					id: `tool-${round}`,
					title: "Read",
					kind: "tool",
					status: "running",
				},
			},
			{
				type: "activity",
				activity: {
					id: `tool-${round}`,
					title: "Read",
					kind: "tool",
					status: "succeeded",
				},
			},
		],
	)

export const spokenAnswer = (text: string): AgentEvent[] => [
	{
		type: "messageStarted",
		message: { ...STREAMING_MESSAGE, id: "msg-answer" },
	},
	...text.split(" ").map(
		(word, index): AgentEvent => ({
			type: "messageDelta",
			id: "msg-answer",
			seq: index + 1,
			text: index === 0 ? word : ` ${word}`,
		}),
	),
	{
		type: "messageCompleted",
		message: {
			...STREAMING_MESSAGE,
			id: "msg-answer",
			text,
			completion: "complete",
		},
	},
]

export const POSTED: PostedRequest = {
	id: "posted-1",
	isPosted: true,
	questions: [
		{
			header: "Sign in",
			question: "How do you want to sign in?",
			multiSelect: false,
			options: [{ label: "Subscription", description: null, preview: null }],
		},
	],
}

export const POSTED_ANSWER = { "How do you want to sign in?": "Subscription" }

const NOTHING_TO_RUN: CheckReport = {
	connection: "unavailable",
	binaryVersion: null,
	authenticated: false,
	error: null,
}

export const ended = (
	outcome: "completed" | "cancelled" | "failed",
): AgentEvent => ({
	type: "turnEnded",
	ended: { sessionId: ANNOUNCED, outcome },
})

export const recordingStore = (base: TranscriptStore) => {
	const recorded: [string, string][] = []
	const store: TranscriptStore = {
		...base,
		recordProviderSession: (
			conversationId,
			botId,
			runtimeSessionId,
			providerSessionId,
		) => {
			recorded.push([runtimeSessionId, providerSessionId])
			return base.recordProviderSession(
				conversationId,
				botId,
				runtimeSessionId,
				providerSessionId,
			)
		},
	}
	return { store, recorded }
}

export const REFUSED_REFERENCE = {
	kind: "storage",
	failure: { kind: "sqlite", detail: "FOREIGN KEY constraint failed" },
} as const

export const referentialStore = (base: TranscriptStore) => {
	const conversationOf = new Map<string, string>()
	const takes = ({
		id,
		conversationId,
		turnId,
		repliedToMessageId,
	}: NewUserMessage | NewAssistantMessage) => {
		const referenced = [turnId, repliedToMessageId].filter(
			(key) => key !== null,
		)
		if (referenced.some((key) => conversationOf.get(key) !== conversationId)) {
			return false
		}
		conversationOf.set(id, conversationId)
		return true
	}
	const store: TranscriptStore = {
		...base,
		startTurn: (turn) => {
			conversationOf.set(turn.id, turn.conversationId)
			return base.startTurn(turn)
		},
		appendUserMessage: (message) =>
			takes(message)
				? base.appendUserMessage(message)
				: Promise.reject(REFUSED_REFERENCE),
		sendUserMessage: (message, summoned) => {
			conversationOf.set(message.turnId, message.conversationId)
			return takes(message)
				? base.sendUserMessage(message, summoned)
				: Promise.reject(REFUSED_REFERENCE)
		},
		openAssistantMessage: (message) =>
			takes(message)
				? base.openAssistantMessage(message)
				: Promise.reject(REFUSED_REFERENCE),
	}
	return store
}

export const POISONED = {
	kind: "storage",
	failure: { kind: "poisonedConnection" },
}

export const POISONED_REFUSAL = {
	kind: "writeFailed",
	detail: "the transcript store refused it (storage, poisonedConnection)",
}

export const deferred = () => {
	let release: () => void = () => undefined
	const promise = new Promise<void>((resolve) => {
		release = resolve
	})
	return { promise, release: () => release() }
}

export type Harness = {
	driver: FakeChatDriver
	store: TranscriptStore
	controller: ChatController
	detach: () => void
}

type HarnessOptions = {
	store?: TranscriptStore
	replyFor?: (prompt: string) => string
	driver?: (fake: FakeChatDriver) => ChatDriver
	promptsPerRun?: number
	botId?: string
	onMessageStored?: MessageStoredListener
	announceReportTurn?: ReportTurnAnnouncer
}

let launches = 0

export const createHarness = (options: HarnessOptions = {}): Harness => {
	launches += 1
	const launch = launches
	let minted = 0
	let clock = 1000
	const fake = createFakeChatDriver({
		stepMs: STEP_MS,
		replyFor: options.replyFor ?? (() => REPLY),
	})
	const store = options.store ?? createFakeTranscriptStore()
	const driver = withFakeHostWrites(
		options.driver ? options.driver(fake) : fake,
		store,
	)
	const controller = createChatController(driver, store, {
		newId: () => {
			minted += 1
			return `launch-${launch}-${minted}`
		},
		now: () => {
			clock += 1
			return clock
		},
		promptsPerRun: options.promptsPerRun,
		onMessageStored: options.onMessageStored,
		announceReportTurn: options.announceReportTurn,
	})
	return { driver: fake, store, controller, detach: controller.attach() }
}

export const bootedHarness = async (
	options: HarnessOptions = {},
): Promise<Harness> => {
	const harness = createHarness(options)
	await harness.controller.open(options.botId ?? BOT, null)
	await vi.runAllTimersAsync()
	return harness
}

export const reload = async (
	store: TranscriptStore,
): Promise<TranscriptMessage[]> => {
	const harness = await bootedHarness({ store })
	const { messages } = harness.controller.getState()
	harness.detach()
	return messages
}

export const runOf = (controller: ChatController): RuntimeScope => {
	const runtime = controller.getState().runtime
	if (!runtime) {
		throw new Error("the launch holds no run")
	}
	return runtime
}

export const isAscending = (messages: TranscriptMessage[]) =>
	messages.every(
		(message, index) => index === 0 || message.seq > messages[index - 1].seq,
	)

export const spoken = (messages: TranscriptMessage[]) =>
	messages.map((message) => [message.role, message.content, message.completion])

export const seeded = (count: number): TranscriptMessage[] =>
	Array.from({ length: count }, (_, index) =>
		storedMessage({
			id: `stored-${index + 1}`,
			conversationId: FAKE_CHAT_ID,
			seq: index + 1,
			role: index % 2 === 0 ? "user" : "assistant",
			content: `stored ${index + 1}`,
		}),
	)

export const spaceElsewhere = async (store: TranscriptStore) => {
	const elsewhere = await store.createSpace("Vocca")
	await store.addBotToSpace(BOT, elsewhere.id)
	return elsewhere.id
}

export const answerQuestion = vi.fn(() => Promise.resolve())

export const sessionlessHarness = async (store?: TranscriptStore) =>
	bootedHarness({
		store,
		driver: (fake) => ({
			...fake,
			check: () => Promise.resolve(NOTHING_TO_RUN),
			answerQuestion,
		}),
	})

export const askingIn = (controller: ChatController) =>
	controller
		.getState()
		.messages.find((message) => message.id === questionMessageIdOf(POSTED.id))

export const askingsIn = (controller: ChatController) =>
	controller
		.getState()
		.messages.filter((message) => message.id === questionMessageIdOf(POSTED.id))

export const isPosted = (message: TranscriptMessage) =>
	message.turnId === questionMessageIdOf(POSTED.id)

export const HISTORY = 30

export const withHistory = () =>
	createFakeTranscriptStore({ messages: seeded(HISTORY) })

export const occurrences = (text: string, needle: string) =>
	text.split(needle).length - 1

export const expectWholeChat = (context: string, alsoSaid: string[]) => {
	for (let index = 1; index <= HISTORY; index += 1) {
		expect(context).toContain(`stored ${index}\n`)
	}
	for (const said of alsoSaid) {
		expect(context).toContain(`${said}\n`)
	}
}

export const told = (submitted: { mock: { calls: unknown[][] } }) =>
	String(submitted.mock.calls.at(-1)?.[1] ?? "")

export const userPrompt = (controller: ChatController, text: string) => {
	const prompt = controller
		.getState()
		.messages.find(
			(message) => message.role === "user" && message.content === text,
		)
	if (!prompt) {
		throw new Error(`no prompt reads ${text}`)
	}
	return prompt
}

export const headed = async (
	{ store, controller }: Pick<Harness, "store" | "controller">,
	text: string,
) => {
	const prompt = userPrompt(controller, text)
	const header = await store.messageHeader(prompt.conversationId, prompt.id)
	return `${header}\n${text}`
}

export const reasons = (
	opened: { mock: { calls: unknown[][] } },
	botId: string,
) =>
	opened.mock.calls
		.filter((call) => call[1] === botId)
		.map((call) => call[4] ?? null)
