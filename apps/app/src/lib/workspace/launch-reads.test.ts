import { describe, expect, it } from "vitest"

import { haveLaunchReadsSettled } from "./launch-reads"

const LOCAL_ROW = "personal"
const JOINED_ROW = "joined:joined-personal"

const settledLocalLaunch = {
	hasLoadedPreferences: true,
	roster: { hasLoaded: true, isRosterPending: false, spaceRowId: LOCAL_ROW },
}

describe("haveLaunchReadsSettled", () => {
	it("is settled once preferences, the Spaces list and the first roster page of a local Space have answered", () => {
		expect(haveLaunchReadsSettled(settledLocalLaunch)).toBe(true)
	})

	it("waits for preferences", () => {
		expect(
			haveLaunchReadsSettled({
				...settledLocalLaunch,
				hasLoadedPreferences: false,
			}),
		).toBe(false)
	})

	it("waits for the Spaces list to hand the roster its Spaces", () => {
		expect(
			haveLaunchReadsSettled({
				...settledLocalLaunch,
				roster: { hasLoaded: false, isRosterPending: false, spaceRowId: null },
			}),
		).toBe(false)
	})

	it("waits for the first roster page of a local Space", () => {
		expect(
			haveLaunchReadsSettled({
				...settledLocalLaunch,
				roster: { ...settledLocalLaunch.roster, isRosterPending: true },
			}),
		).toBe(false)
	})

	it("never waits for the roster of a joined Space, whose host may be unreachable", () => {
		expect(
			haveLaunchReadsSettled({
				...settledLocalLaunch,
				roster: {
					hasLoaded: true,
					isRosterPending: true,
					spaceRowId: JOINED_ROW,
				},
			}),
		).toBe(true)
	})
})
