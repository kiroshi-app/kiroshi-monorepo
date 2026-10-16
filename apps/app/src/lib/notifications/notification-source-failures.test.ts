import { expect, it, vi } from "vitest"

import { createFailWith } from "./notification-source-failures"

const descriptionRaisedFor = (reason: unknown) => {
	const reportFailure = vi.fn()
	createFailWith(reportFailure)("send")(reason)
	return reportFailure.mock.calls[0]?.[0]?.description
}

it("shows the message of an Error", () => {
	expect(descriptionRaisedFor(new Error("no listener"))).toBe("no listener")
})

it("shows a sentence built from the kind and message of a command error", () => {
	expect(
		descriptionRaisedFor({ kind: "unavailable", message: "opening" }),
	).toBe("unavailable: opening")
})

it("shows a serialized form of any other object, never [object Object]", () => {
	expect(descriptionRaisedFor({ code: 28 })).toBe('{"code":28}')
})
