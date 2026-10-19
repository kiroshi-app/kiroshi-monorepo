import { afterEach, describe, expect, it, vi } from "vitest"

import { invoke } from "./index"
import { membersTransport } from "./members-transport"

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

const LISTED: SpaceMembers = {
	members: [HOST],
	invitations: [
		invitation("i1", "ana@example.com", "invited"),
		invitation("i2", "bob@example.com", "expired"),
		invitation("i3", "eve@example.com", "withdrawn"),
	],
}

const ANA_PENDING: Member = {
	userId: "i1",
	name: null,
	email: "ana@example.com",
	status: "pending",
}

afterEach(() => {
	vi.mocked(invoke).mockReset()
})

describe("membersTransport", () => {
	it("lists the members then each invitation still invited as a pending row", async () => {
		vi.mocked(invoke).mockResolvedValue(LISTED)

		const listed = await membersTransport.list("garage")

		expect(invoke).toHaveBeenCalledWith("hosting_members", {
			spaceId: "garage",
		})
		expect(listed).toEqual({ status: "ok", data: [HOST, ANA_PENDING] })
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
