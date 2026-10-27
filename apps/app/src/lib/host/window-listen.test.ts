// @vitest-environment happy-dom
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { listenOnThisWindow } from "./window-listen"

type ListenArgs = { target: unknown }

let listenTargets: unknown[] = []

beforeEach(() => {
	listenTargets = []
	mockWindows("A")
	mockIPC((command, args) => {
		if (command === "plugin:event|listen") {
			listenTargets.push((args as ListenArgs).target)
		}
		return 1
	})
})

afterEach(() => {
	clearMocks()
})

describe("listenOnThisWindow", () => {
	it("registers the listener on the current window only", async () => {
		await listenOnThisWindow("join-link://opened", () => undefined)

		expect(listenTargets).toEqual([{ kind: "WebviewWindow", label: "A" }])
	})
})
