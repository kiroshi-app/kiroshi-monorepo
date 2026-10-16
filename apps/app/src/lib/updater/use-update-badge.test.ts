// @vitest-environment happy-dom

import { invoke } from "@tauri-apps/api/core"
import {
	cleanup,
	render,
	renderHook,
	screen,
	waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { UpdaterController, UpdaterState } from "./updater-controller"
import { useUpdateBadge } from "./use-update-badge"
import type { Updater } from "./use-updater"

import { raiseReportedFailure } from "../failure-report"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
vi.mock("../failure-report", async (importOriginal) => ({
	...(await importOriginal<typeof import("../failure-report")>()),
	raiseReportedFailure: vi.fn(),
}))

const hostInvoke = vi.mocked(invoke)

const OFFERED: UpdaterState = {
	host: { kind: "available", version: "1.4.0" },
	offeredVersion: "1.4.0",
	checkedAt: 0,
	runningCompanions: 0,
}

const updaterOf = (state: UpdaterState): Updater => ({
	state,
	controller: {
		getState: () => state,
		subscribe: () => () => undefined,
		start: () => () => undefined,
		check: vi.fn(async () => undefined),
		install: vi.fn(async () => undefined),
		restart: vi.fn(async () => undefined),
	} satisfies UpdaterController,
})

const releaseNotesAsked = () =>
	hostInvoke.mock.calls.filter(([command]) => command === "release_notes")
		.length

describe("useUpdateBadge", () => {
	beforeEach(() => {
		hostInvoke.mockReset()
		vi.mocked(raiseReportedFailure).mockClear()
	})

	afterEach(() => {
		cleanup()
	})

	it("stays silent and keeps offering the update when the release notes cannot be read", async () => {
		hostInvoke.mockRejectedValue({
			kind: "unavailable",
			version: "1.4.0",
			detail: "offline",
		})
		const updater = updaterOf(OFFERED)
		const mounted = renderHook(
			({ shown }) => useUpdateBadge({ updater: shown, working: {} }),
			{
				wrapper: createQueryTestWrapper().wrapper,
				initialProps: { shown: updater },
			},
		)
		await waitFor(() => expect(releaseNotesAsked()).toBe(1))

		mounted.rerender({ shown: updaterOf(OFFERED) })
		render(mounted.result.current)

		expect(raiseReportedFailure).not.toHaveBeenCalled()
		expect(screen.getByRole("button", { name: /update/i })).toBeTruthy()
	})
})
