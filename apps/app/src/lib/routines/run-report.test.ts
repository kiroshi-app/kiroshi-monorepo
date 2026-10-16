import { beforeEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import { readReportedCauses } from "./run-report"

import { hostOfflineOf } from "../host/host-offline"

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(),
}))

const causesRefusedWith = (reason: unknown) =>
	readReportedCauses({
		read: () => Promise.reject(reason),
		conversationId: "conversation-1",
		description: "the causes stayed unread",
	})

describe("reading the reported causes", () => {
	beforeEach(() => vi.mocked(raiseFailureNotice).mockClear())

	it("raises its own notice when the causes cannot be read", async () => {
		await expect(causesRefusedWith(new Error("no causes"))).resolves.toBeNull()

		await vi.waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledOnce())
	})

	it("raises no notice of its own when the host of the space is offline", async () => {
		await expect(
			causesRefusedWith(hostOfflineOf("the host of this space is offline")),
		).resolves.toBeNull()

		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})
})
