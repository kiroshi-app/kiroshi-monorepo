import { describe, expect, it, vi } from "vitest"

import { aboutFieldsOf, toAboutUpdate } from "./about-fields"
import { toUpdateBadgeProps } from "./badge-model"
import type { UpdaterController, UpdaterState } from "./updater-controller"

import type { User } from "../user/use-user"

vi.mock("./open-release-notes", () => ({ openReleaseNotes: vi.fn() }))
vi.mock("../failure-report", async (importOriginal) => ({
	...(await importOriginal<typeof import("../failure-report")>()),
	raiseReportedFailure: vi.fn(),
}))

const { openReleaseNotes } = await import("./open-release-notes")
const { raiseReportedFailure } = await import("../failure-report")

const stateOf = (overrides: Partial<UpdaterState> = {}): UpdaterState => ({
	host: { kind: "upToDate" },
	offeredVersion: null,
	checkedAt: 1_000,
	runningCompanions: 0,
	...overrides,
})

const updaterOf = (state: UpdaterState) => {
	const controller = {
		getState: () => state,
		subscribe: () => () => undefined,
		start: () => () => undefined,
		check: vi.fn(async () => undefined),
		install: vi.fn(async () => undefined),
		restart: vi.fn(async () => undefined),
	} satisfies UpdaterController
	return { state, controller }
}

const userOf = (preferences: Partial<User["state"]["preferences"]> = {}) =>
	({
		state: { preferences },
		controller: {
			setUpdateChannel: vi.fn(async () => undefined),
			setShowWhatsNew: vi.fn(async () => undefined),
		},
	}) as unknown as User

const onReplayOnboarding = vi.fn()

const fieldsOf = (
	updater = updaterOf(stateOf()),
	user = userOf({ updateChannel: "beta", showWhatsNew: false }),
) =>
	aboutFieldsOf({
		updater,
		user,
		runningVersion: "0.25.0",
		onWhatsNew: vi.fn(),
		onReplayOnboarding,
	})

describe("toAboutUpdate", () => {
	it("dates an up to date build by its last check", () => {
		expect(toAboutUpdate(stateOf())).toEqual({
			status: "upToDate",
			checkedAt: 1_000,
		})
	})

	it("shows a running check", () => {
		expect(toAboutUpdate(stateOf({ host: { kind: "checking" } }))).toEqual({
			status: "checking",
		})
	})

	it("offers the version a check found", () => {
		expect(
			toAboutUpdate(
				stateOf({ host: { kind: "available", version: "0.26.0" } }),
			),
		).toEqual({ status: "available", version: "0.26.0" })
	})

	it("shows the download as downloaded bytes over total bytes", () => {
		expect(
			toAboutUpdate(
				stateOf({
					host: { kind: "downloading", downloadedBytes: 30, totalBytes: 120 },
					offeredVersion: "0.26.0",
				}),
			),
		).toEqual({ status: "downloading", version: "0.26.0", progress: 25 })
	})

	it("carries the running companions into a ready restart", () => {
		expect(
			toAboutUpdate(
				stateOf({
					host: { kind: "readyToRestart", version: "0.26.0" },
					runningCompanions: 2,
				}),
			),
		).toEqual({ status: "ready", version: "0.26.0", runningCompanions: 2 })
	})

	it("names the version a failed download was fetching", () => {
		expect(
			toAboutUpdate(
				stateOf({
					host: { kind: "failed", message: "signature" },
					offeredVersion: "0.26.0",
				}),
			),
		).toEqual({ status: "failed", version: "0.26.0" })
	})

	it("keeps the last check on screen when a check failed", () => {
		expect(
			toAboutUpdate(stateOf({ host: { kind: "failed", message: "offline" } })),
		).toEqual({ status: "upToDate", checkedAt: 1_000 })
	})

	it("reads one state for the About tab and the sidebar badge", () => {
		const state = stateOf({
			host: { kind: "available", version: "0.26.0" },
			offeredVersion: "0.26.0",
		})

		expect(toAboutUpdate(state).status).toBe("available")
		expect(toUpdateBadgeProps({ state, busyBotCount: 0 }).status).toBe(
			"available",
		)
	})
})

describe("aboutFieldsOf", () => {
	it("shows nothing until the running version is known", () => {
		expect(
			aboutFieldsOf({
				updater: updaterOf(stateOf()),
				user: userOf(),
				runningVersion: null,
				onWhatsNew: vi.fn(),
				onReplayOnboarding,
			}),
		).toBeUndefined()
	})

	it("replays the onboarding from Getting started", () => {
		fieldsOf()?.gettingStarted?.onReplayOnboarding()

		expect(onReplayOnboarding).toHaveBeenCalledOnce()
	})

	it("shows the running version, the stored channel and the stored switch", () => {
		expect(fieldsOf()).toMatchObject({
			version: "0.25.0",
			channel: "beta",
			showsWhatsNew: false,
		})
	})

	it("falls back to stable with the switch on before the preferences are read", () => {
		expect(fieldsOf(undefined, userOf())).toMatchObject({
			channel: "stable",
			showsWhatsNew: true,
		})
	})

	it("checks, downloads and restarts through the updater", () => {
		const updater = updaterOf(stateOf())
		const fields = fieldsOf(updater)

		fields?.onCheck()
		fields?.onDownload()
		fields?.onRestart()

		expect(updater.controller.check).toHaveBeenCalledTimes(1)
		expect(updater.controller.install).toHaveBeenCalledTimes(1)
		expect(updater.controller.restart).toHaveBeenCalledTimes(1)
	})

	it("raises a notice when a check pressed here fails", async () => {
		const updater = updaterOf(
			stateOf({ host: { kind: "failed", message: "offline" } }),
		)

		fieldsOf(updater)?.onCheck()
		await vi.waitFor(() => expect(raiseReportedFailure).toHaveBeenCalled())
	})

	it("stores the channel and the switch", () => {
		const user = userOf()
		const fields = fieldsOf(undefined, user)

		fields?.onChannelChange("beta")
		fields?.onShowsWhatsNewChange(false)

		expect(user.controller.setUpdateChannel).toHaveBeenCalledWith("beta")
		expect(user.controller.setShowWhatsNew).toHaveBeenCalledWith(false)
	})

	it("raises a notice when storing a preference is refused", async () => {
		vi.mocked(raiseReportedFailure).mockClear()
		const user = userOf()
		vi.mocked(user.controller.setUpdateChannel).mockRejectedValue(
			new Error("disk"),
		)

		fieldsOf(undefined, user)?.onChannelChange("beta")

		await vi.waitFor(() => expect(raiseReportedFailure).toHaveBeenCalled())
	})

	it("opens the release page of the running version", () => {
		fieldsOf()?.onReleaseNotes()

		expect(openReleaseNotes).toHaveBeenCalledWith(
			"https://github.com/kiroshi-app/kiroshi-monorepo/releases/tag/v0.25.0",
		)
	})
})
