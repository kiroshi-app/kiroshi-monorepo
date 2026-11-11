// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BLANK_BOT_PERMISSIONS } from "@workspace/ui/components/bot-settings"
import {
	MissionMenu,
	type MissionMenuProps,
} from "@workspace/ui/components/mission-menu"
import type { MissionsPageRowWrap } from "@workspace/ui/components/missions-page"
import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import "@workspace/ui/lib/i18n"

import { useSidebarMissions } from "./use-sidebar-missions"

import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import { createFakeThreadRuntimes } from "@/lib/missions/fake-thread-runtimes"
import type {
	MissionInSpace,
	MissionState,
} from "@/lib/missions/mission-contract"
import { aMission, aSpacePage } from "@/lib/missions/mission-fixtures"
import { missionsTransport } from "@/lib/missions/missions-transport"
import type { OpenedMission } from "@/lib/missions/opened-mission-controller"
import type { MissionSpeakingRuntimes } from "@/lib/missions/use-live-missions"
import { createOpenedController } from "@/lib/opened-controller"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import type { ConversationTarget } from "@/lib/tabs/conversation-tab-opening"

vi.mock("@/lib/missions/missions-transport", () => ({
	missionsTransport: {
		spacePage: vi.fn(),
		onChanged: vi.fn(),
		close: vi.fn(),
		reopen: vi.fn(),
	},
}))

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(),
}))

const readSpacePage = vi.mocked(missionsTransport.spacePage)
const listenToMissions = vi.mocked(missionsTransport.onChanged)
const closeMission = vi.mocked(missionsTransport.close)
const reopenMission = vi.mocked(missionsTransport.reopen)
const notice = vi.mocked(raiseFailureNotice)

const BOT: Bot = {
	id: "bot-1",
	name: "Atlas",
	title: "",
	model: "sonnet",
	avatarBlot: 257,
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
	icon: null,
	color: null,
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

const sidebarMissionsWiring = () => {
	const select = vi.fn()
	const selectConversation = vi.fn()
	const openedMission = createOpenedController<OpenedMission>()
	const open = vi.spyOn(openedMission, "open")
	const openThread = vi.fn()
	const openConversation = vi.fn(async (target: ConversationTarget) =>
		target.openInPlace(),
	)
	const threads: MissionSpeakingRuntimes = createFakeThreadRuntimes().runtimes
	const runtimes = {
		...threads,
		heldFor: (conversationId: string) => {
			const held = threads.heldFor(conversationId)
			return held && { ...held, stop: vi.fn(async () => undefined) }
		},
	}
	const inputFor = (selectedSpaceId: string | null) => ({
		core: {
			conversationOpening: { open: openConversation },
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
			spaces: { state: { selectedSpaceId } },
		},
		navigation: { openThread },
	})
	return {
		inputFor,
		select,
		selectConversation,
		open,
		openedMission,
		openThread,
		openConversation,
	}
}

const renderSidebarMissions = (spaceId: string | null = "s-1") => {
	const { inputFor, ...spies } = sidebarMissionsWiring()
	const rendered = renderHook(
		({ selectedSpaceId }) => useSidebarMissions(inputFor(selectedSpaceId)),
		{
			wrapper: createQueryTestWrapper().wrapper,
			initialProps: { selectedSpaceId: spaceId },
		},
	)
	return { ...rendered, ...spies }
}

type MissionsPageRow = Parameters<MissionsPageRowWrap>[0]

type MissionsPageRowState = MissionsPageRow["props"]["mission"]["state"]

const pageRowOf = (id: string, state: MissionsPageRowState) =>
	createElement("li", { mission: { id, state } }) as unknown as MissionsPageRow

type RenderedMissions = ReturnType<typeof renderSidebarMissions>["result"]

const menuOf = (
	result: RenderedMissions,
	id: string,
	state: MissionsPageRowState,
) =>
	result.current.page.wrap?.(
		pageRowOf(id, state),
	) as ReactElement<MissionMenuProps>

const shownIdsOf = (result: RenderedMissions) =>
	result.current.page.missions.map(({ id }) => id)

const missionsRead = (result: RenderedMissions) =>
	waitFor(() => expect(result.current.page.missions).toHaveLength(3))

describe("useSidebarMissions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		readSpacePage.mockResolvedValue(aSpacePage([WAITING, WORKING, DONE]))
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(cleanup)

	it("lists every mission of the space on the Missions page, open ones and those of earlier today", async () => {
		const { result } = renderSidebarMissions()

		await missionsRead(result)
		expect(shownIdsOf(result)).toEqual(["m-waiting", "m-working", "m-done"])
	})

	it("shows only the missions of the newly selected space", async () => {
		const { result, rerender } = renderSidebarMissions()
		await missionsRead(result)
		readSpacePage.mockResolvedValue(aSpacePage([ELSEWHERE]))

		rerender({ selectedSpaceId: "s-2" })

		expect(result.current.page.missions).toEqual([])
		await waitFor(() => expect(shownIdsOf(result)).toEqual(["m-elsewhere"]))
		expect(readSpacePage).toHaveBeenLastCalledWith(
			"s-2",
			expect.any(Number),
			null,
			30,
		)
	})

	it("opens the mission on a listed conversation, then selects it", async () => {
		const { result, select, selectConversation, open } = renderSidebarMissions()
		await missionsRead(result)

		menuOf(result, "m-working", "working").props.onOpen()

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

	it("opens the mission on a listed conversation through the shared conversation path", async () => {
		const { result, selectConversation, open, openConversation } =
			renderSidebarMissions()
		openConversation.mockImplementation(async () => undefined)
		await missionsRead(result)

		menuOf(result, "m-working", "working").props.onOpen()

		expect(openConversation).toHaveBeenCalledWith(
			expect.objectContaining({ conversationId: "c-2", mission: "m-working" }),
		)
		expect(selectConversation).not.toHaveBeenCalled()
		expect(open).not.toHaveBeenCalled()
	})

	it("opens the mission on its bot, then selects the bot, when its conversation is not listed", async () => {
		const { result, select, selectConversation, open } = renderSidebarMissions()
		await missionsRead(result)

		menuOf(result, "m-waiting", "waiting_human").props.onOpen()

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

	it("opens the thread of a mission of the Missions page by its address", async () => {
		const { result, open, openThread } = renderSidebarMissions()
		await missionsRead(result)

		result.current.page.onOpen("m-working")
		result.current.page.onOpen("m-waiting")

		expect(openThread.mock.calls).toEqual([
			[{ conversation: "c-2", mission: "m-working" }],
			[{ bot: BOT.id, mission: "m-waiting" }],
		])
		expect(open).not.toHaveBeenCalled()
	})

	it("raises one failure notice when the feed fails, whose retry reads again", async () => {
		readSpacePage.mockRejectedValue(new Error("offline"))
		const { rerender } = renderSidebarMissions()

		await waitFor(() => expect(notice).toHaveBeenCalledTimes(1))
		expect(notice.mock.calls[0][0]).toMatchObject({
			title: "Couldn’t load missions",
			action: { label: "Retry" },
		})
		rerender({ selectedSpaceId: "s-1" })
		expect(notice).toHaveBeenCalledTimes(1)

		const reads = readSpacePage.mock.calls.length
		readSpacePage.mockResolvedValue(aSpacePage([WAITING]))
		act(() => notice.mock.calls[0][0].action?.onPress())

		await waitFor(() => expect(readSpacePage.mock.calls.length).toBe(reads + 1))
	})

	it("raises a new failure notice when a retry fails again", async () => {
		readSpacePage.mockRejectedValue(new Error("offline"))
		renderSidebarMissions()
		await waitFor(() => expect(notice).toHaveBeenCalledTimes(1))

		act(() => notice.mock.calls[0][0].action?.onPress())

		await waitFor(() => expect(notice).toHaveBeenCalledTimes(2))
	})

	it("raises no notice on returning to a failed space until its new read fails", async () => {
		readSpacePage.mockRejectedValue(new Error("offline"))
		const { rerender } = renderSidebarMissions()
		await waitFor(() => expect(notice).toHaveBeenCalledTimes(1))
		let failRead: (reason: Error) => void = () => undefined
		readSpacePage.mockImplementation(
			() =>
				new Promise((_, reject) => {
					failRead = reject
				}),
		)

		rerender({ selectedSpaceId: "s-2" })
		rerender({ selectedSpaceId: "s-1" })

		await waitFor(() =>
			expect(readSpacePage).toHaveBeenLastCalledWith(
				"s-1",
				expect.any(Number),
				null,
				30,
			),
		)
		expect(notice).toHaveBeenCalledTimes(1)
		await act(async () => failRead(new Error("offline")))
		await waitFor(() => expect(notice).toHaveBeenCalledTimes(2))
	})

	it("marks no mission open while no mission is open", async () => {
		const { result } = renderSidebarMissions()

		await missionsRead(result)
		expect(result.current.openMissionId).toBeUndefined()
	})

	it("marks the open mission, and none once the mission is left", async () => {
		const { result, openedMission } = renderSidebarMissions()
		await missionsRead(result)

		act(() => menuOf(result, "m-working", "working").props.onOpen())
		expect(result.current.openMissionId).toBe("m-working")

		act(() => openedMission.leave())
		expect(result.current.openMissionId).toBeUndefined()
	})

	it("wraps each Missions page row in the mission menu for its state", async () => {
		const { result } = renderSidebarMissions()
		await missionsRead(result)

		const menus = [
			menuOf(result, "m-waiting", "waiting_human"),
			menuOf(result, "m-working", "working"),
		]

		expect(menus.map(({ type }) => type)).toEqual([MissionMenu, MissionMenu])
		expect(menus.map(({ props }) => props.state)).toEqual([
			"waiting_human",
			"working",
		])
	})

	it("opens the mission of a row from its menu, landing on the composer", async () => {
		const { result, open } = renderSidebarMissions()
		await missionsRead(result)

		act(() => menuOf(result, "m-waiting", "waiting_human").props.onAnswer())

		expect(open).toHaveBeenCalledWith({
			missionId: "m-waiting",
			rowId: BOT.id,
			spaceId: "s-1",
			landing: "composer",
		})
		expect(result.current.openMissionId).toBe("m-waiting")
	})

	it("leaves a Missions page row without a menu when the feed holds no such mission", async () => {
		const { result } = renderSidebarMissions()
		await missionsRead(result)
		const row = pageRowOf("m-unknown", "working")

		expect(result.current.page.wrap?.(row)).toBe(row)
	})

	it("reads the feed again once a row menu closes a mission", async () => {
		closeMission.mockResolvedValue(WAITING.mission)
		const { result } = renderSidebarMissions()
		await missionsRead(result)
		const reads = readSpacePage.mock.calls.length

		menuOf(result, "m-waiting", "waiting_human").props.onClose()

		await waitFor(() => expect(readSpacePage.mock.calls.length).toBe(reads + 1))
		expect(closeMission).toHaveBeenCalledWith("m-waiting")
	})

	it("reads the feed again once a row menu reopens a mission", async () => {
		reopenMission.mockResolvedValue(DONE.mission)
		const { result } = renderSidebarMissions()
		await missionsRead(result)
		const reads = readSpacePage.mock.calls.length

		menuOf(result, "m-done", "done").props.onReopen()

		await waitFor(() => expect(readSpacePage.mock.calls.length).toBe(reads + 1))
		expect(reopenMission).toHaveBeenCalledWith("m-done")
	})
})
