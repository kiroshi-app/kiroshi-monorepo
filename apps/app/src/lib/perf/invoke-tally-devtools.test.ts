import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const answerInvoke = vi.fn<(command: string) => Promise<null>>(() =>
	Promise.resolve(null),
)

const stubTauriWindow = () => {
	const internals = { invoke: answerInvoke }
	vi.stubGlobal("window", { __TAURI_INTERNALS__: internals })
	return internals
}

const loadDevtools = async (isDev: boolean) => {
	vi.stubEnv("DEV", isDev)
	vi.resetModules()
	return import("./invoke-tally-devtools")
}

const printedTables = () => vi.spyOn(console, "table")

beforeEach(() => {
	vi.spyOn(console, "info").mockImplementation(() => {})
	vi.spyOn(console, "table").mockImplementation(() => {})
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.unstubAllEnvs()
	vi.restoreAllMocks()
	answerInvoke.mockClear()
})

describe("invoke tally devtools", () => {
	it("counts local invokes, plugin commands included, and joined-host invokes", async () => {
		const internals = stubTauriWindow()
		const devtools = await loadDevtools(true)

		devtools.installInvokeTally()
		await internals.invoke("plugin:window|show")
		devtools.countInvoke("plugin:window|show")
		devtools.endInvokePhase("boot")

		expect(answerInvoke).toHaveBeenCalledWith("plugin:window|show")
		expect(printedTables()).toHaveBeenCalledWith([
			{ command: "plugin:window|show", count: 2 },
		])
	})

	it("counts nothing and leaves invoke untouched outside a dev build", async () => {
		const internals = stubTauriWindow()
		const devtools = await loadDevtools(false)

		devtools.installInvokeTally()
		await internals.invoke("space_list")
		devtools.countInvoke("space_list")
		devtools.startInvokePhase("thread open")
		devtools.endInvokePhase("thread open")

		expect(internals.invoke).toBe(answerInvoke)
		expect(printedTables()).not.toHaveBeenCalled()
	})
})
