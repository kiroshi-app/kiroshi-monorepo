import { describe, expect, it, vi } from "vitest"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import "@workspace/ui/lib/i18n"

import {
	createMembersController,
	type MembersTransport,
} from "./members-controller"

import type { Member, MembersChanged, MembersError } from "../bindings"

vi.mock("./index", () => ({ listen: vi.fn(async () => () => undefined) }))

const HOME = { id: "home", name: "Home" }

const STEVE: Member = {
	userId: "steve",
	name: "Steve Puget",
	email: "steve@example.com",
	status: "host",
}

const SAM_PENDING: Member = {
	userId: "sam",
	name: null,
	email: "sam@example.com",
	status: "pending",
}

const ALEX_JOINED: Member = {
	userId: "alex",
	name: "Alex Moreau",
	email: "alex@example.com",
	status: "joined",
}

const SAM_PENDING_ROW = {
	id: "sam",
	name: undefined,
	email: "sam@example.com",
	status: "pending",
}

const ALEX_JOINED_ROW = {
	id: "alex",
	name: "Alex Moreau",
	email: "alex@example.com",
	status: "joined",
}

const ok = <Data>(data: Data) => ({ status: "ok" as const, data })

const refused = (error: MembersError) => ({ status: "error" as const, error })

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const createFakeTransport = (overrides: Partial<MembersTransport> = {}) => {
	const events: { announce: (changed: MembersChanged) => void } = {
		announce: () => undefined,
	}
	const transport: MembersTransport = {
		list: vi.fn(async () => ok([STEVE, SAM_PENDING, ALEX_JOINED])),
		invite: vi.fn(async () => ok(SAM_PENDING)),
		withdraw: vi.fn(async () => ok([STEVE, ALEX_JOINED])),
		remove: vi.fn(async () => ok([STEVE, SAM_PENDING])),
		onChanged: vi.fn(async (listener) => {
			events.announce = listener
			return () => undefined
		}),
		...overrides,
	}
	return { transport, events }
}

const watchHome = async (overrides: Partial<MembersTransport> = {}) => {
	const fake = createFakeTransport(overrides)
	const reportFailure = vi.fn<(message: NoticeMessage) => void>()
	const reportSuccess = vi.fn<(message: NoticeMessage) => void>()
	const controller = createMembersController({
		transport: fake.transport,
		reportFailure,
		reportSuccess,
	})
	const unwatch = controller.watch(HOME)
	await settle()
	return { ...fake, controller, reportFailure, reportSuccess, unwatch }
}

describe("createMembersController", () => {
	it("reads the members of the watched space", async () => {
		const { controller, transport } = await watchHome()

		expect(transport.list).toHaveBeenCalledWith("home")
		expect(controller.getState().members).toEqual([
			STEVE,
			SAM_PENDING,
			ALEX_JOINED,
		])
	})

	it("replaces the list with the members announced for the watched space", async () => {
		const { controller, events } = await watchHome()

		events.announce({ spaceId: "home", members: [STEVE] })
		events.announce({ spaceId: "garage", members: [] })

		expect(controller.getState().members).toEqual([STEVE])
	})

	it("adds the invitee and clears the email when the invite succeeds", async () => {
		const { controller, transport } = await watchHome({
			list: vi.fn(async () => ok([STEVE])),
		})
		controller.setEmail("sam@example.com")

		controller.invite("sam@example.com")
		await settle()

		expect(transport.invite).toHaveBeenCalledWith("home", "sam@example.com")
		expect(controller.getState().members).toEqual([STEVE, SAM_PENDING])
		expect(controller.getState().email).toBe("")
	})

	it.each([
		["alreadyInvited", "invited"],
		["ownAccount", "self"],
		["notAnEmail", "malformed"],
	] as const)(
		"shows the %s answer as the %s refusal, cleared on the next edit",
		async (kind, refusal) => {
			const { controller, reportFailure } = await watchHome({
				invite: vi.fn(async () => refused({ kind })),
			})
			controller.setEmail("sam@example.com")

			controller.invite("sam@example.com")
			await settle()

			expect(controller.getState().refusal).toBe(refusal)
			expect(controller.getState().email).toBe("sam@example.com")
			expect(reportFailure).not.toHaveBeenCalled()

			controller.setEmail("sam@example.co")
			expect(controller.getState().refusal).toBeUndefined()
		},
	)

	it.each([
		[{ kind: "notHosting" }, "notHosting"],
		[{ kind: "notOwner" }, "notOwner"],
		[{ kind: "needsSignIn" }, "needsSignIn"],
		[{ kind: "unreachable", reason: "relay down" }, "unreachable"],
		[{ kind: "limitReached" }, "limitReached"],
		[{ kind: "unknownMember" }, "generic"],
		[{ kind: "sessionStore", detail: "locked" }, "generic"],
	] as const)(
		"holds the invite failure for %o as %s, without a notice",
		async (error, reason) => {
			const { controller, reportFailure, reportSuccess } = await watchHome({
				invite: vi.fn(async () => refused(error)),
			})

			controller.invite("sam@example.com")
			await settle()

			expect(controller.getState().failure).toEqual({
				action: "invite",
				reason,
				email: "sam@example.com",
			})
			expect(controller.getState().refusal).toBeUndefined()
			expect(controller.getState().members).toHaveLength(3)
			expect(reportFailure).not.toHaveBeenCalled()
			expect(reportSuccess).not.toHaveBeenCalled()
		},
	)

	it("holds a generic invite failure when the invite is rejected", async () => {
		const { reportFailure, controller } = await watchHome({
			invite: vi.fn(async () => {
				throw new Error("ipc closed")
			}),
		})

		controller.invite("sam@example.com")
		await settle()

		expect(controller.getState().failure).toEqual({
			action: "invite",
			reason: "generic",
			email: "sam@example.com",
		})
		expect(reportFailure).not.toHaveBeenCalled()
	})

	it("clears the previous failure when a new action starts", async () => {
		const invite = vi
			.fn<MembersTransport["invite"]>()
			.mockResolvedValueOnce(refused({ kind: "limitReached" }))
			.mockReturnValueOnce(new Promise(() => undefined))
		const { controller } = await watchHome({ invite })

		controller.invite("sam@example.com")
		await settle()
		expect(controller.getState().failure).toBeDefined()

		controller.invite("sam@example.com")
		expect(controller.getState().failure).toBeUndefined()
	})

	it("replaces a refusal with the failure when the same email is resent and fails", async () => {
		const invite = vi
			.fn<MembersTransport["invite"]>()
			.mockResolvedValueOnce(refused({ kind: "alreadyInvited" }))
			.mockResolvedValueOnce(
				refused({ kind: "unreachable", reason: "relay down" }),
			)
		const { controller } = await watchHome({ invite })

		controller.invite("sam@example.com")
		await settle()
		expect(controller.getState().refusal).toBe("invited")

		controller.invite("sam@example.com")
		await settle()

		expect(controller.getState().refusal).toBeUndefined()
		expect(controller.getState().failure).toEqual({
			action: "invite",
			reason: "unreachable",
			email: "sam@example.com",
		})
	})

	it("clears the failure when the watched space changes", async () => {
		const { controller, unwatch } = await watchHome({
			invite: vi.fn(async () => refused({ kind: "limitReached" })),
		})
		controller.invite("sam@example.com")
		await settle()

		unwatch()
		controller.watch({ id: "garage", name: "Garage" })

		expect(controller.getState().failure).toBeUndefined()
	})

	it("raises a failure notice when the read fails", async () => {
		const { reportFailure, controller } = await watchHome({
			list: vi.fn(async () =>
				refused({ kind: "unreachable", reason: "relay down" }),
			),
		})

		expect(reportFailure).toHaveBeenCalledWith({
			title: "Members",
			description: "Something went wrong, nothing was changed.",
		})
		expect(controller.getState().members).toEqual([])
	})

	it("withdraws a pending invitation, shows the returned list and raises the withdrawn notice", async () => {
		const { controller, transport, reportSuccess } = await watchHome()

		controller.withdraw("sam")
		await settle()

		expect(transport.withdraw).toHaveBeenCalledWith("home", "sam")
		expect(controller.getState().members).toEqual([STEVE, ALEX_JOINED])
		expect(reportSuccess).toHaveBeenCalledWith({
			title: "Invitation to sam@example.com withdrawn",
		})
	})

	it.each([
		[{ kind: "unknownMember" }, "gone"],
		[{ kind: "notPending" }, "joined"],
		[{ kind: "notHosting" }, "notHosting"],
		[{ kind: "notOwner" }, "notOwner"],
		[{ kind: "needsSignIn" }, "needsSignIn"],
		[{ kind: "unreachable", reason: "relay down" }, "unreachable"],
		[{ kind: "notJoined" }, "generic"],
	] as const)(
		"keeps the list and holds the withdraw failure for %o as %s, without a notice",
		async (error, reason) => {
			const { controller, reportFailure, reportSuccess } = await watchHome({
				withdraw: vi.fn(async () => refused(error)),
			})

			controller.withdraw("sam")
			await settle()

			expect(controller.getState().failure).toEqual({
				action: "withdraw",
				reason,
				member: SAM_PENDING_ROW,
			})
			expect(reportFailure).not.toHaveBeenCalled()
			expect(reportSuccess).not.toHaveBeenCalled()
			expect(controller.getState().members).toHaveLength(3)
		},
	)

	it("holds a generic withdraw failure when the withdraw is rejected", async () => {
		const { controller } = await watchHome({
			withdraw: vi.fn(async () => {
				throw new Error("ipc closed")
			}),
		})

		controller.withdraw("sam")
		await settle()

		expect(controller.getState().failure).toEqual({
			action: "withdraw",
			reason: "generic",
			member: SAM_PENDING_ROW,
		})
	})

	it("removes a joined member only once the removal is confirmed", async () => {
		const { controller, transport } = await watchHome()

		controller.askRemove("alex")
		expect(controller.getState().removing).toEqual(ALEX_JOINED)
		expect(transport.remove).not.toHaveBeenCalled()

		controller.confirmRemove()
		await settle()

		expect(transport.remove).toHaveBeenCalledWith("home", "alex")
		expect(controller.getState().removing).toBeNull()
		expect(controller.getState().members).toEqual([STEVE, SAM_PENDING])
	})

	it.each([
		[{ kind: "unknownMember" }, "gone"],
		[{ kind: "notJoined" }, "pending"],
		[{ kind: "hostNotRemovable" }, "host"],
		[{ kind: "notHosting" }, "notHosting"],
		[{ kind: "notOwner" }, "notOwner"],
		[{ kind: "needsSignIn" }, "needsSignIn"],
		[{ kind: "unreachable", reason: "relay down" }, "unreachable"],
		[{ kind: "notPending" }, "generic"],
	] as const)(
		"keeps the list and holds the remove failure for %o as %s, without a notice",
		async (error, reason) => {
			const { controller, reportFailure } = await watchHome({
				remove: vi.fn(async () => refused(error)),
			})

			controller.askRemove("alex")
			controller.confirmRemove()
			await settle()

			expect(controller.getState().failure).toEqual({
				action: "remove",
				reason,
				member: ALEX_JOINED_ROW,
			})
			expect(reportFailure).not.toHaveBeenCalled()
			expect(controller.getState().members).toHaveLength(3)
		},
	)

	it("holds a generic remove failure when the remove is rejected", async () => {
		const { controller } = await watchHome({
			remove: vi.fn(async () => {
				throw new Error("ipc closed")
			}),
		})

		controller.askRemove("alex")
		controller.confirmRemove()
		await settle()

		expect(controller.getState().failure).toEqual({
			action: "remove",
			reason: "generic",
			member: ALEX_JOINED_ROW,
		})
	})

	it("closes the removal without a call on cancel", async () => {
		const { controller, transport } = await watchHome()

		controller.askRemove("alex")
		controller.cancelRemove()
		controller.confirmRemove()
		await settle()

		expect(controller.getState().removing).toBeNull()
		expect(transport.remove).not.toHaveBeenCalled()
	})

	it("drops the answers that land after the space is unwatched", async () => {
		const { controller, unwatch } = await watchHome({
			invite: vi.fn(async () => refused({ kind: "limitReached" })),
		})

		controller.invite("sam@example.com")
		unwatch()
		await settle()

		expect(controller.getState().failure).toBeUndefined()
	})
})
