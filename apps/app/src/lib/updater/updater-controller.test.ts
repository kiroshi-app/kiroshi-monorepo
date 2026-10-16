import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type Mock,
	vi,
} from "vitest"

import {
	createUpdaterController,
	type ReportUpdaterFailure,
} from "./updater-controller"
import type { HostUpdateState, UpdaterPort } from "./updater-port"

const SIX_HOURS_MS = 6 * 60 * 60 * 1000
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000

const UP_TO_DATE: HostUpdateState = { kind: "upToDate" }
const OFFERED: HostUpdateState = { kind: "available", version: "1.4.0" }
const READY: HostUpdateState = { kind: "readyToRestart", version: "1.4.0" }
const FAILED: HostUpdateState = { kind: "failed", message: "offline" }

type FakeHost = {
	port: UpdaterPort
	emit: (state: HostUpdateState) => void
	isWatched: () => boolean
}

const fakeHostOf = (overrides: Partial<UpdaterPort> = {}): FakeHost => {
	const listeners = new Set<(state: HostUpdateState) => void>()
	const port: UpdaterPort = {
		check: vi.fn(async () => UP_TO_DATE),
		install: vi.fn(async () => READY),
		countRunningCompanions: vi.fn(async () => 0),
		restart: vi.fn(async () => undefined),
		watch: async (onChange) => {
			listeners.add(onChange)
			return () => listeners.delete(onChange)
		},
		...overrides,
	}
	return {
		port,
		emit: (state) => {
			for (const listener of listeners) listener(state)
		},
		isWatched: () => listeners.size > 0,
	}
}

const settle = () => vi.advanceTimersByTimeAsync(0)

const stubWindow = () => {
	const listeners = new Set<() => void>()

	vi.stubGlobal("window", {
		addEventListener: (_: string, listener: () => void) => {
			listeners.add(listener)
		},
		removeEventListener: (_: string, listener: () => void) => {
			listeners.delete(listener)
		},
	})

	return () => {
		for (const listener of listeners) {
			listener()
		}
		return settle()
	}
}

describe("createUpdaterController", () => {
	let focusWindow: ReturnType<typeof stubWindow>
	let reportFailure: Mock<ReportUpdaterFailure>

	beforeEach(() => {
		vi.useFakeTimers()
		focusWindow = stubWindow()
		reportFailure = vi.fn<ReportUpdaterFailure>()
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	const controllerOf = (host: FakeHost) =>
		createUpdaterController(host.port, reportFailure)

	it("checks once when the launch starts", async () => {
		const host = fakeHostOf()
		const controller = controllerOf(host)

		controller.start()
		await settle()

		expect(host.port.check).toHaveBeenCalledTimes(1)
		expect(controller.getState().host).toEqual(UP_TO_DATE)
	})

	it("dates the check that found this build current", async () => {
		vi.setSystemTime(1_000)
		const controller = controllerOf(fakeHostOf())

		vi.setSystemTime(5_000)
		await controller.check()

		expect(controller.getState().checkedAt).toBe(5_000)
	})

	it("remembers the version a check offered", async () => {
		const controller = controllerOf(
			fakeHostOf({ check: vi.fn(async () => OFFERED) }),
		)

		await controller.check()

		expect(controller.getState().offeredVersion).toBe("1.4.0")
	})

	it("follows every state the host announces", async () => {
		const host = fakeHostOf()
		const controller = controllerOf(host)
		controller.start()
		await settle()

		host.emit(OFFERED)
		expect(controller.getState().host).toEqual(OFFERED)

		const downloading: HostUpdateState = {
			kind: "downloading",
			downloadedBytes: 10,
			totalBytes: 100,
		}
		host.emit(downloading)
		expect(controller.getState().host).toEqual(downloading)
		expect(controller.getState().offeredVersion).toBe("1.4.0")
	})

	it("forgets the offered version when a new check starts", async () => {
		const host = fakeHostOf({ check: vi.fn(async () => OFFERED) })
		const controller = controllerOf(host)
		controller.start()
		await settle()

		host.emit({ kind: "checking" })

		expect(controller.getState().offeredVersion).toBeNull()
	})

	it("stops following the host once the launch lets go", async () => {
		const host = fakeHostOf()
		const stop = controllerOf(host).start()
		await settle()

		stop()
		await settle()

		expect(host.isWatched()).toBe(false)
	})

	it("reports a host it cannot listen to", async () => {
		const refusal = new Error("no event bridge")
		const host = fakeHostOf({ watch: () => Promise.reject(refusal) })

		controllerOf(host).start()
		await settle()

		expect(reportFailure).toHaveBeenCalledWith(refusal)
	})

	it("checks again every six hours", async () => {
		const host = fakeHostOf()
		controllerOf(host).start()

		await vi.advanceTimersByTimeAsync(SIX_HOURS_MS)
		expect(host.port.check).toHaveBeenCalledTimes(2)

		await vi.advanceTimersByTimeAsync(SIX_HOURS_MS)
		expect(host.port.check).toHaveBeenCalledTimes(3)
	})

	it("stops checking once the launch lets go", async () => {
		const host = fakeHostOf()
		const stop = controllerOf(host).start()

		stop()
		await vi.advanceTimersByTimeAsync(SIX_HOURS_MS * 3)

		expect(host.port.check).toHaveBeenCalledTimes(1)
	})

	it("checks again when the window is read after four hours", async () => {
		const host = fakeHostOf()
		controllerOf(host).start()

		await vi.advanceTimersByTimeAsync(FOUR_HOURS_MS)
		await focusWindow()

		expect(host.port.check).toHaveBeenCalledTimes(2)
	})

	it("checks nothing for a window read back within the four hours", async () => {
		const host = fakeHostOf()
		controllerOf(host).start()

		await vi.advanceTimersByTimeAsync(FOUR_HOURS_MS - 1000)
		await focusWindow()

		expect(host.port.check).toHaveBeenCalledTimes(1)
	})

	it("leaves a running download alone when the window is read again", async () => {
		const host = fakeHostOf()
		controllerOf(host).start()
		await settle()

		host.emit({ kind: "downloading", downloadedBytes: 0, totalBytes: null })
		await vi.advanceTimersByTimeAsync(FOUR_HOURS_MS)
		await focusWindow()

		expect(host.port.check).toHaveBeenCalledTimes(1)
	})

	it("leaves an install waiting for a restart alone when the window is read again", async () => {
		const host = fakeHostOf()
		controllerOf(host).start()
		await settle()

		host.emit(READY)
		await vi.advanceTimersByTimeAsync(FOUR_HOURS_MS)
		await focusWindow()

		expect(host.port.check).toHaveBeenCalledTimes(1)
	})

	it("stops listening to the window once the launch lets go", async () => {
		const host = fakeHostOf()
		const stop = controllerOf(host).start()

		stop()
		await vi.advanceTimersByTimeAsync(FOUR_HOURS_MS)
		await focusWindow()

		expect(host.port.check).toHaveBeenCalledTimes(1)
	})

	it("reports a check the host refused and keeps the previous state", async () => {
		const refusal = new Error("ipc closed")
		const controller = controllerOf(
			fakeHostOf({ check: vi.fn(() => Promise.reject(refusal)) }),
		)
		const before = controller.getState()

		await controller.check()

		expect(reportFailure).toHaveBeenCalledWith(refusal)
		expect(controller.getState()).toEqual(before)
	})

	it("installs the offered release", async () => {
		const host = fakeHostOf({ check: vi.fn(async () => OFFERED) })
		const controller = controllerOf(host)
		await controller.check()

		await controller.install()

		expect(host.port.install).toHaveBeenCalledTimes(1)
	})

	it("installs nothing while no release is offered", async () => {
		const host = fakeHostOf()
		const controller = controllerOf(host)
		await controller.check()

		await controller.install()

		expect(host.port.install).not.toHaveBeenCalled()
	})

	it("checks again before downloading a release whose download failed", async () => {
		const check = vi
			.fn<UpdaterPort["check"]>()
			.mockResolvedValueOnce(FAILED)
			.mockResolvedValueOnce(OFFERED)
		const host = fakeHostOf({ check })
		const controller = controllerOf(host)
		await controller.check()

		await controller.install()

		expect(check).toHaveBeenCalledTimes(2)
		expect(host.port.install).toHaveBeenCalledTimes(1)
	})

	it("reports an install the host refused and keeps the offer on screen", async () => {
		const refusal = new Error("ipc closed")
		const controller = controllerOf(
			fakeHostOf({
				check: vi.fn(async () => OFFERED),
				install: vi.fn(() => Promise.reject(refusal)),
			}),
		)
		await controller.check()

		await controller.install()

		expect(reportFailure).toHaveBeenCalledWith(refusal)
		expect(controller.getState().host).toEqual(OFFERED)
	})

	it("counts the running companions when the restart becomes ready", async () => {
		const host = fakeHostOf({
			check: vi.fn(async () => OFFERED),
			countRunningCompanions: vi.fn(async () => 2),
		})
		const controller = controllerOf(host)
		await controller.check()

		await controller.install()
		await settle()

		expect(controller.getState().host).toEqual(READY)
		expect(controller.getState().runningCompanions).toBe(2)
	})

	it("counts the running companions once for a ready state heard twice", async () => {
		const host = fakeHostOf({ check: vi.fn(async () => OFFERED) })
		const controller = controllerOf(host)
		controller.start()
		await settle()

		host.emit(READY)
		await controller.install()
		await settle()

		expect(host.port.countRunningCompanions).toHaveBeenCalledTimes(1)
	})

	it("lands the ready state with the last count when counting fails", async () => {
		const refusal = new Error("agent unreachable")
		const host = fakeHostOf({
			countRunningCompanions: vi.fn(() => Promise.reject(refusal)),
		})
		const controller = controllerOf(host)
		controller.start()
		await settle()

		host.emit(READY)
		await settle()

		expect(reportFailure).toHaveBeenCalledWith(refusal)
		expect(controller.getState().host).toEqual(READY)
		expect(controller.getState().runningCompanions).toBe(0)
	})

	it("starts the installed build when asked", async () => {
		const host = fakeHostOf()
		const controller = controllerOf(host)
		controller.start()
		await settle()
		host.emit(READY)
		await settle()

		await controller.restart()

		expect(host.port.restart).toHaveBeenCalledTimes(1)
	})

	it("starts nothing while no install has landed", async () => {
		const host = fakeHostOf()
		const controller = controllerOf(host)

		await controller.restart()

		expect(host.port.restart).not.toHaveBeenCalled()
	})

	it("reports a restart the process refused", async () => {
		const refusal = new Error("relaunch refused")
		const host = fakeHostOf({ restart: vi.fn(() => Promise.reject(refusal)) })
		const controller = controllerOf(host)
		controller.start()
		await settle()
		host.emit(READY)
		await settle()

		await controller.restart()

		expect(reportFailure).toHaveBeenCalledWith(refusal)
	})

	it("tells its readers only when something changed", async () => {
		const host = fakeHostOf({ check: vi.fn(async () => OFFERED) })
		const controller = controllerOf(host)
		const listener = vi.fn()
		controller.subscribe(listener)

		await controller.check()
		host.emit(OFFERED)
		await controller.check()

		expect(listener).toHaveBeenCalledTimes(1)
	})
})
