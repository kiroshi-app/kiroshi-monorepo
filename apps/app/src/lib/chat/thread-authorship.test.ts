// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { describe, expect, it } from "vitest"

import "@workspace/ui/lib/i18n"

import {
	type MessageAuthorship,
	type ThreadAuthorship,
	ThreadAuthorshipContext,
	usePersonOf,
} from "./thread-authorship"

import type { JoinedSpaceMember } from "../bindings"

const HOST = "account-host"
const GUEST = "account-guest"

const HOST_ROW: MessageAuthorship = {
	authorAccountId: HOST,
	authorName: "Steve",
}
const GUEST_ROW: MessageAuthorship = {
	authorAccountId: GUEST,
	authorName: "Tom",
}
const TYPED_SIGNED_OUT_ROW: MessageAuthorship = {
	authorAccountId: null,
	authorName: null,
}
const HOSTED_TRANSCRIPT = [HOST_ROW, GUEST_ROW, TYPED_SIGNED_OUT_ROW]

const hostedBy = (accountId: string | null): ThreadAuthorship => ({
	accountId,
	host: { kind: "hosted", ownAccountIds: [HOST] },
})

const LEA = "account-lea"

const memberOf = (
	userId: string,
	name: string | null,
	role: JoinedSpaceMember["role"] = "guest",
): JoinedSpaceMember => ({
	userId,
	name,
	role,
	deviceId: `device-of-${userId}`,
	fingerprint: ["abandon", "ability", "able", "about", "above", "absent"],
	isPresent: true,
})

const joinedAsGuestWith = (hostName: string | null): ThreadAuthorship => ({
	accountId: GUEST,
	host: {
		kind: "joined",
		members: [
			memberOf(HOST, hostName, "host"),
			memberOf(GUEST, "Tom"),
			memberOf(LEA, null),
		],
	},
})

const HOST_ROW_NAMED_BY_EMAIL: MessageAuthorship = {
	authorAccountId: HOST,
	authorName: "account-host@example.com",
}
const LEA_ROW: MessageAuthorship = { authorAccountId: LEA, authorName: "Lea" }
const GONE_ROW: MessageAuthorship = {
	authorAccountId: "account-gone",
	authorName: "Sam",
}

const authorsShownWith = (
	authorship: ThreadAuthorship,
	rows: MessageAuthorship[] = HOSTED_TRANSCRIPT,
) => {
	const wrapper = ({ children }: { children: ReactNode }) =>
		createElement(
			ThreadAuthorshipContext.Provider,
			{ value: authorship },
			children,
		)
	const { result } = renderHook(() => usePersonOf(), { wrapper })
	return rows.map((row) => result.current(row) ?? "mine")
}

describe("who wrote a message in a hosted space", () => {
	it("keeps every message the host typed as mine once signed out", () => {
		expect(authorsShownWith(hostedBy(null))).toEqual(["mine", "Tom", "mine"])
	})

	it("names the guest whether the host is signed in or out", () => {
		expect(authorsShownWith(hostedBy(HOST))).toEqual(["mine", "Tom", "mine"])
		expect(authorsShownWith(hostedBy(null))[1]).toBe("Tom")
	})

	it("draws nothing differently after signing out and back in", () => {
		const before = authorsShownWith(hostedBy(HOST))
		const signedOut = authorsShownWith(hostedBy(null))
		const after = authorsShownWith(hostedBy(HOST))

		expect(signedOut).toEqual(before)
		expect(after).toEqual(before)
	})
})

describe("who wrote a message in a joined space", () => {
	it("keeps the rule: mine by account, the host when unattributed", () => {
		expect(authorsShownWith(joinedAsGuestWith("Steve"))).toEqual([
			"Steve",
			"mine",
			"Steve",
		])
	})

	it("names the host from the member record, never from the stored email", () => {
		expect(
			authorsShownWith(joinedAsGuestWith("Steve"), [HOST_ROW_NAMED_BY_EMAIL]),
		).toEqual(["Steve"])
	})

	it("shows the new name once the host renames themselves", () => {
		expect(
			authorsShownWith(joinedAsGuestWith("Steven"), [
				HOST_ROW,
				TYPED_SIGNED_OUT_ROW,
			]),
		).toEqual(["Steven", "Steven"])
	})

	it("falls back to the unnamed copy when the record carries no name", () => {
		expect(
			authorsShownWith(joinedAsGuestWith(null), [HOST_ROW, LEA_ROW, GONE_ROW]),
		).toEqual(["No name", "No name", "No name"])
	})
})
