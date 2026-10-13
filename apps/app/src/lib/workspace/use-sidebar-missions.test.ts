// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BLANK_BOT_PERMISSIONS } from "@workspace/ui/components/bot-settings"
import { MissionCard } from "@workspace/ui/components/mission-card"
import {
	MissionMenu,
	type MissionMenuProps,
} from "@workspace/ui/components/mission-menu"
import type {
	MissionsPanelMission,
	MissionsPanelProps,
} from "@workspace/ui/components/missions-panel"
import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import "@workspace/ui/lib/i18n"

import {
	type SidebarMissions,
	useSidebarMissions,
} from "./use-sidebar-missions"

import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import { createFakeThreadRuntimes } from "@/lib/missions/fake-thread-runtimes"
import type {
	MissionChanged,
	MissionInSpace,
	MissionState,
} from "@/lib/missions/mission-contract"
import { aMission } from "@/lib/missions/mission-fixtures"
import { missionsTransport } from "@/lib/missions/missions-transport"
import type { OpenedMission } from "@/lib/missions/opened-mission-controller"
import type { MissionSpeakingRuntimes } from "@/lib/missions/use-live-missions"
import { createOpenedController } from "@/lib/opened-controller"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

vi.mock("@/lib/missions/missions-transport", () => ({
	missionsTransport: {
		spaceFeed: vi.fn(),
		onChanged: vi.fn(),
		close: vi.fn(),
		reopen: vi.fn(),
	},
}))

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(),
}))

const readSpaceFeed = vi.mocked(missionsTransport.spaceFeed)
const listenToMissions = vi.mocked(missionsTransport.onChanged)
const closeMission = vi.mocked(missionsTransport.close)
const reopenMission = vi.mocked(missionsTransport.reopen)
const notice = vi.mocked(raiseFailureNotice)

const BOT: Bot = {
	id: "bot-1",
	name: "Atlas",
	title: "",
	model: "sonnet",
	avatarBlot: "blue",
	avatarImagePath: null,
	instructions: "",
	deniedTools: [],
	permissions: BLANK_BOT_PERMISSIONS,
	outputStyle: "",
	effort: null,
	createdAt: 1,
	changesNothing: false,
	memory: "",
	sectionId: null,
	pinPosition: null,
}

const NOW = Date.now()

const LISTED: Conversation = {
	id: "c-2",
	spaceId: "s-1",
	sectionId: null,
	pinPosition: null,
	title: "Billing",
	instructions: "",
	createdAt: 1,
	updatedAt: 1,
	participants: [],
}

type EntrySeed = {
	id: string
	state: MissionState
	conversationId: string
}

const anEntry = ({ id, state, conversationId }: EntrySeed): MissionInSpace => ({
	mission: aMission({
		id,
		botId: BOT.id,
		state,
		stateSeq: 1,
		openedAt: NOW - 1000,
		lastActivityAt: null,
		closedAt: state === "done" ? NOW : null,
	}),
	conversationId,
	conversationTitle: conversationId,
})

const WAITING = anEntry({
	id: "m-waiting",
	state: "waiting_human",
	conversationId: "c-1",
})
const WORKING = anEntry({
	id: "m-working",
	state: "working",
	conversationId: "c-2",
})
const DONE = anEntry({ id: "m-done", state: "done", conversationId: "c-1" })
const ELSEWHERE = anEntry({
	id: "m-elsewhere",
	state: "waiting_human",
	conversationId: "c-9",
})

const idsOf = (missions: MissionsPanelMission[]) =>
	missions.map(({ id, conversationId }) => ({ id, conversationId }))

const panelOf = ({ panelsBySpaceId }: SidebarMissions) => {
	const [panel] = Object.values(panelsBySpaceId)
	if (!panel) throw new Error("no missions panel handed over")
	return panel
}

const renderSidebarMissions = (
	spaceId: string | null = "s-1",
	lastMissions: Record<string, string> = {},
) => {
	const select = vi.fn()
	const selectConversation = vi.fn()
	const openedMission = createOpenedController<OpenedMission>()
	const open = vi.spyOn(openedMission, "open")
	const leave = vi.spyOn(openedMission, "leave")
	const threads: MissionSpeakingRuntimes = createFakeThreadRuntimes().runtimes
	const runtimes = {
		...threads,
		heldFor: (conversationId: string) => {
			const held = threads.heldFor(conversationId)
			return held && { ...held, stop: vi.fn(async () => undefined) }
		},
	}
	const rendered = renderHook(
		({ selectedSpaceId }) =>
			useSidebarMissions({
				core: {
					conversationRuntimes: runtimes,
					openedMission,
					roster: {
						state: {
							rosters: { "s-1": [BOT], "s-2": [BOT] },
							conversationRosters: { "s-1": [LISTED] },
							spaceRowId: selectedSpaceId,
						},
						controller: { select, selectConversation },
					},
					shownMemory: {
						lastMissionIn: (shownSpaceId) => lastMissions[shownSpaceId] ?? null,
					},
					spaces: { state: { selectedSpaceId } },
				},
				rosterLines: { now: NOW },
			}),
		{
			wrapper: createQueryTestWrapper().wrapper,
			initialProps: { selectedSpaceId: spaceId },
		},
	)
	return { ...rendered, select, selectConversation, open, leave, openedMission }
}

const menuOn = (
	{ conversationId: _, ...mission }: MissionsPanelMission,
	wrap: MissionsPanelProps["wrap"],
) =>
	wrap?.(
		createElement(MissionCard, { ...mission, density: "row", onOpen: vi.fn() }),
	) as ReactElement<MissionMenuProps>

describe("useSidebarMissions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		readSpaceFeed.mockResolvedValue([WAITING, WORKING, DONE])
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(cleanup)

	it("feeds waiting and in progress missions as open, closed ones as earlier today", async () => {
		const { result } = renderSidebarMissions()

		await waitFor(() => expect(panelOf(result.current).open).toHaveLength(2))
		expect(idsOf(panelOf(result.current).open)).toEqual([
			{ id: "m-waiting", conversationId: "c-1" },
			{ id: "m-working", conversationId: "c-2" },
		])
		expect(idsOf(panelOf(result.current).earlierToday)).toEqual([
			{ id: "m-done", conversationId: "c-1" },
		])
	})

	it("counts the missions of the space waiting on the reader", async () => {
		const { result } = renderSidebarMissions()

		await waitFor(() => expect(result.current.waitingCount).toBe(1))
	})

	it("counts nothing when no mission waits on the reader", async () => {
		readSpaceFeed.mockResolvedValue([WORKING, DONE])
		const { result } = renderSidebarMissions()

		await waitFor(() => expect(panelOf(result.current).open).toHaveLength(1))
		expect(result.current.waitingCount).toBe(0)
	})

	it("moves a mission out of waiting when its state changes, without a reload", async () => {
		let announce: (changed: MissionChanged) => void = () => undefined
		listenToMissions.mockImplementation((listener) => {
			announce = listener
			return Promise.resolve(() => undefined)
		})
		const { result } = renderSidebarMissions()
		await waitFor(() => expect(result.current.waitingCount).toBe(1))
		await waitFor(() => expect(listenToMissions).toHaveBeenCalled())
		readSpaceFeed.mockReturnValue(new Promise(() => undefined))

		act(() => {
			announce({
				missionId: "m-waiting",
				state: "done",
				stateSeq: 2,
				isAgentRunning: false,
				lastActivityAt: NOW,
			})
		})

		await waitFor(() => expect(result.current.waitingCount).toBe(0))
		expect(panelOf(result.current).open.map(({ id }) => id)).toEqual([
			"m-working",
		])
		expect(panelOf(result.current).earlierToday.map(({ id }) => id)).toContain(
			"m-waiting",
		)
	})

	it("shows only the missions of the newly selected space", async () => {
		const { result, rerender } = renderSidebarMissions()
		await waitFor(() => expect(panelOf(result.current).open).toHaveLength(2))
		readSpaceFeed.mockResolvedValue([ELSEWHERE])

		rerender({ selectedSpaceId: "s-2" })

		expect(Object.keys(result.current.panelsBySpaceId)).toEqual(["s-2"])
		expect(panelOf(result.current).open).toEqual([])
		await waitFor(() =>
			expect(idsOf(panelOf(result.current).open)).toEqual([
				{ id: "m-elsewhere", conversationId: "c-9" },
			]),
		)
		expect(panelOf(result.current).earlierToday).toEqual([])
		expect(readSpaceFeed).toHaveBeenLastCalledWith("s-2", expect.any(Number))
	})

	it("opens the mission on a listed conversation, then selects it", async () => {
		const { result, select, selectConversation, open } = renderSidebarMissions()
		await waitFor(() => expect(panelOf(result.current).open).toHaveLength(2))

		panelOf(result.current).onOpen("m-working", "c-2")

		expect(selectConversation).toHaveBeenCalledWith("c-2")
		expect(open).toHaveBeenCalledWith({
			missionId: "m-working",
			rowId: "c-2",
			spaceId: "s-1",
		})
		expect(open.mock.invocationCallOrder[0]).toBeLessThan(
			selectConversation.mock.invocationCallOrder[0],
		)
		expect(select).not.toHaveBeenCalled()
	})

	it("opens the mission on its bot, then selects the bot, when its conversation is not listed", async () => {
		const { result, select, selectConversation, open } = renderSidebarMissions()
		await waitFor(() => expect(panelOf(result.current).open).toHaveLength(2))

		panelOf(result.current).onOpen("m-waiting", "c-1")

		expect(select).toHaveBeenCalledWith(BOT.id)
		expect(open).toHaveBeenCalledWith({
			missionId: "m-waiting",
			rowId: BOT.id,
			spaceId: "s-1",
		})
		expect(open.mock.invocationCallOrder[0]).toBeLessThan(
			select.mock.invocationCallOrder[0],
		)
		expect(selectConversation).not.toHaveBeenCalled()
	})

	it("reopens the last mission shown in the space", async () => {
		const { result, selectConversation, open } = renderSidebarMissions("s-1", {
			"s-1": "m-working",
		})
		await waitFor(() => expect(panelOf(result.current).open).toHaveLength(2))

		result.current.showLastMission()

		expect(open).toHaveBeenCalledWith({
			missionId: "m-working",
			rowId: "c-2",
			spaceId: "s-1",
		})
		expect(selectConversation).toHaveBeenCalledWith("c-2")
	})

	it("opens the first mission when the last one shown is gone from the list", async () => {
		const { result, open } = renderSidebarMissions("s-1", { "s-1": "m-gone" })
		await waitFor(() => expect(panelOf(result.current).open).toHaveLength(2))

		result.current.showLastMission()

		expect(open).toHaveBeenCalledWith({
			missionId: "m-waiting",
			rowId: BOT.id,
			spaceId: "s-1",
		})
	})

	it("reads the memory of the space shown after a space change", async () => {
		const { result, rerender, open } = renderSidebarMissions("s-1", {
			"s-1": "m-working",
			"s-2": "m-elsewhere",
		})
		await waitFor(() => expect(panelOf(result.current).open).toHaveLength(2))
		readSpaceFeed.mockResolvedValue([WORKING, ELSEWHERE])

		rerender({ selectedSpaceId: "s-2" })
		await waitFor(() => expect(panelOf(result.current).open).toHaveLength(2))
		result.current.showLastMission()

		expect(open).toHaveBeenCalledWith({
			missionId: "m-elsewhere",
			rowId: BOT.id,
			spaceId: "s-2",
		})
	})

	it("leaves any open mission when the space holds no mission", async () => {
		readSpaceFeed.mockResolvedValue([])
		const { result, open, leave } = renderSidebarMissions("s-1", {
			"s-1": "m-working",
		})
		await waitFor(() => expect(readSpaceFeed).toHaveBeenCalled())

		result.current.showLastMission()

		expect(open).not.toHaveBeenCalled()
		expect(leave).toHaveBeenCalled()
	})

	it("raises one failure notice when the feed fails, whose retry reads again", async () => {
		readSpaceFeed.mockRejectedValue(new Error("offline"))
		const { rerender } = renderSidebarMissions()

		await waitFor(() => expect(notice).toHaveBeenCalledTimes(1))
		expect(notice.mock.calls[0][0]).toMatchObject({
			title: "Couldn’t load missions",
			action: { label: "Retry" },
		})
		rerender({ selectedSpaceId: "s-1" })
		expect(notice).toHaveBeenCalledTimes(1)

		const reads = readSpaceFeed.mock.calls.length
		readSpaceFeed.mockResolvedValue([WAITING])
		act(() => notice.mock.calls[0][0].action?.onPress())

		await waitFor(() => expect(readSpaceFeed.mock.calls.length).toBe(reads + 1))
	})

	it("raises a new failure notice when a retry fails again", async () => {
		readSpaceFeed.mockRejectedValue(new Error("offline"))
		renderSidebarMissions()
		await waitFor(() => expect(notice).toHaveBeenCalledTimes(1))

		act(() => notice.mock.calls[0][0].action?.onPress())

		await waitFor(() => expect(notice).toHaveBeenCalledTimes(2))
	})

	it("raises no notice on returning to a failed space until its new read fails", async () => {
		readSpaceFeed.mockRejectedValue(new Error("offline"))
		const { rerender } = renderSidebarMissions()
		await waitFor(() => expect(notice).toHaveBeenCalledTimes(1))
		let failRead: (reason: Error) => void = () => undefined
		readSpaceFeed.mockImplementation(
			() =>
				new Promise((_, reject) => {
					failRead = reject
				}),
		)

		rerender({ selectedSpaceId: "s-2" })
		rerender({ selectedSpaceId: "s-1" })

		await waitFor(() =>
			expect(readSpaceFeed).toHaveBeenLastCalledWith("s-1", expect.any(Number)),
		)
		expect(notice).toHaveBeenCalledTimes(1)
		await act(async () => failRead(new Error("offline")))
		await waitFor(() => expect(notice).toHaveBeenCalledTimes(2))
	})

	it("marks no row open while no mission is open", async () => {
		const { result } = renderSidebarMissions()

		await waitFor(() => expect(panelOf(result.current).open).toHaveLength(2))
		expect(panelOf(result.current).openMissionId).toBeNull()
	})

	it("marks the open mission row, and none once the mission is left", async () => {
		const { result, openedMission } = renderSidebarMissions()
		await waitFor(() => expect(panelOf(result.current).open).toHaveLength(2))

		act(() => panelOf(result.current).onOpen("m-working", "c-2"))
		expect(panelOf(result.current).openMissionId).toBe("m-working")

		act(() => openedMission.leave())
		expect(panelOf(result.current).openMissionId).toBeNull()
	})

	it("wraps each row in the mission menu for its state", async () => {
		const { result } = renderSidebarMissions()
		await waitFor(() => expect(panelOf(result.current).open).toHaveLength(2))

		const menus = panelOf(result.current).open.map((mission) =>
			menuOn(mission, panelOf(result.current).wrap),
		)

		expect(menus.map(({ type }) => type)).toEqual([MissionMenu, MissionMenu])
		expect(menus.map(({ props }) => props.state)).toEqual([
			"waiting_human",
			"working",
		])
	})

	it("opens the mission of a row from its menu, landing on the composer", async () => {
		const { result, open } = renderSidebarMissions()
		await waitFor(() => expect(panelOf(result.current).open).toHaveLength(2))
		const [waiting] = panelOf(result.current).open

		act(() => menuOn(waiting, panelOf(result.current).wrap).props.onAnswer())

		expect(open).toHaveBeenCalledWith({
			missionId: "m-waiting",
			rowId: BOT.id,
			spaceId: "s-1",
			landing: "composer",
		})
		expect(panelOf(result.current).openMissionId).toBe("m-waiting")
	})

	it("reads the feed again once a row menu closes a mission", async () => {
		closeMission.mockResolvedValue(WAITING.mission)
		const { result } = renderSidebarMissions()
		await waitFor(() => expect(panelOf(result.current).open).toHaveLength(2))
		const reads = readSpaceFeed.mock.calls.length

		const [waiting] = panelOf(result.current).open
		menuOn(waiting, panelOf(result.current).wrap).props.onClose()

		await waitFor(() => expect(readSpaceFeed.mock.calls.length).toBe(reads + 1))
		expect(closeMission).toHaveBeenCalledWith("m-waiting")
	})

	it("reads the feed again once a row menu reopens a mission", async () => {
		reopenMission.mockResolvedValue(DONE.mission)
		const { result } = renderSidebarMissions()
		await waitFor(() =>
			expect(panelOf(result.current).earlierToday).toHaveLength(1),
		)
		const reads = readSpaceFeed.mock.calls.length

		const [done] = panelOf(result.current).earlierToday
		menuOn(done, panelOf(result.current).wrap).props.onReopen()

		await waitFor(() => expect(readSpaceFeed.mock.calls.length).toBe(reads + 1))
		expect(reopenMission).toHaveBeenCalledWith("m-done")
	})
})
