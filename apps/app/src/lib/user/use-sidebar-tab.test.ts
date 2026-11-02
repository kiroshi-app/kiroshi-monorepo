// @vitest-environment happy-dom

import { invoke } from "@tauri-apps/api/core"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { UserPreferences } from "./preferences-contract"
import { useSidebarTab } from "./use-sidebar-tab"
import { useUser } from "./use-user"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

const STORED: UserPreferences = {
	displayName: "",
	profilePicturePath: null,
	colorScheme: "system",
	language: null,
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
	sidebarWidth: null,
	sidebarTab: "conversations",
	activityPanelOpen: false,
	firstRunDone: true,
	lastSpaceId: null,
	lastBotIdBySpace: {},
}

const aHost = (record: UserPreferences = STORED) => {
	let held = record
	hostInvoke.mockImplementation((command, args) => {
		if (command === "user_set_preferences") {
			held = (args as { preferences: UserPreferences }).preferences
		}
		return Promise.resolve(held)
	})
	return () => held
}

const aRefusingHost = () =>
	hostInvoke.mockImplementation((command) =>
		command === "user_set_preferences"
			? Promise.reject({
					kind: "storage",
					failure: { kind: "sqlite", detail: "disk I/O error" },
				})
			: Promise.resolve(STORED),
	)

const mountSidebarTab = async () => {
	const mounted = renderHook(() => {
		const user = useUser()
		return { user, sidebarTab: useSidebarTab(user) }
	})
	await act(() => mounted.result.current.user.controller.load())
	return mounted
}

beforeEach(() => {
	localStorage.clear()
	hostInvoke.mockReset()
})

afterEach(cleanup)

describe("the sidebar tab the reader opens", () => {
	it("opens Conversations when no tab is stored", async () => {
		aHost()
		const { result } = await mountSidebarTab()

		expect(result.current.sidebarTab.openTab).toBe("conversations")
	})

	it.each(["companions", "applications"] as const)(
		"opens Conversations when %s is stored",
		async (sidebarTab) => {
			aHost({ ...STORED, sidebarTab })
			const { result } = await mountSidebarTab()

			expect(result.current.sidebarTab.openTab).toBe("conversations")
		},
	)

	it("opens Missions when Missions is stored", async () => {
		aHost({ ...STORED, sidebarTab: "missions" })
		const { result } = await mountSidebarTab()

		expect(result.current.sidebarTab.openTab).toBe("missions")
	})

	it("opens Missions again after a remount once Missions was selected", async () => {
		const host = aHost()
		const first = await mountSidebarTab()

		act(() => first.result.current.sidebarTab.openSidebarTab("missions"))
		expect(first.result.current.sidebarTab.openTab).toBe("missions")
		await waitFor(() => expect(host().sidebarTab).toBe("missions"))
		first.unmount()

		const second = await mountSidebarTab()

		expect(second.result.current.sidebarTab.openTab).toBe("missions")
	})

	it("keeps the clicked tab shown and restores the record when the write is refused", async () => {
		aRefusingHost()
		const { result } = await mountSidebarTab()

		act(() => result.current.sidebarTab.openSidebarTab("missions"))

		await waitFor(() =>
			expect(result.current.user.state.preferences.sidebarTab).toBe(
				"conversations",
			),
		)
		expect(result.current.sidebarTab.openTab).toBe("missions")
	})
})
