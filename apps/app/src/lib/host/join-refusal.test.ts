import { describe, expect, it } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import {
	joinRefusalNoticeOf,
	joinRejectionNoticeOf,
	unexpectedJoinNotice,
} from "./join-refusal"

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

const STUDIO_NAMING = { space: "Studio", host: "Lea" }

const UNNAMED_WORDS = ["the host", "this space"]

const textOf = ({
	title,
	description,
}: {
	title: string
	description?: string
}) => `${title} ${description ?? ""}`

describe("a notice naming its joined space", () => {
	it("names the host in the waiting title and reason line", () => {
		const notice = joinRefusalNoticeOf(
			waitingForHost("hostSilent"),
			STUDIO_NAMING,
		)

		expect(notice.title).toBe("Waiting for Lea")
		expect(notice.description).toBe(
			"This space isn’t open yet, Lea hasn’t let this computer in. Ask them to open Kiroshi on their computer.",
		)
		for (const word of UNNAMED_WORDS) {
			expect(textOf(notice)).not.toContain(word)
		}
	})

	it("names the space in the unexpected title", () => {
		const notice = unexpectedJoinNotice(STUDIO_NAMING)

		expect(notice.title).toBe("Something went wrong with Studio")
		for (const word of UNNAMED_WORDS) {
			expect(textOf(notice)).not.toContain(word)
		}
	})

	it("names the space of an unexpected rejection", () => {
		expect(joinRejectionNoticeOf(new Error("boom"), STUDIO_NAMING).title).toBe(
			"Something went wrong with Studio",
		)
	})

	it("falls back to the host when only the space is known", () => {
		const notice = joinRefusalNoticeOf(waitingForHost("hostSilent"), {
			space: "Studio",
		})

		expect(notice.title).toBe("Waiting for the host")
	})

	it("renders as before for a caller with no space at hand", () => {
		expect(joinRejectionNoticeOf(new Error("boom")).title).toBe(
			"Something went wrong with this space",
		)
	})
})
