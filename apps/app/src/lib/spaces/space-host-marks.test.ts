import { describe, expect, it } from "vitest"

import { hostMarksOf, joinedRowIdOf } from "./joined-spaces-controller"
import { spaceHostMarksOf } from "./space-host-marks"

import type { HostingState, JoinedSpace } from "../bindings"
import type { JoinedHostState } from "../host/joined-hosts"

const GARAGE: JoinedSpace = {
	id: "joined-garage",
	hostUrl: "http://192.168.1.20:45367",
	remoteSpaceId: "garage",
	name: "Garage",
	state: "online",
	hostedBy: null,
	colour: 132,
	instanceId: "instance-of-joined-garage",
}

const ONLINE: HostingState = { kind: "online" }

const NOT_ONLINE: HostingState[] = [
	{ kind: "off" },
	{ kind: "connecting" },
	{ kind: "needsSignIn" },
	{ kind: "failed", failure: "takenOverByAnotherHost", detail: "" },
]

const NO_JOINED = { joinedSpaces: [], connections: {} }

describe("the host mark of every Space", () => {
	it("gives a Space hosted here without a member no mark, whatever its hosting", () => {
		expect(
			spaceHostMarksOf({
				sharedBySpaceId: { home: false },
				hostingBySpaceId: { home: ONLINE },
				...NO_JOINED,
			}),
		).toEqual({})
	})

	it("marks a Space hosted here with a member up while its hosting is online", () => {
		expect(
			spaceHostMarksOf({
				sharedBySpaceId: { home: true },
				hostingBySpaceId: { home: ONLINE },
				...NO_JOINED,
			}),
		).toEqual({ home: "up" })
	})

	it.each(NOT_ONLINE.map((hosting) => [hosting.kind, hosting] as const))(
		"marks a Space hosted here with a member down while its hosting is %s",
		(_kind, hosting) => {
			expect(
				spaceHostMarksOf({
					sharedBySpaceId: { home: true },
					hostingBySpaceId: { home: hosting },
					...NO_JOINED,
				}),
			).toEqual({ home: "down" })
		},
	)

	it("marks a Space hosted here with a member down until its hosting is read", () => {
		expect(
			spaceHostMarksOf({
				sharedBySpaceId: { home: true },
				hostingBySpaceId: {},
				...NO_JOINED,
			}),
		).toEqual({ home: "down" })
	})

	it("keeps the mark of a joined Space as its connection derives it", () => {
		const connections: Record<string, JoinedHostState> = {
			[GARAGE.id]: { status: "up" },
		}

		expect(
			spaceHostMarksOf({
				sharedBySpaceId: { home: true },
				hostingBySpaceId: { home: { kind: "off" } },
				joinedSpaces: [GARAGE],
				connections,
			}),
		).toEqual({
			home: "down",
			[joinedRowIdOf(GARAGE.id)]: "up",
			...hostMarksOf([GARAGE], connections),
		})
	})
})
