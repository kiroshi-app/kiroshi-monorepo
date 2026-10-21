// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type MockInstance,
	vi,
} from "vitest"

import type { SidebarActionsSource } from "./use-sidebar-actions"

const OPEN_SPACE_ID = "space-open"
const SHOWN_BOT_ID = "bot-shown"
const SHOWN_CONVERSATION_ID = "conversation-shown"

const UNUSED = {} as never

let printedLabels: MockInstance<typeof console.info>

const sourceShowingOpenThread = () =>
	({
		attachments: UNUSED,
		chat: UNUSED,
		collapsedSections: UNUSED,
		drafts: UNUSED,
		joinedSpaces: {
			getState: () => ({ joinedSpaces: [], openId: null }),
			selectSpace: vi.fn(),
		},
		openedMission: { leave: vi.fn() },
		roster: {
			getState: () => ({
				selectedBotId: SHOWN_BOT_ID,
				selectedConversationId: SHOWN_CONVERSATION_ID,
			}),
			select: vi.fn(),
			selectConversation: vi.fn(),
		},
		runtimes: UNUSED,
		sections: UNUSED,
		spaces: { getState: () => ({ selectedSpaceId: OPEN_SPACE_ID }) },
		user: UNUSED,
	}) as unknown as SidebarActionsSource

const mountSidebarActions = async () => {
	vi.resetModules()
	const { useSidebarActions } = await import("./use-sidebar-actions")
	const { result } = renderHook(() =>
		useSidebarActions(sourceShowingOpenThread()),
	)
	return result.current
}

beforeEach(() => {
	printedLabels = vi.spyOn(console, "info").mockImplementation(() => {})
	vi.spyOn(console, "table").mockImplementation(() => {})
})

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

describe("sidebar selection phases", () => {
	it("starts no phase when the click lands on what is already open", async () => {
		const actions = await mountSidebarActions()

		actions.onSelectSpace(OPEN_SPACE_ID)
		actions.onSelectBot(SHOWN_BOT_ID)
		actions.onSelectConversation(SHOWN_CONVERSATION_ID)

		expect(printedLabels).not.toHaveBeenCalled()
	})

	it("starts a space switch on another space", async () => {
		const actions = await mountSidebarActions()

		actions.onSelectSpace("space-other")
		actions.onSelectBot("bot-other")

		expect(printedLabels.mock.calls).toEqual([
			["invokes during boot"],
			["invokes during space switch"],
		])
	})

	it("starts a thread open on another conversation", async () => {
		const actions = await mountSidebarActions()

		actions.onSelectConversation("conversation-other")
		actions.onSelectSpace("space-other")

		expect(printedLabels.mock.calls).toEqual([
			["invokes during boot"],
			["invokes during thread open"],
		])
	})
})
