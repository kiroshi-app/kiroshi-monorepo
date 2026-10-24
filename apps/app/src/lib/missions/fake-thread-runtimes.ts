import { act } from "@testing-library/react"

import type { MissionSpeakingRuntimes } from "./use-live-missions"

type ThreadReading = {
	speakers: { botId: string }[]
}

export type FakeThreadRuntimes = {
	runtimes: MissionSpeakingRuntimes
	publishSpeakers: (conversationId: string, botIds: string[]) => void
}

export const createFakeThreadRuntimes = (): FakeThreadRuntimes => {
	const threads = new Map<string, ThreadReading>()
	const listeners = new Set<() => void>()

	const runtimes = {
		heldFor: (conversationId: string) => {
			const reading = threads.get(conversationId)
			return reading ? { getState: () => reading } : null
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
	}

	const publishSpeakers = (conversationId: string, botIds: string[]) => {
		act(() => {
			threads.set(conversationId, {
				speakers: botIds.map((botId) => ({ botId })),
			})
			for (const listener of [...listeners]) {
				listener()
			}
		})
	}

	return { runtimes, publishSpeakers }
}
