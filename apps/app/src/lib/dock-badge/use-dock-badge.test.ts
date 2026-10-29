// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import "@workspace/ui/lib/i18n"

import { useDockBadge } from "./use-dock-badge"

import { commands } from "../bindings"
import type { ObservedState } from "../conversations/store-contract"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("../bindings", async (importOriginal) => ({
	...(await importOriginal<typeof import("../bindings")>()),
	commands: { badgeSet: vi.fn() },
}))

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

type Mount = Parameters<typeof useDockBadge>[0]
type RosterState = ReturnType<Mount["roster"]["getState"]>
type Badges = Omit<Mount, "roster">

const NEEDS_YOU: ObservedState = {
	state: "needs_you",
	pendingPrompt: { promptId: "prompt", kind: "question", text: "Ship it?" },
}

const createRoster = (initial: RosterState) => {
	let state = initial
	const listeners = new Set<() => void>()
	return {
		getState: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		set: (next: Partial<RosterState>) =>
			act(() => {
				state = { ...state, ...next }
				for (const listener of listeners) listener()
			}),
	}
}

const TWO_SPACES: RosterState = {
	rosters: {
		home: [{ id: "ada" }, { id: "bob" }, { id: "cal" }],
		joined: [{ id: "ada" }, { id: "dee" }],
	},
	conversationRosters: {
		home: [{ id: "room-1" }, { id: "room-2" }],
		joined: [{ id: "room-3" }],
	},
	soloThreads: { "solo-ada": { spaceId: "joined", botId: "ada" } },
	hostStates: { "solo-ada": NEEDS_YOU, "room-3": NEEDS_YOU },
	hasLoaded: true,
	isRosterPending: false,
}

const TWO_SPACES_BADGES: Badges = {
	botBadges: { "home/ada": "failed", "home/bob": "done", "home/cal": "none" },
	conversationBadges: { "room-1": "failed", "room-2": "done" },
	isDriverWindow: true,
}

const TWO_OPEN_QUESTIONS: RosterState = {
	rosters: { home: [{ id: "ada" }] },
	conversationRosters: { home: [{ id: "room-1" }] },
	soloThreads: { "solo-ada": { spaceId: "home", botId: "ada" } },
	hostStates: { "solo-ada": NEEDS_YOU, "room-1": NEEDS_YOU },
	hasLoaded: true,
	isRosterPending: false,
}

const NO_BADGES: Badges = {
	botBadges: {},
	conversationBadges: {},
	isDriverWindow: true,
}

const mountDockBadge = (state: RosterState, badges: Badges = NO_BADGES) => {
	const roster = createRoster(state)
	const hook = renderHook(
		(props: Badges) => useDockBadge({ roster, ...props }),
		{
			initialProps: badges,
			wrapper: createQueryTestWrapper().wrapper,
		},
	)
	return { ...hook, roster }
}

const sentCounts = () =>
	vi.mocked(commands.badgeSet).mock.calls.map(([count]) => count)

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))

beforeEach(() => {
	vi.mocked(commands.badgeSet).mockResolvedValue({ status: "ok", data: null })
})

afterEach(() => {
	cleanup()
	vi.clearAllMocks()
})

describe("useDockBadge", () => {
	it("counts every waiting row of every Space, leaving done and absent badges out", async () => {
		mountDockBadge(TWO_SPACES, TWO_SPACES_BADGES)

		await waitFor(() => expect(sentCounts()).toEqual([4]))
	})

	it("shows two open questions loaded from the stored state as 2", async () => {
		mountDockBadge(TWO_OPEN_QUESTIONS)

		await waitFor(() => expect(sentCounts()).toEqual([2]))
	})

	it("waits for the roster to load before setting the badge", async () => {
		const { roster } = mountDockBadge({
			...TWO_OPEN_QUESTIONS,
			hasLoaded: false,
		})
		roster.set({ hasLoaded: true, isRosterPending: true })
		await settle()

		expect(commands.badgeSet).not.toHaveBeenCalled()

		roster.set({ isRosterPending: false })

		await waitFor(() => expect(sentCounts()).toEqual([2]))
	})

	it("sets the badge once while the count stays the same across renders", async () => {
		const { roster, rerender } = mountDockBadge(TWO_OPEN_QUESTIONS)
		rerender({ ...NO_BADGES })
		roster.set({ isRosterPending: true })
		roster.set({ isRosterPending: false })
		rerender({ ...NO_BADGES, conversationBadges: { "room-1": "done" } })
		await settle()

		expect(sentCounts()).toEqual([2])
	})

	it("lowers the count as each waiting conversation is read, down to 0", async () => {
		const { roster } = mountDockBadge(TWO_OPEN_QUESTIONS)
		await settle()
		roster.set({ hostStates: { "solo-ada": NEEDS_YOU } })
		await settle()
		roster.set({ hostStates: {} })

		await waitFor(() => expect(sentCounts()).toEqual([2, 1, 0]))
	})

	it("leaves the badge to the driver window", async () => {
		const { roster } = mountDockBadge(TWO_OPEN_QUESTIONS, {
			...NO_BADGES,
			isDriverWindow: false,
		})
		roster.set({ hostStates: {} })
		await settle()

		expect(commands.badgeSet).not.toHaveBeenCalled()
	})

	it("raises one notice when the badge is refused and sets it again on the next change", async () => {
		vi.mocked(commands.badgeSet).mockResolvedValueOnce({
			status: "error",
			error: "dock unavailable",
		})
		const { roster } = mountDockBadge(TWO_OPEN_QUESTIONS)

		await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledOnce())
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Couldn’t update the count on the Kiroshi icon",
			}),
		)

		roster.set({ hostStates: { "solo-ada": NEEDS_YOU } })

		await waitFor(() => expect(sentCounts()).toEqual([2, 1]))
		expect(raiseFailureNotice).toHaveBeenCalledOnce()
	})
})
