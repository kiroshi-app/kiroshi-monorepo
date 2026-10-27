// @vitest-environment happy-dom
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { listenOnThisWindow } from "./window-listen"

type IpcCall = { command: string; args: unknown }

const EVENT = "join-link://opened"

let calls: IpcCall[] = []

const listenTargets = () =>
	calls
		.filter(({ command }) => command === "plugin:event|listen")
		.map(({ args }) => (args as { target: unknown }).target)

beforeEach(() => {
	calls = []
	mockWindows("A", "B")
	mockIPC((command, args) => {
		calls.push({ command, args })
		return 1
	})
})

afterEach(() => {
	clearMocks()
})

describe("listenOnThisWindow", () => {
	it("registers the listener on the current window only", async () => {
		await listenOnThisWindow(EVENT, () => undefined)

		expect(listenTargets()).toEqual([{ kind: "WebviewWindow", label: "A" }])
	})
})
