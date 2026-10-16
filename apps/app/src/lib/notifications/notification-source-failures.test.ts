import { expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { createFailWith } from "./notification-source-failures"

import { hostOfflineOf } from "../host/host-offline"

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

it("raises nothing for a joined host that is offline", () => {
	const reportFailure = vi.fn()

	createFailWith(reportFailure)("send")(hostOfflineOf("gone"))

	expect(reportFailure).not.toHaveBeenCalled()
})
