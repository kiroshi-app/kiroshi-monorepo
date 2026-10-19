import { afterEach, describe, expect, it, vi } from "vitest"

import { invoke } from "./index"
import { type HostedMember, membersTransport } from "./members-transport"

import type { Member, SpaceInvitation, SpaceMembers } from "../bindings"

vi.mock("./index", () => ({ invoke: vi.fn(), listen: vi.fn() }))

const HOST: Member = {
	userId: "owner",
	name: null,
	email: "owner@example.com",
	status: "host",
}

const invitation = (
	id: string,
	email: string,
	state: SpaceInvitation["state"],
): SpaceInvitation => ({
	id,
	email,
	sentAt: "2026-10-01T00:00:00.000Z",
	expiresAt: "2026-10-08T00:00:00.000Z",
	state,
})

const ANA_INVITED = invitation("i1", "ana@example.com", "invited")

const BOB_EXPIRED = invitation("i2", "bob@example.com", "expired")

const LISTED: SpaceMembers = {
	members: [HOST],
	invitations: [
		ANA_INVITED,
		BOB_EXPIRED,
		invitation("i3", "eve@example.com", "withdrawn"),
	],
}

const ANA_PENDING: HostedMember = {
	userId: "i1",
	name: null,
	email: "ana@example.com",
	status: "pending",
	invitation: ANA_INVITED,
}

const BOB_PENDING_EXPIRED: HostedMember = {
	userId: "i2",
	name: null,
	email: "bob@example.com",
	status: "pending",
	invitation: BOB_EXPIRED,
}

afterEach(() => {
	vi.mocked(invoke).mockReset()
})

describe("membersTransport", () => {
	it("lists the members then each invitation not withdrawn, carrying its dates and state", async () => {
		vi.mocked(invoke).mockResolvedValue(LISTED)

		const listed = await membersTransport.list("garage")

		expect(invoke).toHaveBeenCalledWith("hosting_members", {
			spaceId: "garage",
		})
		expect(listed).toEqual({
			status: "ok",
			data: [HOST, ANA_PENDING, BOB_PENDING_EXPIRED],
		})
	})

	it("resends by invitation id and answers the list read back", async () => {
		vi.mocked(invoke).mockResolvedValue({
			...LISTED,
			invitations: [ANA_INVITED, { ...BOB_EXPIRED, state: "invited" }],
		})

		const resent = await membersTransport.resend("garage", "i2")

		expect(invoke).toHaveBeenCalledWith("hosting_resend_invitation", {
			spaceId: "garage",
			invitationId: "i2",
		})
		expect(invoke).not.toHaveBeenCalledWith(
			"hosting_invite_member",
			expect.anything(),
		)
		expect(resent).toEqual({
			status: "ok",
			data: [
				HOST,
				ANA_PENDING,
				{
					...BOB_PENDING_EXPIRED,
					invitation: { ...BOB_EXPIRED, state: "invited" },
				},
			],
		})
	})

	it("answers an invite with the invited row, never an expired one of the same email", async () => {
		vi.mocked(invoke).mockResolvedValue({
			...LISTED,
			invitations: [
				BOB_EXPIRED,
				invitation("i4", "bob@example.com", "invited"),
			],
		})

		const invited = await membersTransport.invite("garage", "bob@example.com")

		expect(invited).toEqual({
			status: "ok",
			data: expect.objectContaining({ userId: "i4" }),
		})
	})

	it("withdraws by invitation id and answers the list read back", async () => {
		vi.mocked(invoke).mockResolvedValue({ ...LISTED, invitations: [] })

		const withdrawn = await membersTransport.withdraw("garage", "i1")

		expect(invoke).toHaveBeenCalledWith("hosting_withdraw_invitation", {
			spaceId: "garage",
			invitationId: "i1",
		})
		expect(withdrawn).toEqual({ status: "ok", data: [HOST] })
	})

	it("answers an invite with the pending row of the email it read back", async () => {
		vi.mocked(invoke).mockResolvedValue(LISTED)

		const invited = await membersTransport.invite("garage", " Ana@Example.com ")

		expect(invited).toEqual({ status: "ok", data: ANA_PENDING })
	})

	it("passes a typed refusal through", async () => {
		vi.mocked(invoke).mockRejectedValue({ kind: "unknownInvitation" })

		const refused = await membersTransport.withdraw("garage", "nope")

		expect(refused).toEqual({
			status: "error",
			error: { kind: "unknownInvitation" },
		})
	})
})
