import { describe, expect, it } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import { joinRefusalNoticeOf } from "./join-refusal"

import type { JoinedSpaceError, JoinedSpaceWaitReason } from "../bindings"

const GENERIC_WAITING_DESCRIPTION = i18n.t(
	"chat:screen.notice.joinRefused.waitingForHost.description",
)

const waitingForHost = (reason: JoinedSpaceWaitReason): JoinedSpaceError => ({
	kind: "waitingForHost",
	id: "studio",
	instanceId: "instance-1",
	reason,
	detail: "relay said 502",
})

describe("joinRefusalNoticeOf", () => {
	it.each([
		"relayUnreachable",
		"rekeySendFailed",
		"hostSilent",
		"socketClosed",
		"rekeyNotVerified",
		"notMember",
		"unknownInstance",
		"deviceKeysUnreadable",
		"deviceAwaitingApproval",
		"socketUrlFailed",
		"rosterMissing",
		"keychainReadFailed",
	] satisfies JoinedSpaceWaitReason[])(
		"describes a join waiting for its host with the %s copy, never its detail",
		(reason) => {
			const { title, description } = joinRefusalNoticeOf(waitingForHost(reason))

			expect(title).toBe("Waiting for the host")
			expect(description).toBe(
				i18n.t(
					`chat:screen.notice.joinRefused.waitingForHost.reasons.${reason}`,
				),
			)
			expect(description).not.toBe(GENERIC_WAITING_DESCRIPTION)
			expect(description).not.toContain("relay said 502")
		},
	)

	it("keeps the generic waiting description when the refusal names no reason", () => {
		const { description } = joinRefusalNoticeOf({
			kind: "waitingForHost",
			id: "studio",
			instanceId: "instance-1",
			detail: "relay said 502",
		} as JoinedSpaceError)

		expect(description).toBe(GENERIC_WAITING_DESCRIPTION)
	})
})
