// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { CompanionSpoke } from "./transcript-contract"
import {
	type CompanionSpokeDriverMount,
	useCompanionSpokeDriver,
} from "./use-companion-spoke-driver"

const CONVERSATION = "c-1"

const WORD: CompanionSpoke = {
	conversationId: CONVERSATION,
	authorBotId: "ada",
	text: "Walls are up. <@nyx>, read it.",
}

const heard = vi.hoisted(
	() => new Set<(spoken: CompanionSpoke, side: null) => void>(),
)

vi.mock("./store-transport", () => ({
	arrivalsTransport: {
		onCompanionSpoke: async (
			listener: (spoken: CompanionSpoke, side: null) => void,
		) => {
			heard.add(listener)
			return () => {
				heard.delete(listener)
			}
		},
		serveAwaitedRuns: async () => null,
	},
	conversationReadsOn: () => ({}),
	missionThreadReadOn: () => async () => ({}),
	reportTurnWritesOn: () => ({}),
}))

vi.mock("./read-conversation", () => ({
	readConversationInEverySpace: async () => ({ id: CONVERSATION }),
}))

const speak = async (spoken: CompanionSpoke) => {
	await act(async () => {
		for (const listener of heard) {
			listener(spoken, null)
		}
	})
}

const relaySpoken = vi.fn(async () => true)

const mountOf = (isDriverWindow: boolean) =>
	({
		runtimes: { runtimeFor: () => ({ relaySpoken }) },
		roster: {
			getState: () => ({
				conversationRosters: { space: [{ id: CONVERSATION }] },
				hasFailedToLoad: false,
			}),
			reload: async () => undefined,
		},
		spokenWords: { announce: vi.fn() },
		isDriverWindow,
	}) as unknown as CompanionSpokeDriverMount

const mountIn = async (isDriverWindow: boolean) => {
	const mounted = renderHook(
		(mount: CompanionSpokeDriverMount) => useCompanionSpokeDriver(mount),
		{ initialProps: mountOf(isDriverWindow) },
	)
	await act(async () => undefined)
	return mounted
}

describe("useCompanionSpokeDriver", () => {
	afterEach(() => {
		cleanup()
		heard.clear()
		vi.clearAllMocks()
	})

	it("relays a word once when a second window mounts the driver too", async () => {
		await mountIn(true)
		await mountIn(false)

		await speak(WORD)

		expect(heard.size).toBe(1)
		expect(relaySpoken).toHaveBeenCalledTimes(1)
	})

	it("relays no word again once its effect runs again", async () => {
		const { rerender } = await mountIn(true)
		await speak(WORD)

		rerender(mountOf(true))
		await act(async () => undefined)
		await speak({ ...WORD })

		expect(relaySpoken).toHaveBeenCalledTimes(1)
	})
})
