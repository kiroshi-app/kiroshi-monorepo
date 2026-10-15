import {
	BLANK_BOT_PERMISSIONS,
	DEFAULT_BOT_OUTPUT_STYLE,
} from "@workspace/ui/components/bot-settings"

import type { SpeakingBot } from "./conversation-controller"
import type { Bot, BotIdentity } from "./store-contract"
import type { TranscriptStore } from "./store-port"
import type { TranscriptMessage } from "./transcript-contract"

import type { AgentCommand } from "@/lib/agent/contract"

export const CONVERSATION = "c-1"

export const OTHER_CONVERSATION = "c-2"

export const message = (
	overrides: Partial<TranscriptMessage> = {},
): TranscriptMessage => ({
	id: "m-1",
	conversationId: CONVERSATION,
	turnId: "t-1",
	seq: 1,
	role: "assistant",
	content: "",
	completion: "complete",
	createdAt: 0,
	authorBotId: null,
	authorAccountId: null,
	authorName: null,
	repliedToMessageId: null,
	runtimeSessionId: null,
	...overrides,
})

export const botIdentity = (
	overrides: Partial<BotIdentity> = {},
): Pick<Bot, keyof BotIdentity> => ({
	name: "Nyx",
	title: "Reviewer",
	model: "opus",
	avatarBlot: "green",
	avatarImagePath: null,
	instructions: "Answer with the file you would touch.",
	deniedTools: [],
	permissions: BLANK_BOT_PERMISSIONS,
	outputStyle: DEFAULT_BOT_OUTPUT_STYLE,
	effort: null,
	...overrides,
})

export const speakingBot = (
	botId: string,
	overrides: Partial<SpeakingBot> = {},
): SpeakingBot => ({
	botId,
	work: { kind: "thinking" },
	hasPublished: false,
	isForeign: false,
	stop: () => Promise.resolve(),
	...overrides,
})

export const named = (...names: string[]): AgentCommand[] =>
	names.map((name) => ({ name }))

export const seatBots = async (
	store: TranscriptStore,
	spaceId: string,
	names: string[],
) => {
	const bots = []
	for (const name of names) {
		bots.push(await store.createBot(botIdentity({ name }), spaceId))
	}
	return bots
}
