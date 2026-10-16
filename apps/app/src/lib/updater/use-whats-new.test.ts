// @vitest-environment happy-dom

import { invoke } from "@tauri-apps/api/core"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useWhatsNew } from "./use-whats-new"

import type { ReleaseNotes } from "../bindings"
import { raiseReportedFailure } from "../failure-report"
import { createQueryTestWrapper } from "../query/query-test-wrapper"
import type { UserPreferences } from "../user/preferences-contract"
import { useUser } from "../user/use-user"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
vi.mock("../failure-report", async (importOriginal) => ({
	...(await importOriginal<typeof import("../failure-report")>()),
	raiseReportedFailure: vi.fn(),
}))

const hostInvoke = vi.mocked(invoke)

const RUNNING = "0.25.0"

const NOTES: ReleaseNotes = {
	version: RUNNING,
	body: "Missions show their branch\nSee where the work lands.\n- Calmer sidebar",
	visualUrl: null,
}

const SEEN_BEFORE: UserPreferences = {
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
	updateChannel: "stable",
	showWhatsNew: true,
	lastSeenVersion: "0.24.1",
}

type FakeHost = {
	record: () => UserPreferences
	releaseNotesAsked: () => number
}

const aHost = (
	preferences: Partial<UserPreferences> = {},
	releaseNotes: () => Promise<ReleaseNotes> = async () => NOTES,
): FakeHost => {
	let held: UserPreferences = { ...SEEN_BEFORE, ...preferences }
	let asked = 0

	hostInvoke.mockImplementation((command, args) => {
		if (command === "release_notes") {
			asked += 1
			return releaseNotes()
		}
		if (command === "user_set_preferences") {
			held = (args as { preferences: UserPreferences }).preferences
		}
		return Promise.resolve(held)
	})

	return { record: () => held, releaseNotesAsked: () => asked }
}

const launch = async (
	wrapper = createQueryTestWrapper().wrapper,
	runningVersion: string | null = RUNNING,
) => {
	const mounted = renderHook(
		({ version }) => {
			const user = useUser()
			return { user, whatsNew: useWhatsNew({ user, runningVersion: version }) }
		},
		{ wrapper, initialProps: { version: runningVersion } },
	)
	await act(() => mounted.result.current.user.controller.load())
	return mounted
}

const settled = () => act(() => Promise.resolve())

afterEach(() => {
	cleanup()
})

describe("the What's new dialog at launch", () => {
	beforeEach(() => {
		hostInvoke.mockReset()
		vi.mocked(raiseReportedFailure).mockClear()
	})

	it("opens once on the first launch of a new version, filled from its notes", async () => {
		aHost()
		const { result } = await launch()

		await waitFor(() => expect(result.current.whatsNew.dialog?.open).toBe(true))
		expect(result.current.whatsNew.dialog).toMatchObject({
			variant: "first-launch",
			version: RUNNING,
			headline: "Missions show their branch",
			subline: "See where the work lands.",
			notes: ["Calmer sidebar"],
			visual: undefined,
			channel: "stable",
		})
	})

	it("shows the visual only when the notes carry one", async () => {
		aHost({}, async () => ({
			...NOTES,
			visualUrl: "https://example.test/a.png",
		}))
		const { result } = await launch()

		await waitFor(() =>
			expect(result.current.whatsNew.dialog?.visual?.src).toBe(
				"https://example.test/a.png",
			),
		)
	})

	it("stays open across a second render", async () => {
		const host = aHost()
		const mounted = await launch()
		await waitFor(() =>
			expect(mounted.result.current.whatsNew.dialog?.open).toBe(true),
		)

		mounted.rerender({ version: RUNNING })
		await settled()

		expect(mounted.result.current.whatsNew.dialog?.open).toBe(true)
		expect(host.releaseNotesAsked()).toBe(1)
	})

	it("stores the running version once closed, and reopens neither on a render nor on a remount", async () => {
		const host = aHost()
		const { wrapper } = createQueryTestWrapper()
		const first = await launch(wrapper)
		await waitFor(() =>
			expect(first.result.current.whatsNew.dialog?.open).toBe(true),
		)

		act(() => first.result.current.whatsNew.dialog?.onOpenChange(false))
		await settled()
		first.rerender({ version: RUNNING })

		expect(first.result.current.whatsNew.dialog?.open).toBe(false)
		expect(host.record().lastSeenVersion).toBe(RUNNING)

		first.unmount()
		const remounted = await launch(wrapper)
		await settled()

		expect(remounted.result.current.whatsNew.dialog?.open ?? false).toBe(false)
	})

	it("opens nothing on the next launch once the version was seen", async () => {
		const host = aHost()
		const first = await launch()
		await waitFor(() =>
			expect(first.result.current.whatsNew.dialog?.open).toBe(true),
		)
		act(() => first.result.current.whatsNew.dialog?.onOpenChange(false))
		await settled()
		first.unmount()

		const next = await launch()
		await settled()

		expect(next.result.current.whatsNew.dialog).toBeNull()
		expect(host.releaseNotesAsked()).toBe(1)
	})

	it("keeps the dialog shut for the session when storing the version is refused", async () => {
		aHost()
		const mounted = await launch()
		await waitFor(() =>
			expect(mounted.result.current.whatsNew.dialog?.open).toBe(true),
		)
		hostInvoke.mockRejectedValue({
			kind: "storage",
			failure: { kind: "appDataDir" },
		})

		act(() => mounted.result.current.whatsNew.dialog?.onOpenChange(false))
		await settled()

		expect(mounted.result.current.whatsNew.dialog?.open).toBe(false)
		expect(mounted.result.current.user.state.preferences.lastSeenVersion).toBe(
			"0.24.1",
		)
		expect(raiseReportedFailure).toHaveBeenCalled()
	})

	it("opens nothing for a version already seen", async () => {
		const host = aHost({ lastSeenVersion: RUNNING })
		const { result } = await launch()
		await settled()

		expect(result.current.whatsNew.dialog).toBeNull()
		expect(host.releaseNotesAsked()).toBe(0)
	})

	it("opens nothing while the onboarding shows", async () => {
		const host = aHost({ firstRunDone: false })
		const { result } = await launch()
		await settled()

		expect(result.current.whatsNew.dialog).toBeNull()
		expect(host.releaseNotesAsked()).toBe(0)
	})

	it("opens nothing before the running version is known", async () => {
		const host = aHost()
		const { result } = await launch(createQueryTestWrapper().wrapper, null)
		await settled()

		expect(result.current.whatsNew.dialog).toBeNull()
		expect(host.releaseNotesAsked()).toBe(0)
	})

	it("stores the running version without opening while the switch is off", async () => {
		const host = aHost({ showWhatsNew: false })
		const { result } = await launch()
		await settled()

		expect(result.current.whatsNew.dialog).toBeNull()
		expect(host.record().lastSeenVersion).toBe(RUNNING)
		expect(host.releaseNotesAsked()).toBe(0)
	})

	it("opens nothing and leaves the last seen version when the notes cannot be read", async () => {
		const host = aHost({}, () =>
			Promise.reject({
				kind: "unavailable",
				version: RUNNING,
				detail: "offline",
			}),
		)
		const { result } = await launch()
		await waitFor(() => expect(raiseReportedFailure).toHaveBeenCalled())

		expect(result.current.whatsNew.dialog).toBeNull()
		expect(host.record().lastSeenVersion).toBe("0.24.1")
	})
})

describe("the What's new dialog from the About tab", () => {
	beforeEach(() => {
		hostInvoke.mockReset()
	})

	it("opens the from-about variant on a version already seen", async () => {
		const host = aHost({ lastSeenVersion: RUNNING })
		const { result } = await launch()

		act(() => result.current.whatsNew.openFromAbout())
		await waitFor(() => expect(result.current.whatsNew.dialog?.open).toBe(true))

		expect(result.current.whatsNew.dialog?.variant).toBe("from-about")

		act(() => result.current.whatsNew.dialog?.onOpenChange(false))

		expect(result.current.whatsNew.dialog?.open).toBe(false)
		expect(host.record().lastSeenVersion).toBe(RUNNING)
	})
})
