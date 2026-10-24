import { describe, expect, it } from "vitest"

import type { ConversationAnswer } from "./conversation-badge"
import { createConversationBadgeSource } from "./conversation-badge-source"
import { createSpokenWords } from "./spoken-words"
import type { TranscriptCompletion } from "./transcript-contract"
import { speakingBot } from "./transcript-fixtures"

const answered = (completion: TranscriptCompletion): ConversationAnswer => ({
	speakers: [],
	waitingBotIds: [],
	messages: [
		{
			id: "message-one",
			conversationId: "room-one",
			turnId: "turn-one",
			seq: 1,
			role: "assistant",
			content: "Here you go",
			completion,
			createdAt: 1,
			authorBotId: "bot-one",
			authorAccountId: null,
			authorName: null,
			repliedToMessageId: null,
			runtimeSessionId: null,
		},
	],
	pendingPrompt: null,
})

const answering: ConversationAnswer = {
	speakers: [speakingBot("bot-one")],
	waitingBotIds: [],
	messages: [],
	pendingPrompt: null,
}

const asking: ConversationAnswer = {
	...answering,
	pendingPrompt: {
		kind: "question",
		botId: "bot-one",
		request: {
			id: "question-one",
			questions: [
				{
					header: "Pick a branch",
					question: "Which branch should I use?",
					options: [],
					multiSelect: false,
				},
			],
		},
	},
}

const approving: ConversationAnswer = {
	...answering,
	pendingPrompt: {
		kind: "permission",
		botId: "bot-one",
		request: {
			id: "permission-one",
			toolName: "Bash",
			title: "Run npm test",
			detail: null,
		},
	},
}

const createFakeRuntimes = () => {
	const answers = new Map<string, ConversationAnswer>()
	const listeners = new Set<() => void>()

	return {
		heldFor: (conversationId: string) => {
			const answer = answers.get(conversationId)
			return answer ? { getState: () => answer } : null
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		publish: (conversationId: string, answer: ConversationAnswer) => {
			answers.set(conversationId, answer)
			for (const listener of [...listeners]) {
				listener()
			}
		},
		release: (conversationId: string) => {
			answers.delete(conversationId)
			for (const listener of [...listeners]) {
				listener()
			}
		},
	}
}

const createFakeRoster = (
	conversationRosters: Record<string, { id: string }[]>,
	selectedConversationId: string | null,
) => {
	const state = { conversationRosters, selectedConversationId }
	const listeners = new Set<() => void>()

	const publish = () => {
		for (const listener of [...listeners]) {
			listener()
		}
	}

	return {
		getState: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		select: (conversationId: string | null) => {
			state.selectedConversationId = conversationId
			publish()
		},
		hold: (held: Record<string, { id: string }[]>) => {
			state.conversationRosters = held
			publish()
		},
	}
}

type HarnessOptions = {
	conversationRosters?: Record<string, { id: string }[]>
	selectedConversationId?: string | null
	hasFocus?: boolean
}

const start = ({
	conversationRosters = { home: [{ id: "room-one" }] },
	selectedConversationId = null,
	hasFocus = true,
}: HarnessOptions = {}) => {
	const runtimes = createFakeRuntimes()
	const roster = createFakeRoster(conversationRosters, selectedConversationId)
	const spokenWords = createSpokenWords()
	let tellFocus: ((isFocused: boolean) => void) | undefined

	const source = createConversationBadgeSource({
		runtimes,
		roster,
		spokenWords,
		hasFocus: () => hasFocus,
		watchFocus: (report) => {
			tellFocus = report
			report(hasFocus)
			return Promise.resolve(() => undefined)
		},
	})

	const stop = source.start()

	const speakIn = (conversationId: string) => {
		spokenWords.announce({ conversationId, authorBotId: "bot-one" })
	}

	return {
		runtimes,
		roster,
		source,
		speakIn,
		blur: () => tellFocus?.(false),
		focus: () => tellFocus?.(true),
		stop,
	}
}

describe("createConversationBadgeSource", () => {
	it("reports none until a conversation answers", () => {
		const { source } = start()

		expect(source.getBadges()["room-one"]).toBeUndefined()
	})

	it("reports none while a conversation answers", () => {
		const { runtimes, source } = start()

		runtimes.publish("room-one", answering)

		expect(source.getBadges()["room-one"]).toBe("none")
	})

	it("reports attention while the read conversation waits on an approval", () => {
		const { runtimes, source } = start({
			selectedConversationId: "room-one",
		})

		runtimes.publish("room-one", approving)

		expect(source.getBadges()["room-one"]).toBe("attention")
	})

	it("reports no attention while the conversation only waits on a question", () => {
		const { runtimes, source } = start({
			selectedConversationId: "room-two",
		})

		runtimes.publish("room-one", asking)

		expect(source.getBadges()["room-one"]).toBe("none")
	})

	it("drops the attention badge once the approval is given", () => {
		const { runtimes, source } = start({
			selectedConversationId: "room-one",
		})

		runtimes.publish("room-one", approving)
		runtimes.publish("room-one", answering)

		expect(source.getBadges()["room-one"]).toBe("none")
	})

	it("reports done when an unread conversation finishes answering", () => {
		const { runtimes, source } = start({
			selectedConversationId: "room-two",
		})

		runtimes.publish("room-one", answering)
		runtimes.publish("room-one", answered("complete"))

		expect(source.getBadges()["room-one"]).toBe("done")
	})

	it("reports failed when an unread conversation's answer fails", () => {
		const { runtimes, source } = start({
			selectedConversationId: "room-two",
		})

		runtimes.publish("room-one", answering)
		runtimes.publish("room-one", answered("failed"))

		expect(source.getBadges()["room-one"]).toBe("failed")
	})

	it("reports none when the read conversation finishes answering under focus", () => {
		const { runtimes, source } = start({
			selectedConversationId: "room-one",
		})

		runtimes.publish("room-one", answering)
		runtimes.publish("room-one", answered("complete"))

		expect(source.getBadges()["room-one"]).toBe("none")
	})

	it("reports done when the read conversation finishes answering without focus", () => {
		const { runtimes, blur, source } = start({
			selectedConversationId: "room-one",
		})

		blur()
		runtimes.publish("room-one", answering)
		runtimes.publish("room-one", answered("complete"))

		expect(source.getBadges()["room-one"]).toBe("done")
	})

	it("drops the badge when the reader opens the marked conversation", () => {
		const { runtimes, roster, source } = start({
			selectedConversationId: "room-two",
		})

		runtimes.publish("room-one", answering)
		runtimes.publish("room-one", answered("failed"))
		roster.select("room-one")

		expect(source.getBadges()["room-one"]).toBe("none")
	})

	it("keeps the badge of an unread conversation when the window comes back", () => {
		const { runtimes, blur, focus, source } = start({
			selectedConversationId: "room-two",
		})

		blur()
		runtimes.publish("room-one", answering)
		runtimes.publish("room-one", answered("complete"))
		focus()

		expect(source.getBadges()["room-one"]).toBe("done")
	})

	it("forgets the badge of a deleted conversation", () => {
		const { runtimes, roster, source } = start({
			selectedConversationId: "room-two",
		})

		runtimes.publish("room-one", answering)
		runtimes.publish("room-one", answered("complete"))
		runtimes.release("room-one")
		roster.hold({ home: [] })

		expect(source.getBadges()["room-one"]).toBeUndefined()
	})

	it("reports done when a companion speaks in a room never held before", () => {
		const { speakIn, source } = start({
			selectedConversationId: "room-two",
		})

		speakIn("room-one")

		expect(source.getBadges()["room-one"]).toBe("done")
	})

	it("keeps the spoken badge once the room's runtime reports", () => {
		const { runtimes, speakIn, source } = start({
			selectedConversationId: "room-two",
		})

		speakIn("room-one")
		runtimes.publish("room-one", answered("complete"))

		expect(source.getBadges()["room-one"]).toBe("done")
	})

	it("leaves the read room without a badge for a word spoken under focus", () => {
		const { speakIn, source } = start({
			selectedConversationId: "room-one",
		})

		speakIn("room-one")

		expect(source.getBadges()["room-one"]).toBeUndefined()
	})

	it("reports done for a word spoken in the read room while the window is away", () => {
		const { blur, speakIn, source } = start({
			selectedConversationId: "room-one",
		})

		blur()
		speakIn("room-one")

		expect(source.getBadges()["room-one"]).toBe("done")
	})

	it("ignores a word spoken in a room no roster shows", () => {
		const { speakIn, source } = start({
			selectedConversationId: "room-two",
		})

		speakIn("room-ghost")

		expect(source.getBadges()["room-ghost"]).toBeUndefined()
	})

	it("stops reading spoken words when the mount goes away", () => {
		const { speakIn, source, stop } = start({
			selectedConversationId: "room-two",
		})

		stop()
		speakIn("room-one")

		expect(source.getBadges()["room-one"]).toBeUndefined()
	})
})
