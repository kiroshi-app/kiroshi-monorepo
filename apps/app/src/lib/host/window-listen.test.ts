import type { EventCallback } from "@tauri-apps/api/event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { listenOnThisWindow } from "./window-listen"

type Mounted = { label: string; event: string; handler: EventCallback<unknown> }

const windows = vi.hoisted(() => ({
	current: "A",
	mounted: [] as Mounted[],
}))

vi.mock("@tauri-apps/api/webviewWindow", () => ({
	getCurrentWebviewWindow: () => {
		const label = windows.current
		return {
			label,
			listen: async (event: string, handler: EventCallback<unknown>) => {
				const mounted = { label, event, handler }
				windows.mounted.push(mounted)
				return () => {
					windows.mounted.splice(windows.mounted.indexOf(mounted), 1)
				}
			},
		}
	},
}))

const EVENT = "join-link://opened"

const deliver = (
	event: string,
	payload: unknown,
	hears: (label: string) => boolean,
) =>
	windows.mounted
		.filter((mounted) => mounted.event === event && hears(mounted.label))
		.forEach((mounted) => {
			mounted.handler({ event, id: 1, payload })
		})

const emitTo = (target: string, event: string, payload: unknown) =>
	deliver(event, payload, (label) => label === target)

const emitToAll = (event: string, payload: unknown) =>
	deliver(event, payload, () => true)

const mountIn = (label: string, handler: EventCallback<unknown>) => {
	windows.current = label
	return listenOnThisWindow(EVENT, handler)
}

beforeEach(() => {
	windows.current = "A"
	windows.mounted = []
})

describe("listenOnThisWindow", () => {
	it("runs the handler of the window an event is targeted at, and only that one", async () => {
		const inA = vi.fn()
		const inB = vi.fn()
		await mountIn("A", inA)
		await mountIn("B", inB)

		emitTo("A", EVENT, "for-a")

		expect(inA).toHaveBeenCalledWith(
			expect.objectContaining({ payload: "for-a" }),
		)
		expect(inB).not.toHaveBeenCalled()
	})

	it("never runs a handler for an event targeted at another window", async () => {
		const inA = vi.fn()
		await mountIn("A", inA)

		emitTo("B", EVENT, "for-b")

		expect(inA).not.toHaveBeenCalled()
	})

	it("runs the handler of every window for an event sent to the whole app", async () => {
		const inA = vi.fn()
		const inB = vi.fn()
		await mountIn("A", inA)
		await mountIn("B", inB)

		emitToAll(EVENT, "for-all")

		expect(inA).toHaveBeenCalledOnce()
		expect(inB).toHaveBeenCalledOnce()
	})

	it("stops the handler once unsubscribed", async () => {
		const inA = vi.fn()
		const stop = await mountIn("A", inA)

		stop()
		emitTo("A", EVENT, "late")

		expect(inA).not.toHaveBeenCalled()
	})
})
