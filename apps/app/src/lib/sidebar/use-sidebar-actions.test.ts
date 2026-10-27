// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import {
	type SidebarActionsSource,
	useSidebarActions,
} from "./use-sidebar-actions"

import { createStore } from "../store"
import { createDraftsController } from "../chat/drafts-controller"
import {
	createOpenedMissionController,
	type SelectedRow,
} from "../missions/opened-mission-controller"

const { reportFailure } = vi.hoisted(() => ({ reportFailure: vi.fn() }))

vi.mock("../failure-report", async (importOriginal) => ({
	...(await importOriginal<typeof import("../failure-report")>()),
	failureReporterIn: () => reportFailure,
}))

const UNUSED = {} as never

const NO_JOINED_SPACES = {
	getState: () => ({ joinedSpaces: [], openId: null, departed: null }),
} as unknown as SidebarActionsSource["joinedSpaces"]

const VOCCA_SELECTED = {
	getState: () => ({ selectedSpaceId: "vocca" }),
} as unknown as SidebarActionsSource["spaces"]

const gearFor = (settings: SidebarActionsSource["settings"]) => {
	const source: SidebarActionsSource = {
		attachments: UNUSED,
		collapsedSections: UNUSED,
		drafts: UNUSED,
		joinedSpaces: NO_JOINED_SPACES,
		openedMission: UNUSED,
		roster: UNUSED,
		runtimes: UNUSED,
		sections: UNUSED,
		settings,
		spaces: VOCCA_SELECTED,
	}
	const { result } = renderHook(() => useSidebarActions(source))
	return { press: result.current.onOpenSpaceSettings }
}

afterEach(cleanup)

describe("the rail gear", () => {
	it("opens the settings of the selected space", () => {
		const settings = {
			openCompanionSettings: vi.fn(),
			openConversationSettings: vi.fn(),
			openSpaceSettings: vi.fn(),
			openThreadInNewTab: vi.fn(),
			openUserSettings: vi.fn(),
		}
		const gear = gearFor(settings)

		gear.press()

		expect(settings.openSpaceSettings).toHaveBeenCalledExactlyOnceWith("vocca")
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
		settings: UNUSED,
		spaces: UNUSED,
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
		settings: UNUSED,
		spaces: UNUSED,
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

const newTabFor = (selected: SelectedRow) => {
	const roster = createStore(selected)
	const openedMission = createOpenedMissionController(roster)
	openedMission.open({ missionId: "m-1", rowId: "b-1" })
	const rows = {
		getState: roster.getState,
		select: vi.fn(),
		selectConversation: vi.fn(),
	}
	const settings = {
		openCompanionSettings: vi.fn(),
		openConversationSettings: vi.fn(),
		openSpaceSettings: vi.fn(),
		openThreadInNewTab: vi.fn(),
		openUserSettings: vi.fn(),
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
		settings,
		spaces: UNUSED,
	}
	const { result } = renderHook(() => useSidebarActions(source))
	return { actions: result.current, openedMission, roster, rows, settings }
}

const SHOWN_BOT: SelectedRow = {
	selectedBotId: "b-1",
	selectedConversationId: null,
}

describe("open in a new tab from a row menu", () => {
	it("opens the companion in a background tab and keeps the shown row", () => {
		const shown = newTabFor(SHOWN_BOT)

		shown.actions.onOpenBotInNewTab("b-2")

		expect(shown.settings.openThreadInNewTab).toHaveBeenCalledExactlyOnceWith({
			bot: "b-2",
		})
		expect(shown.rows.select).not.toHaveBeenCalled()
		expect(shown.roster.getState()).toEqual(SHOWN_BOT)
		expect(shown.openedMission.getState()).not.toBeNull()
	})

	it("opens the conversation in a background tab and keeps the shown row", () => {
		const shown = newTabFor(SHOWN_BOT)

		shown.actions.onOpenConversationInNewTab("c-2")

		expect(shown.settings.openThreadInNewTab).toHaveBeenCalledExactlyOnceWith({
			conversation: "c-2",
		})
		expect(shown.rows.selectConversation).not.toHaveBeenCalled()
		expect(shown.roster.getState()).toEqual(SHOWN_BOT)
		expect(shown.openedMission.getState()).not.toBeNull()
	})
})

type Deletion = {
	release: () => Promise<void>
	removeConversation: () => Promise<void>
}

const SETTLED = async () => undefined

const REFUSED = () => Promise.reject(new Error("no record"))

const deletionFor = ({ release, removeConversation }: Deletion) => {
	reportFailure.mockClear()
	const attachments = { forget: vi.fn() }
	const drafts = createDraftsController()
	drafts.remember("c-1", "Half a thought")
	const source: SidebarActionsSource = {
		attachments: attachments as never,
		collapsedSections: UNUSED,
		drafts,
		joinedSpaces: UNUSED,
		openedMission: UNUSED,
		roster: { removeConversation } as never,
		runtimes: { release } as never,
		sections: UNUSED,
		settings: UNUSED,
		spaces: UNUSED,
	}
	const { result } = renderHook(() => useSidebarActions(source))
	return { actions: result.current, attachments, drafts }
}

describe("deleting a conversation", () => {
	it.each([
		["the runtime release", { release: REFUSED, removeConversation: SETTLED }],
		["the store deletion", { release: SETTLED, removeConversation: REFUSED }],
	])(
		"reports a refused deletion once when %s fails and keeps its draft and attachments",
		async (_, deletion) => {
			const refused = deletionFor(deletion)

			const isDeleted = await refused.actions.onDeleteConversation("c-1")

			expect(isDeleted).toBe(false)
			expect(reportFailure).toHaveBeenCalledExactlyOnceWith(
				{ title: i18n.t("chat:conversationSettings.danger.failed") },
				{ conversation: "c-1" },
			)
			expect(refused.drafts.read("c-1")).toBe("Half a thought")
			expect(refused.attachments.forget).not.toHaveBeenCalled()
		},
	)

	it("forgets the draft and attachments of a deleted conversation without a notice", async () => {
		const deleted = deletionFor({
			release: SETTLED,
			removeConversation: SETTLED,
		})

		const isDeleted = await deleted.actions.onDeleteConversation("c-1")

		expect(isDeleted).toBe(true)
		expect(reportFailure).not.toHaveBeenCalled()
		expect(deleted.drafts.read("c-1")).toBe("")
		expect(deleted.attachments.forget).toHaveBeenCalledExactlyOnceWith({
			kind: "conversation",
			id: "c-1",
		})
	})
})
