// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import {
	type SidebarActionsSource,
	useSidebarActions,
} from "./use-sidebar-actions"

import { raiseReportedFailure } from "../failure-report"
import { createStore } from "../store"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import type { SpeakingBot } from "../conversations/conversation-controller"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import { speakingBot } from "../conversations/transcript-fixtures"
import {
	createOpenedMissionController,
	type SelectedRow,
} from "../missions/opened-mission-controller"
import {
	createSpacesController,
	type SpacesController,
} from "../spaces/spaces-controller"

vi.mock("../failure-report", async (importOriginal) => ({
	...(await importOriginal<typeof import("../failure-report")>()),
	raiseReportedFailure: vi.fn(() => Promise.resolve("notice")),
}))

const UNUSED = {} as never

const gearFor = (spaces: SpacesController) => {
	const source: SidebarActionsSource = {
		attachments: UNUSED,
		chat: UNUSED,
		collapsedSections: UNUSED,
		drafts: UNUSED,
		joinedSpaces: UNUSED,
		openedMission: UNUSED,
		roster: UNUSED,
		runtimes: UNUSED,
		sections: UNUSED,
		spaces,
		user: UNUSED,
	}
	const { result } = renderHook(() => useSidebarActions(source))
	return { press: result.current.onOpenSpaceSettings }
}

afterEach(cleanup)

describe("the rail gear", () => {
	it("opens the settings of the selected space", async () => {
		const store = createFakeTranscriptStore()
		const shown = await store.createSpace("Vocca")
		const { queryClient } = createQueryTestWrapper()
		const spaces = createSpacesController(store, { queryClient })
		await spaces.load(shown.id)
		const gear = gearFor(spaces)

		gear.press()

		expect(spaces.getState().isSettingsOpen).toBe(true)
	})
})

const rowsFor = (selected: SelectedRow) => {
	const roster = createStore(selected)
	const openedMission = createOpenedMissionController(roster)
	const rows = {
		getState: roster.getState,
		select: vi.fn((id: string) =>
			roster.setState({ selectedBotId: id, selectedConversationId: null }),
		),
		selectConversation: vi.fn((id: string) =>
			roster.setState({ selectedBotId: null, selectedConversationId: id }),
		),
	}
	const source: SidebarActionsSource = {
		attachments: UNUSED,
		chat: UNUSED,
		collapsedSections: UNUSED,
		drafts: UNUSED,
		joinedSpaces: UNUSED,
		openedMission,
		roster: rows as never,
		runtimes: UNUSED,
		sections: UNUSED,
		spaces: UNUSED,
		user: UNUSED,
	}
	const { result, rerender } = renderHook(() => useSidebarActions(source))
	return { actions: () => result.current, rerender, openedMission, rows }
}

describe("a row click while a mission is open", () => {
	it("closes the mission when the reader clicks the conversation it was opened from", () => {
		const shown = rowsFor({
			selectedBotId: null,
			selectedConversationId: "c-1",
		})
		shown.openedMission.open({ missionId: "m-1", rowId: "c-1" })

		shown.actions().onSelectConversation("c-1")
		shown.rerender()

		expect(shown.openedMission.getState()).toBeNull()
		expect(shown.rows.selectConversation).toHaveBeenCalledWith("c-1")
	})

	it("closes the mission when the reader clicks the bot it was opened from", () => {
		const shown = rowsFor({
			selectedBotId: "b-1",
			selectedConversationId: null,
		})
		shown.openedMission.open({ missionId: "m-1", rowId: "b-1" })

		shown.actions().onSelectBot("b-1")
		shown.rerender()

		expect(shown.openedMission.getState()).toBeNull()
		expect(shown.rows.select).toHaveBeenCalledWith("b-1")
	})

	it("closes the mission and shows another row the reader clicks", () => {
		const shown = rowsFor({
			selectedBotId: "b-1",
			selectedConversationId: null,
		})
		shown.openedMission.open({ missionId: "m-1", rowId: "b-1" })

		shown.actions().onSelectConversation("c-2")

		expect(shown.openedMission.getState()).toBeNull()
		expect(shown.rows.selectConversation).toHaveBeenCalledWith("c-2")
	})
})

type HeldSpeakers = Record<string, SpeakingBot[]>

const stopsFor = (
	held: HeldSpeakers,
	stopFor = vi.fn(() => Promise.resolve()),
) => {
	const source: SidebarActionsSource = {
		attachments: UNUSED,
		chat: { stopFor },
		collapsedSections: UNUSED,
		drafts: UNUSED,
		joinedSpaces: UNUSED,
		openedMission: UNUSED,
		roster: UNUSED,
		runtimes: {
			heldFor: (id: string) =>
				held[id] ? { getState: () => ({ speakers: held[id] }) } : null,
		} as never,
		sections: UNUSED,
		spaces: UNUSED,
		user: UNUSED,
	}
	const { result } = renderHook(() => useSidebarActions(source))
	return { actions: result.current, stopFor }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("the roster Stop", () => {
	afterEach(() => {
		vi.mocked(raiseReportedFailure).mockClear()
	})

	it("stops the solo thread of the bot the row hands back", () => {
		const shown = stopsFor({})

		shown.actions.onStopBot("b-1")

		expect(shown.stopFor).toHaveBeenCalledExactlyOnceWith("b-1")
	})

	it("stops every companion speaking in the conversation, foreign ones included", async () => {
		const local = vi.fn(() => Promise.resolve())
		const foreign = vi.fn(() => Promise.resolve())
		const shown = stopsFor({
			"c-1": [
				speakingBot("b-1", { stop: local }),
				speakingBot("b-2", { isForeign: true, stop: foreign }),
			],
		})

		shown.actions.onStopConversation("c-1")
		await flush()

		expect(local).toHaveBeenCalledOnce()
		expect(foreign).toHaveBeenCalledOnce()
		expect(raiseReportedFailure).not.toHaveBeenCalled()
	})

	it("does nothing for a conversation no runtime holds", async () => {
		const stop = vi.fn(() => Promise.resolve())
		const shown = stopsFor({ "c-1": [speakingBot("b-1", { stop })] })

		shown.actions.onStopConversation("c-2")
		await flush()

		expect(stop).not.toHaveBeenCalled()
		expect(raiseReportedFailure).not.toHaveBeenCalled()
	})

	it("raises the stop failure notice when a conversation stop rejects", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		const shown = stopsFor({
			"c-1": [
				speakingBot("b-1", {
					stop: () => Promise.reject(new Error("gone")),
				}),
			],
		})

		shown.actions.onStopConversation("c-1")
		await flush()

		expect(raiseReportedFailure).toHaveBeenCalledExactlyOnceWith(
			{ title: "Couldn’t stop the agent" },
			{ conversation: "c-1", raisedIn: "use-sidebar-actions" },
		)
	})

	it("raises the stop failure notice when a bot stop rejects", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		const shown = stopsFor(
			{},
			vi.fn(() => Promise.reject(new Error("gone"))),
		)

		shown.actions.onStopBot("b-1")
		await flush()

		expect(raiseReportedFailure).toHaveBeenCalledExactlyOnceWith(
			{ title: "Couldn’t stop the agent" },
			{ botId: "b-1", raisedIn: "use-sidebar-actions" },
		)
	})
})
