import { describe, expect, it } from "vitest"

import { hasLastReadFailed, isReadErrorShown } from "./last-read"

import { HostRefused } from "@/lib/host/host-refused"

const OLDER_HOST_REFUSAL = new HostRefused(
	"this host knows no command named mission_list",
	null,
	"unknownCommand",
)

const settledWith = (error: unknown) => ({
	isError: true,
	error: error as Error,
	isPending: false,
	isFetching: false,
	errorUpdatedAt: 1,
})

describe("a read error shown inline", () => {
	it("leaves out the refusal of a host that knows no such command", () => {
		expect(isReadErrorShown(OLDER_HOST_REFUSAL)).toBe(false)
	})

	it.each([
		["a command the host keeps", new HostRefused("kept", null, "hostOnly")],
		["a host that broke", new HostRefused("the host broke", null)],
		["a failure of this Mac", new Error("disk full")],
		["a refusal that is no error", { kind: "unknownBot" }],
	])("shows %s", (_case, error) => {
		expect(isReadErrorShown(error)).toBe(true)
	})
})

describe("the last read of a query", () => {
	it("has not failed when an older host refused it", () => {
		expect(hasLastReadFailed(settledWith(OLDER_HOST_REFUSAL))).toBe(false)
	})

	it("has failed on any other error", () => {
		expect(hasLastReadFailed(settledWith(new Error("disk full")))).toBe(true)
	})

	it("still counts as failed while a read that failed is read again", () => {
		expect(
			hasLastReadFailed({
				isError: false,
				error: null,
				isPending: true,
				isFetching: true,
				errorUpdatedAt: 1,
			}),
		).toBe(true)
	})
})
