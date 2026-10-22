// @vitest-environment happy-dom

import { invoke } from "@tauri-apps/api/core"
import { cleanup, render, renderHook, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { UpdaterController, UpdaterState } from "./updater-controller"
import { useUpdateBadge } from "./use-update-badge"
import type { Updater } from "./use-updater"

import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

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
	})

	afterEach(() => {
		cleanup()
	})

	it("offers the update without reading its release notes", () => {
		const mounted = renderHook(
			() => useUpdateBadge({ updater: updaterOf(OFFERED), working: {} }),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		render(mounted.result.current)

		expect(releaseNotesAsked()).toBe(0)
		expect(screen.getByRole("button", { name: /update/i })).toBeTruthy()
	})
})
