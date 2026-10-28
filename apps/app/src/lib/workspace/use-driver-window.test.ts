// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useDriverWindow } from "./use-driver-window"

import type { LiveWindowsWatch } from "../host"

const host = vi.hoisted(() => ({
	label: "window-1",
	watch: null as LiveWindowsWatch | null,
}))

vi.mock("../host", () => ({
	currentWindowLabel: () => host.label,
	watchLiveWindows: async (watch: LiveWindowsWatch) => {
		host.watch = watch
		return () => {
			host.watch = null
		}
	},
}))

const openWindows = async (...labels: string[]) => {
	await act(async () => host.watch?.report(labels))
}

const mountIn = async (label: string) => {
	host.label = label
	const mounted = renderHook(() => useDriverWindow(label === "main"))
	await act(async () => undefined)
	return mounted
}

describe("useDriverWindow", () => {
	beforeEach(() => {
		host.watch = null
	})

	afterEach(cleanup)

	it("drives from the main window without watching the others", async () => {
		const { result } = await mountIn("main")

		expect(result.current).toBe(true)
		expect(host.watch).toBeNull()
	})

	it("leaves the drivers to the main window while it is open", async () => {
		const { result } = await mountIn("window-1")

		await openWindows("main", "window-1")

		expect(result.current).toBe(false)
	})

	it("takes the drivers over once the main window is gone", async () => {
		const { result } = await mountIn("window-1")
		await openWindows("main", "window-1", "window-2")

		await openWindows("window-1", "window-2")

		expect(result.current).toBe(true)
	})

	it("leaves the drivers to the first secondary window when the main window is gone", async () => {
		const { result } = await mountIn("window-2")

		await openWindows("window-1", "window-2", "dispatcher")

		expect(result.current).toBe(false)
	})

	it("hands the drivers back once the main window reopens", async () => {
		const { result } = await mountIn("window-1")
		await openWindows("window-1")

		await openWindows("main", "window-1")

		expect(result.current).toBe(false)
	})

	it("stops watching the windows on unmount", async () => {
		const { unmount } = await mountIn("window-1")

		unmount()
		await act(async () => undefined)

		expect(host.watch).toBeNull()
	})
})
