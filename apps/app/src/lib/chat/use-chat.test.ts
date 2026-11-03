// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"

import { type ChatState, initialChatState } from "./chat-state"
import { activityIn, activityOf, useBotActivity } from "./use-chat"

import type { RosterLine, SoloThreads } from "../bots/roster-line"

const HOME = "personal"

const AWAY = "vocca"

const BOT = "claude"

const LINES: RosterLine[] = [
	{ spaceId: HOME, botId: BOT },
	{ spaceId: AWAY, botId: BOT },
]

const soloThreadOf = ({ spaceId, botId }: RosterLine) =>
	`chat-${botId}-${spaceId}`

const SOLO_THREADS: SoloThreads = Object.fromEntries(
	LINES.map((line) => [soloThreadOf(line), line]),
)

const createFakeChat = () => {
	const states = new Map<string, ChatState>()
	const listeners = new Set<() => void>()

	return {
		stateFor: (botId: string) => states.get(botId) ?? initialChatState,
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		publish: (botId: string, state: Partial<ChatState>) => {
			act(() => {
				states.set(botId, { ...initialChatState, ...state })
				for (const listener of [...listeners]) {
					listener()
				}
			})
		},
	}
}

const writingIn = (spaceId: string): Partial<ChatState> => ({
	conversationId: soloThreadOf({ spaceId, botId: BOT }),
	turn: "running",
})

const mounted = (controller: ReturnType<typeof createFakeChat>) =>
	renderHook(() =>
		useBotActivity({ controller, lines: LINES, soloThreads: SOLO_THREADS }),
	)

afterEach(() => {
	cleanup()
})

it("works on the line of the space its thread sits in and idles on the other", () => {
	const chat = createFakeChat()
	const { result } = mounted(chat)

	chat.publish(BOT, writingIn(AWAY))

	expect(activityIn(result.current, AWAY)[BOT]).toMatchObject({
		isWorking: true,
	})
	expect(activityIn(result.current, HOME)[BOT]).toEqual({ isWorking: false })
})

it("follows the companion to the line of the space it runs in next", () => {
	const chat = createFakeChat()
	const { result } = mounted(chat)

	chat.publish(BOT, writingIn(AWAY))
	chat.publish(BOT, writingIn(HOME))

	expect(activityIn(result.current, HOME)[BOT]).toMatchObject({
		isWorking: true,
	})
	expect(activityIn(result.current, AWAY)[BOT]).toEqual({ isWorking: false })
})

it("answers the working line for a companion wherever it runs", () => {
	const chat = createFakeChat()
	const { result } = mounted(chat)

	chat.publish(BOT, writingIn(AWAY))

	expect(activityOf(result.current, BOT)).toMatchObject({ isWorking: true })
})

it("holds the same map while nothing about the activity changes", () => {
	const chat = createFakeChat()
	const { result } = mounted(chat)

	chat.publish(BOT, writingIn(AWAY))
	const held = result.current
	chat.publish(BOT, { ...writingIn(AWAY), messages: [] })

	expect(result.current).toBe(held)
})

it("follows the background task count of a held turn on its line", () => {
	const chat = createFakeChat()
	const { result } = mounted(chat)
	const heldOn = (count: number): Partial<ChatState> => ({
		...writingIn(AWAY),
		hold: { reason: "backgroundTasks", count },
	})

	chat.publish(BOT, heldOn(3))
	chat.publish(BOT, heldOn(1))

	expect(activityIn(result.current, AWAY)[BOT]).toMatchObject({
		backgroundTasks: 1,
	})

	chat.publish(BOT, writingIn(AWAY))

	expect(activityIn(result.current, AWAY)[BOT]).not.toHaveProperty(
		"backgroundTasks",
		1,
	)
})
