// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import {
	type SidebarActionsSource,
	useSidebarActions,
} from "./use-sidebar-actions"

import { createStore } from "../store"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import {
	createOpenedMissionController,
	type SelectedRow,
} from "../missions/opened-mission-controller"
import {
	createSpacesController,
	type SpacesController,
} from "../spaces/spaces-controller"

const UNUSED = {} as never

const gearFor = (spaces: SpacesController) => {
	const source: SidebarActionsSource = {
		attachments: UNUSED,
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

const idleActions = () => {
	const source: SidebarActionsSource = {
		attachments: UNUSED,
		collapsedSections: UNUSED,
		drafts: UNUSED,
		joinedSpaces: UNUSED,
		openedMission: UNUSED,
		roster: UNUSED,
		runtimes: UNUSED,
		sections: UNUSED,
		spaces: UNUSED,
		user: UNUSED,
	}
	return renderHook(() => useSidebarActions(source)).result.current
}

describe("the roster row", () => {
	it("carries no Stop action", () => {
		const actions = idleActions()

		expect(actions).not.toHaveProperty("onStopBot")
		expect(actions).not.toHaveProperty("onStopConversation")
	})
})
