import { describe, expect, it } from "vitest"

import { GIT_CLIFF_BODY_0_24_2 } from "@workspace/ui/components/release-notes.fixtures"

import { toUpdateBadgeProps } from "./badge-model"
import type { UpdaterState } from "./updater-controller"

const stateOf = (overrides: Partial<UpdaterState> = {}): UpdaterState => ({
	host: { kind: "upToDate" },
	offeredVersion: null,
	checkedAt: 0,
	runningCompanions: 0,
	...overrides,
})

const propsOf = (state: UpdaterState, notes: string | null = null) =>
	toUpdateBadgeProps({ state, notes, busyBotCount: 0 })

describe("toUpdateBadgeProps", () => {
	it("shows nothing while this build is the current one", () => {
		expect(propsOf(stateOf()).status).toBe("idle")
	})

	it("shows nothing while a check runs", () => {
		expect(propsOf(stateOf({ host: { kind: "checking" } })).status).toBe("idle")
	})

	it("offers a release nothing has started downloading", () => {
		const props = propsOf(
			stateOf({
				host: { kind: "available", version: "1.4.0" },
				offeredVersion: "1.4.0",
			}),
		)

		expect(props.status).toBe("available")
		expect(props.version).toBe("1.4.0")
	})

	it("reports the download as a share of its total bytes", () => {
		const props = propsOf(
			stateOf({
				host: { kind: "downloading", downloadedBytes: 42, totalBytes: 100 },
				offeredVersion: "1.4.0",
			}),
		)

		expect(props.status).toBe("downloading")
		expect(props.progress).toBe(42)
	})

	it("reports no progress while the total size is unknown", () => {
		const props = propsOf(
			stateOf({
				host: { kind: "downloading", downloadedBytes: 42, totalBytes: null },
			}),
		)

		expect(props.progress).toBe(0)
	})

	it("asks for a restart once the install has landed", () => {
		const props = propsOf(
			stateOf({
				host: { kind: "readyToRestart", version: "1.4.0" },
				offeredVersion: "1.4.0",
			}),
		)

		expect(props.status).toBe("ready")
		expect(props.version).toBe("1.4.0")
	})

	it("offers the download again when it failed", () => {
		const props = propsOf(
			stateOf({
				host: { kind: "failed", message: "signature refused" },
				offeredVersion: "1.4.0",
			}),
		)

		expect(props.status).toBe("error")
	})

	it("hands the release notes down as the raw body", () => {
		const props = propsOf(
			stateOf({
				host: { kind: "available", version: "1.4.0" },
				offeredVersion: "1.4.0",
			}),
			GIT_CLIFF_BODY_0_24_2,
		)

		expect(props.releaseNotes).toBe(GIT_CLIFF_BODY_0_24_2)
	})

	it("links the release page of the offered version", () => {
		const props = propsOf(
			stateOf({
				host: { kind: "available", version: "1.4.0" },
				offeredVersion: "1.4.0",
			}),
		)

		expect(props.releaseNotesUrl).toBe(
			"https://github.com/shoto290/kiroshi-monorepo/releases/tag/v1.4.0",
		)
	})

	it("links nothing while no version is offered", () => {
		expect(propsOf(stateOf()).releaseNotesUrl).toBeUndefined()
	})
})
