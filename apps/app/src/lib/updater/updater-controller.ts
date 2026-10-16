import type { HostUpdateState, UpdaterPort } from "./updater-port"

import { createStore } from "../store"

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

const FOCUS_CHECK_MIN_GAP_MS = 4 * 60 * 60 * 1000

export type UpdaterState = {
	host: HostUpdateState
	offeredVersion: string | null
	checkedAt: number
	runningCompanions: number
}

export type UpdaterController = {
	getState: () => UpdaterState
	subscribe: (listener: () => void) => () => void
	start: () => () => void
	check: () => Promise<void>
	install: () => Promise<void>
	restart: () => Promise<void>
}

type ReadyHost = Extract<HostUpdateState, { kind: "readyToRestart" }>

export type ReportUpdaterFailure = (failure: unknown) => void

const BUSY_KINDS: ReadonlySet<HostUpdateState["kind"]> = new Set([
	"checking",
	"downloading",
	"readyToRestart",
])

const isSameState = (left: UpdaterState, right: UpdaterState): boolean =>
	JSON.stringify(left) === JSON.stringify(right)

const offeredVersionAfter = (
	host: HostUpdateState,
	offeredVersion: string | null,
): string | null => {
	if (host.kind === "checking") {
		return null
	}
	if (host.kind === "available" || host.kind === "readyToRestart") {
		return host.version
	}
	return offeredVersion
}

const stateAfter = (
	state: UpdaterState,
	host: HostUpdateState,
): UpdaterState => ({
	...state,
	host,
	offeredVersion: offeredVersionAfter(host, state.offeredVersion),
	checkedAt: host.kind === "upToDate" ? Date.now() : state.checkedAt,
})

export const createUpdaterController = (
	port: UpdaterPort,
	reportFailure: ReportUpdaterFailure,
): UpdaterController => {
	const stateStore = createStore<UpdaterState>({
		host: { kind: "checking" },
		offeredVersion: null,
		checkedAt: Date.now(),
		runningCompanions: 0,
	})
	const current = stateStore.getState
	let lastCheckAt = 0
	let countingFor: string | null = null

	const publish = (next: UpdaterState) => {
		if (isSameState(current(), next)) {
			return
		}
		stateStore.setState(next)
	}

	const isLandedReady = (version: string) => {
		const { host } = current()
		return host.kind === "readyToRestart" && host.version === version
	}

	const countRunningCompanions = () =>
		port.countRunningCompanions().catch((failure: unknown) => {
			reportFailure(failure)
			return current().runningCompanions
		})

	const landReady = async (host: ReadyHost) => {
		if (countingFor === host.version || isLandedReady(host.version)) {
			return
		}
		countingFor = host.version
		const runningCompanions = await countRunningCompanions()
		countingFor = null
		publish({ ...stateAfter(current(), host), runningCompanions })
	}

	const land = (host: HostUpdateState) => {
		if (host.kind === "readyToRestart") {
			void landReady(host)
			return
		}
		publish(stateAfter(current(), host))
	}

	const settle = (command: () => Promise<HostUpdateState>) =>
		command().then(land, reportFailure)

	const check = () => {
		lastCheckAt = Date.now()
		return settle(port.check)
	}

	const checkOnFocus = () => {
		const isBusy = BUSY_KINDS.has(current().host.kind)
		if (isBusy || Date.now() - lastCheckAt < FOCUS_CHECK_MIN_GAP_MS) {
			return
		}
		void check()
	}

	const install = async () => {
		if (current().host.kind === "failed") {
			await check()
		}
		if (current().host.kind !== "available") {
			return
		}
		await settle(port.install)
	}

	const restart = async () => {
		if (current().host.kind !== "readyToRestart") {
			return
		}
		await port.restart().catch(reportFailure)
	}

	const watch = () => {
		const watching = port.watch(land).catch((failure: unknown) => {
			reportFailure(failure)
			return () => undefined
		})
		return () => {
			void watching.then((stopWatching) => stopWatching())
		}
	}

	return {
		getState: current,

		subscribe: stateStore.subscribe,

		start: () => {
			const stopWatching = watch()
			void check()
			const timer = setInterval(() => {
				void check()
			}, CHECK_INTERVAL_MS)
			window.addEventListener("focus", checkOnFocus)
			return () => {
				stopWatching()
				clearInterval(timer)
				window.removeEventListener("focus", checkOnFocus)
			}
		},

		check,
		install,
		restart,
	}
}
