// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
	type CompanionSettings,
	useCompanionSettings,
} from "./use-companion-settings"

import {
	joinFakeHost,
	leaveFakeHost,
	reopenFakeRelay,
} from "../host/fake-joined-hosts"

vi.mock("../host", async (importOriginal) => ({
	...(await importOriginal<typeof import("../host")>()),
	...(await import("../host/fake-joined-hosts")).fakeHostModule,
}))

const JOINED = "garage"

afterEach(async () => {
	cleanup()
	await leaveFakeHost(JOINED)
})

const opener = () => vi.fn(() => Promise.resolve())

const reloadable = () => ({ open: opener(), reload: opener() })

const panelsOf = () => ({
	plugin: reloadable(),
})

type Panels = ReturnType<typeof panelsOf>

const readCounts = (panels: Panels) =>
	Object.values(panels).map(
		(panel) => panel.open.mock.calls.length + panel.reload.mock.calls.length,
	)

const mounted = (panels: Panels, isOpen: boolean) =>
	renderHook(
		({ isOpen: opened }: Pick<CompanionSettings, "isOpen">) =>
			useCompanionSettings({
				...panels,
				companionId: "scribe",
				spaceId: "personal",
				isOpen: opened,
			}),
		{ initialProps: { isOpen } },
	)

describe("useCompanionSettings", () => {
	it("reads every companion panel when the settings dialog opens", () => {
		const panels = panelsOf()

		mounted(panels, true)

		expect(readCounts(panels)).toEqual([1])
		expect(panels.plugin.open).toHaveBeenCalledWith({
			kind: "bot",
			id: "scribe",
		})
	})

	it("reads none of them while the settings dialog is closed", () => {
		const panels = panelsOf()

		mounted(panels, false)

		expect(readCounts(panels)).toEqual([0])
	})

	it("reads them again on a second opening on the same companion", () => {
		const panels = panelsOf()
		const rendered = mounted(panels, true)

		rendered.rerender({ isOpen: false })
		rendered.rerender({ isOpen: true })

		expect(readCounts(panels)).toEqual([2])
	})

	it("reads them again when the relay of the joined Space reopens", async () => {
		const panels = panelsOf()
		await joinFakeHost(JOINED)
		mounted(panels, true)

		reopenFakeRelay(JOINED)

		expect(readCounts(panels)).toEqual([2])
	})

	it("reads nothing more when the relay of another Space reopens", async () => {
		const panels = panelsOf()
		await joinFakeHost(JOINED)
		mounted(panels, true)

		reopenFakeRelay("attic")

		expect(readCounts(panels)).toEqual([1])
	})

	it("reads nothing more once the settings dialog has closed", async () => {
		const panels = panelsOf()
		await joinFakeHost(JOINED)
		const rendered = mounted(panels, true)
		rendered.rerender({ isOpen: false })

		reopenFakeRelay(JOINED)

		expect(readCounts(panels)).toEqual([1])
	})
})
