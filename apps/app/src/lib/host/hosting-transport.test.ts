import { describe, expect, it } from "vitest"

import "@workspace/ui/lib/i18n"

import { type HostedSpace, hostingFailureOf } from "./hosting-transport"

import type { HostingFailureKind } from "../bindings"

const HOME: HostedSpace = { id: "home", name: "Home" }

const NOT_OWNER =
	"Another account hosts this space. Sign in with that account, or turn it on again to host it from this one."
const INSTANCE_GONE =
	"This space no longer exists on Kiroshi. Turn it on again to host it from this computer."
const DEVICE_REFUSED =
	"Someone chose Not me on another device, so this computer was signed out. Sign in again and approve it on a device you already use."
const DEVICE_AWAITING_APPROVAL =
	"This computer isn’t approved yet. Approve it on a device you already use, then turn it on again."
const KEYS_MISSING =
	"This computer couldn’t read the keys for this space. Quit Kiroshi, open it again, then turn hosting on again."
const TAKEN_OVER =
	"Another computer hosts this space now. Turn it on again to host it from this one."
const STREAM_CLOSED =
	"This computer stopped hosting this space. Turn hosting on again."
const UNKNOWN = "Check your connection and turn it on again."

const DESCRIPTION_OF_FAILURE: [HostingFailureKind, string][] = [
	["notOwner", NOT_OWNER],
	["instanceUnknownAfterReregistration", INSTANCE_GONE],
	["instanceGoneAfterReregistration", INSTANCE_GONE],
	["deviceRefused", DEVICE_REFUSED],
	["deviceAwaitingApproval", DEVICE_AWAITING_APPROVAL],
	["deviceKeysNotLoaded", KEYS_MISSING],
	["spaceKeyNotRead", KEYS_MISSING],
	["takenOverByAnotherHost", TAKEN_OVER],
	["localEventStreamClosed", STREAM_CLOSED],
	["localHostApiNotListening", UNKNOWN],
	["accountSessionStoreFailed", UNKNOWN],
	["sealingFailed", UNKNOWN],
	["databaseUnavailable", UNKNOWN],
]

describe("hostingFailureOf", () => {
	it.each(DESCRIPTION_OF_FAILURE)(
		"describes %s with its reason under the space title",
		(failure, description) => {
			expect(hostingFailureOf(HOME, failure)).toEqual({
				title: "Couldn’t host Home",
				description,
			})
		},
	)

	it("describes a failure without a kind with the unknown reason", () => {
		expect(hostingFailureOf(HOME)).toEqual({
			title: "Couldn’t host Home",
			description: UNKNOWN,
		})
	})
})
