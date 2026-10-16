import { beforeEach, describe, expect, it, vi } from "vitest"

import {
	type CompanionRosters,
	createSessionReopener,
	scopeOfOwner,
} from "./session-reopening"

import { initialChatState } from "../chat/chat-state"
import type { Bot } from "../conversations/store-contract"

const raiseFailureNotice = vi.fn()
const raiseTransientNotice = vi.fn()

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: (notice: unknown) => raiseFailureNotice(notice),
	raiseTransientNotice: (notice: unknown) => raiseTransientNotice(notice),
}))

const companionNamed = (id: string, name: string) => ({ id, name }) as Bot

const ARCHIVIST = companionNamed("archivist", "Archivist")
const SCRIBE = companionNamed("scribe", "Scribe")
const DRAFTER = companionNamed("drafter", "Drafter")

const ROSTERS: CompanionRosters = {
	personal: [ARCHIVIST, SCRIBE],
	work: [DRAFTER, ARCHIVIST],
}

const chatWith = (
	liveIds: string[],
	reopen = vi.fn(async () => ({})),
	busyIds: string[] = [],
) => ({
	reopen: reopen as never,
	stateFor: (botId: string) => ({
		...initialChatState,
		sessionOpen: liveIds.includes(botId),
		turn: busyIds.includes(botId) ? ("running" as const) : ("idle" as const),
	}),
})

beforeEach(() => {
	raiseFailureNotice.mockReset()
	raiseTransientNotice.mockReset()
})

describe("scopeOfOwner", () => {
	it("names a bot owner a companion scope", () => {
		expect(
			scopeOfOwner({ kind: "bot", id: "scribe", spaceId: "personal" }),
		).toEqual({ kind: "companion", id: "scribe" })
	})

	it("hands a space and a user owner back as they are", () => {
		expect(scopeOfOwner({ kind: "space", id: "personal" })).toEqual({
			kind: "space",
			id: "personal",
		})
		expect(scopeOfOwner({ kind: "user" })).toEqual({ kind: "user" })
	})
})

describe("session reopener", () => {
	it("reopens the one companion of a companion scope", async () => {
		const reopen = vi.fn(async () => ({}))
		const reopenSessions = createSessionReopener({
			chat: chatWith(["archivist", "scribe"], reopen),
			rosters: () => ROSTERS,
		})

		await reopenSessions({
			scope: { kind: "companion", id: "scribe" },
			application: "Linear",
		})

		expect(reopen).toHaveBeenCalledExactlyOnceWith("scribe")
	})

	it("reopens every live companion of a space scope", async () => {
		const reopen = vi.fn(async () => ({}))
		const reopenSessions = createSessionReopener({
			chat: chatWith(["archivist", "drafter"], reopen),
			rosters: () => ROSTERS,
		})

		await reopenSessions({
			scope: { kind: "space", id: "personal" },
			application: "Linear",
		})

		expect(reopen.mock.calls.flat()).toEqual(["archivist"])
	})

	it("reopens every live companion for the user scope, once each", async () => {
		const reopen = vi.fn(async () => ({}))
		const reopenSessions = createSessionReopener({
			chat: chatWith(["archivist", "drafter"], reopen),
			rosters: () => ROSTERS,
		})

		await reopenSessions({ scope: { kind: "user" }, application: "Linear" })

		expect(reopen.mock.calls.flat().sort()).toEqual(["archivist", "drafter"])
	})

	it("leaves a companion whose session is closed alone", async () => {
		const reopen = vi.fn(async () => ({}))
		const reopenSessions = createSessionReopener({
			chat: chatWith([], reopen),
			rosters: () => ROSTERS,
		})

		await reopenSessions({ scope: { kind: "user" }, application: "Linear" })

		expect(reopen).not.toHaveBeenCalled()
		expect(raiseTransientNotice).not.toHaveBeenCalled()
	})

	it("raises no notice once the reopening lands", async () => {
		const reopenSessions = createSessionReopener({
			chat: chatWith(["archivist"]),
			rosters: () => ROSTERS,
		})

		await reopenSessions({ scope: { kind: "user" }, application: "Linear" })

		expect(raiseTransientNotice).not.toHaveBeenCalled()
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("reopens the others without waiting for a running turn", async () => {
		const held: (() => void)[] = []
		const reopen = vi.fn(async (botId: string) => {
			if (botId !== "archivist") return {}
			await new Promise<void>((resolve) => held.push(resolve))
			return {}
		})
		const reopenSessions = createSessionReopener({
			chat: chatWith(["archivist", "drafter"], reopen as never, ["archivist"]),
			rosters: () => ROSTERS,
		})

		await reopenSessions({ scope: { kind: "user" }, application: "Linear" })

		expect(reopen.mock.calls.flat().sort()).toEqual(["archivist", "drafter"])
		expect(raiseTransientNotice).not.toHaveBeenCalled()
		expect(held).toHaveLength(1)
	})

	it("settles with no notice even when every session is mid turn", async () => {
		const reopen = vi.fn(async () => new Promise<never>(() => undefined))
		const reopenSessions = createSessionReopener({
			chat: chatWith(["archivist"], reopen as never, ["archivist"]),
			rosters: () => ROSTERS,
		})

		await reopenSessions({ scope: { kind: "user" }, application: "Linear" })

		expect(reopen).toHaveBeenCalledExactlyOnceWith("archivist")
		expect(raiseTransientNotice).not.toHaveBeenCalled()
	})

	it("names the companion of a refused reopening and reopens the others", async () => {
		const reopen = vi.fn(async (botId: string) =>
			botId === "archivist" ? null : {},
		)
		const reopenSessions = createSessionReopener({
			chat: chatWith(["archivist", "drafter"], reopen as never),
			rosters: () => ROSTERS,
		})

		await reopenSessions({ scope: { kind: "user" }, application: "Linear" })

		expect(reopen.mock.calls.flat().sort()).toEqual(["archivist", "drafter"])
		await vi.waitFor(() =>
			expect(raiseFailureNotice.mock.calls[0]?.[0]).toMatchObject({
				title: expect.stringContaining("Archivist"),
			}),
		)
		expect(raiseTransientNotice).not.toHaveBeenCalled()
	})
})
