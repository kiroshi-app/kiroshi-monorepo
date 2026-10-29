import { describe, expect, it } from "vitest"

import {
	connectFailureOf,
	exitDetailOf,
	isNotRunning,
} from "./onboarding-failure"

const NAMED_KINDS = [
	"alreadyRunning",
	"notRunning",
	"cancelled",
	"timedOut",
	"refusedUrl",
	"flowTimedOut",
	"notAuthenticated",
	"binaryNotFound",
	"spawnFailed",
	"startupTimeout",
	"crashed",
]

const A_CAMEL_CASE_TOKEN = /[a-z][A-Z]/

const AN_UNCONTRACTED_NEGATION = /\b(could|did|was|is) not\b/

const CONTRACTED_SENTENCES = [
	["binaryNotFound", "the agent binary wasn’t found"],
	["spawnFailed", "the agent couldn’t be started"],
	["startupTimeout", "the agent didn’t start in time"],
]

describe("the exit detail of a failure", () => {
	it("shows the detail a failure carries", () => {
		expect(
			exitDetailOf({ kind: "crashed", detail: "exited with code 1" }),
		).toBe("exited with code 1")
	})

	it.each(NAMED_KINDS)("says %s in words", (kind) => {
		const detail = exitDetailOf({ kind })

		expect(detail).not.toBe(kind)
		expect(detail).not.toMatch(A_CAMEL_CASE_TOKEN)
		expect(detail).not.toMatch(AN_UNCONTRACTED_NEGATION)
	})

	it.each(CONTRACTED_SENTENCES)(
		"contracts the negation of %s",
		(kind, sentence) => {
			expect(exitDetailOf({ kind })).toBe(sentence)
		},
	)

	it("says in words a kind it does not know", () => {
		const detail = exitDetailOf({ kind: "staleRuntimeSession" })

		expect(detail).not.toMatch(A_CAMEL_CASE_TOKEN)
	})

	it("reads the message of a raw refusal", () => {
		expect(exitDetailOf(new Error("the bridge is down"))).toBe(
			"the bridge is down",
		)
	})

	it("says in words a refusal that names nothing", () => {
		expect(exitDetailOf(undefined)).not.toMatch(A_CAMEL_CASE_TOKEN)
		expect(exitDetailOf(undefined)).not.toMatch(AN_UNCONTRACTED_NEGATION)
	})

	it("knows the sign-in that is no longer running", () => {
		expect(isNotRunning({ kind: "notRunning" })).toBe(true)
		expect(isNotRunning({ kind: "cancelled" })).toBe(false)
	})
})

describe("the failure the connect screen names", () => {
	it.each([
		["cancelled", "cancelled"],
		["timedOut", "timedOut"],
		["flowTimedOut", "timedOut"],
		["startupTimeout", "timedOut"],
		["refusedUrl", "linkRefused"],
		["binaryNotFound", "agentMissing"],
		["spawnFailed", "agentMissing"],
	])("names a %s refusal as %s", (kind, failure) => {
		expect(connectFailureOf({ kind })).toBe(failure)
	})

	it("names any other refusal as a cancelled sign-in to try again", () => {
		expect(connectFailureOf({ kind: "crashed" })).toBe("cancelled")
		expect(connectFailureOf(new Error("socket closed"))).toBe("cancelled")
	})
})
