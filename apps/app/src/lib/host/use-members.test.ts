// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
	type NoticeMessage,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"
import type { SpaceMember } from "@workspace/ui/components/space-settings-dialog/members-panel"
import "@workspace/ui/lib/i18n"

import { listen } from "./index"
import type { MembersTransport } from "./members-transport"
import { type MembersProps, useMembers } from "./use-members"

import {
	HOSTING_MEMBERS_CHANGED_EVENT,
	type Member,
	type MembersError,
} from "../bindings"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("./index", () => ({
	isDesktopHost: () => true,
	listen: vi.fn(async () => () => undefined),
	joinedHosts: { getState: () => ({ active: null, connections: {} }) },
}))
vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(() => "notice-1"),
	raiseTransientNotice: vi.fn(),
}))

afterEach(() => {
	cleanup()
	vi.mocked(raiseFailureNotice).mockClear()
	vi.mocked(listen).mockClear()
})

const HOME = { id: "home", name: "Home" }

const GARAGE = { id: "garage", name: "Garage" }

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

const SAM_PENDING_ROW: SpaceMember = {
	id: "sam",
	name: undefined,
	email: "sam@example.com",
	status: "pending",
}

const ALEX_JOINED_ROW: SpaceMember = {
	id: "alex",
	name: "Alex Moreau",
	email: "alex@example.com",
	status: "joined",
}

const ok = <Data>(data: Data) => ({ status: "ok" as const, data })

const refused = (error: MembersError) => ({ status: "error" as const, error })

const createFakeTransport = (
	overrides: Partial<MembersTransport> = {},
): MembersTransport => ({
	list: vi.fn(async () => ok([STEVE, SAM_PENDING, ALEX_JOINED])),
	invite: vi.fn(async () => ok(SAM_PENDING)),
	withdraw: vi.fn(async () => ok([STEVE, ALEX_JOINED])),
	remove: vi.fn(async () => ok([STEVE, SAM_PENDING])),
	onChanged: vi.fn(async () => () => undefined),
	...overrides,
})

type WatchedSpace = { space: typeof HOME; isHosted: boolean }

const shown = (props: MembersProps | undefined): MembersProps => {
	if (!props) throw new Error("the members panel is not shown")
	return props
}

const watchHome = async (overrides: Partial<MembersTransport> = {}) => {
	const transport = createFakeTransport(overrides)
	const reportSuccess = vi.fn<(message: NoticeMessage) => void>()
	const hook = renderHook(
		({ space, isHosted }: WatchedSpace) =>
			useMembers(space, isHosted, { transport, reportSuccess }),
		{
			wrapper: createQueryTestWrapper().wrapper,
			initialProps: { space: HOME, isHosted: true },
		},
	)
	await waitFor(() => expect(transport.list).toHaveBeenCalled())
	await settle()
	const panel = () => shown(hook.result.current)
	return { ...hook, transport, reportSuccess, panel }
}

const settle = () =>
	act(async () => {
		for (let round = 0; round < 3; round += 1) {
			await new Promise((resolve) => setTimeout(resolve, 0))
		}
	})

const changeAnnounced = () => {
	const [, announce] =
		vi
			.mocked(listen)
			.mock.calls.find(([event]) => event === HOSTING_MEMBERS_CHANGED_EVENT) ??
		[]
	announce?.(
		{ event: HOSTING_MEMBERS_CHANGED_EVENT, id: 1, payload: null },
		null,
	)
}

const STEVE_ROW: SpaceMember = {
	id: "steve",
	name: "Steve Puget",
	email: "steve@example.com",
	status: "host",
}

describe("useMembers", () => {
	it("reads the members of the watched space, the host first", async () => {
		const { panel, transport } = await watchHome({
			list: vi.fn(async () => ok([SAM_PENDING, STEVE])),
		})

		expect(transport.list).toHaveBeenCalledWith("home")
		expect(panel().members).toEqual([STEVE_ROW, SAM_PENDING_ROW])
	})

	it("reads the members once for two panels on the same space", async () => {
		const transport = createFakeTransport()
		renderHook(
			() => [
				useMembers(HOME, true, { transport }),
				useMembers({ ...HOME }, true, { transport }),
			],
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		expect(transport.list).toHaveBeenCalledOnce()
	})

	it("reads no members while hosting is off", async () => {
		const transport = createFakeTransport()
		const { result } = renderHook(
			() => useMembers(HOME, false, { transport }),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		expect(transport.list).not.toHaveBeenCalled()
		expect(shown(result.current).members).toEqual([])
	})

	it("reads the list again when the host announces a change", async () => {
		const list = vi
			.fn<MembersTransport["list"]>()
			.mockResolvedValueOnce(ok([STEVE, SAM_PENDING, ALEX_JOINED]))
			.mockResolvedValue(ok([STEVE]))
		const { panel } = await watchHome({ list })

		changeAnnounced()
		await settle()

		expect(panel().members).toEqual([STEVE_ROW])
	})

	it("adds the invitee and clears the email when the invite succeeds", async () => {
		const { panel, transport } = await watchHome({
			list: vi.fn(async () => ok([STEVE])),
		})
		act(() => panel().onEmailChange("sam@example.com"))

		act(() => panel().onInvite("sam@example.com"))
		await settle()

		expect(transport.invite).toHaveBeenCalledWith("home", "sam@example.com")
		expect(panel().members).toEqual([STEVE_ROW, SAM_PENDING_ROW])
		expect(panel().email).toBe("")
	})

	it.each([
		["alreadyInvited", "invited"],
		["ownAccount", "self"],
		["notAnEmail", "malformed"],
	] as const)(
		"shows the %s answer as the %s refusal, cleared on the next edit",
		async (kind, refusal) => {
			const { panel } = await watchHome({
				invite: vi.fn(async () => refused({ kind })),
			})
			act(() => panel().onEmailChange("sam@example.com"))

			act(() => panel().onInvite("sam@example.com"))
			await settle()

			expect(panel().refusal).toBe(refusal)
			expect(panel().email).toBe("sam@example.com")
			expect(raiseFailureNotice).not.toHaveBeenCalled()

			act(() => panel().onEmailChange("sam@example.co"))
			expect(panel().refusal).toBeUndefined()
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
			const { panel, reportSuccess } = await watchHome({
				invite: vi.fn(async () => refused(error)),
			})

			act(() => panel().onInvite("sam@example.com"))
			await settle()

			expect(panel().failure).toEqual({
				action: "invite",
				reason,
				email: "sam@example.com",
			})
			expect(panel().refusal).toBeUndefined()
			expect(panel().members).toHaveLength(3)
			expect(raiseFailureNotice).not.toHaveBeenCalled()
			expect(reportSuccess).not.toHaveBeenCalled()
		},
	)

	it("holds a generic invite failure when the invite is rejected", async () => {
		const { panel } = await watchHome({
			invite: vi.fn(async () => {
				throw new Error("ipc closed")
			}),
		})

		act(() => panel().onInvite("sam@example.com"))
		await settle()

		expect(panel().failure).toEqual({
			action: "invite",
			reason: "generic",
			email: "sam@example.com",
		})
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("clears the previous failure when a new action starts", async () => {
		const invite = vi
			.fn<MembersTransport["invite"]>()
			.mockResolvedValueOnce(refused({ kind: "limitReached" }))
			.mockReturnValueOnce(new Promise(() => undefined))
		const { panel } = await watchHome({ invite })

		act(() => panel().onInvite("sam@example.com"))
		await settle()
		expect(panel().failure).toBeDefined()

		act(() => panel().onInvite("sam@example.com"))
		await settle()
		expect(panel().failure).toBeUndefined()
	})

	it("replaces a refusal with the failure when the same email is resent and fails", async () => {
		const invite = vi
			.fn<MembersTransport["invite"]>()
			.mockResolvedValueOnce(refused({ kind: "alreadyInvited" }))
			.mockResolvedValueOnce(
				refused({ kind: "unreachable", reason: "relay down" }),
			)
		const { panel } = await watchHome({ invite })

		act(() => panel().onInvite("sam@example.com"))
		await settle()
		expect(panel().refusal).toBe("invited")

		act(() => panel().onInvite("sam@example.com"))
		await settle()

		expect(panel().refusal).toBeUndefined()
		expect(panel().failure).toEqual({
			action: "invite",
			reason: "unreachable",
			email: "sam@example.com",
		})
	})

	it("clears the failure when the watched space changes", async () => {
		const { panel, rerender } = await watchHome({
			invite: vi.fn(async () => refused({ kind: "limitReached" })),
		})
		act(() => panel().onInvite("sam@example.com"))
		await settle()

		rerender({ space: GARAGE, isHosted: true })

		expect(panel().failure).toBeUndefined()
	})

	it("raises a failure notice when the read fails", async () => {
		const { panel } = await watchHome({
			list: vi.fn(async () =>
				refused({ kind: "unreachable", reason: "relay down" }),
			),
		})

		expect(raiseFailureNotice).toHaveBeenCalledWith({
			title: "Members",
			description: "Something went wrong, nothing was changed.",
			report: expect.objectContaining({ raisedIn: "use-members" }),
		})
		expect(panel().members).toEqual([])
	})

	it("withdraws a pending invitation, shows the returned list and raises the withdrawn notice", async () => {
		const { panel, transport, reportSuccess } = await watchHome()

		act(() => panel().onWithdraw(SAM_PENDING_ROW))
		await settle()

		expect(transport.withdraw).toHaveBeenCalledWith("home", "sam")
		expect(panel().members).toEqual([STEVE_ROW, ALEX_JOINED_ROW])
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
			const { panel, reportSuccess } = await watchHome({
				withdraw: vi.fn(async () => refused(error)),
			})

			act(() => panel().onWithdraw(SAM_PENDING_ROW))
			await settle()

			expect(panel().failure).toEqual({
				action: "withdraw",
				reason,
				member: SAM_PENDING_ROW,
			})
			expect(raiseFailureNotice).not.toHaveBeenCalled()
			expect(reportSuccess).not.toHaveBeenCalled()
			expect(panel().members).toHaveLength(3)
		},
	)

	it("holds a generic withdraw failure when the withdraw is rejected", async () => {
		const { panel } = await watchHome({
			withdraw: vi.fn(async () => {
				throw new Error("ipc closed")
			}),
		})

		act(() => panel().onWithdraw(SAM_PENDING_ROW))
		await settle()

		expect(panel().failure).toEqual({
			action: "withdraw",
			reason: "generic",
			member: SAM_PENDING_ROW,
		})
	})

	it("removes a joined member only once the removal is confirmed", async () => {
		const { panel, transport } = await watchHome()

		act(() => panel().onRemove(ALEX_JOINED_ROW))
		expect(panel().removing).toEqual(ALEX_JOINED_ROW)
		expect(transport.remove).not.toHaveBeenCalled()

		act(() => panel().onRemoveConfirm())
		await settle()

		expect(transport.remove).toHaveBeenCalledWith("home", "alex")
		expect(panel().removing).toBeNull()
		expect(panel().members).toEqual([STEVE_ROW, SAM_PENDING_ROW])
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
			const { panel } = await watchHome({
				remove: vi.fn(async () => refused(error)),
			})

			act(() => panel().onRemove(ALEX_JOINED_ROW))
			act(() => panel().onRemoveConfirm())
			await settle()

			expect(panel().failure).toEqual({
				action: "remove",
				reason,
				member: ALEX_JOINED_ROW,
			})
			expect(raiseFailureNotice).not.toHaveBeenCalled()
			expect(panel().members).toHaveLength(3)
		},
	)

	it("holds a generic remove failure when the remove is rejected", async () => {
		const { panel } = await watchHome({
			remove: vi.fn(async () => {
				throw new Error("ipc closed")
			}),
		})

		act(() => panel().onRemove(ALEX_JOINED_ROW))
		act(() => panel().onRemoveConfirm())
		await settle()

		expect(panel().failure).toEqual({
			action: "remove",
			reason: "generic",
			member: ALEX_JOINED_ROW,
		})
	})

	it("closes the removal without a call on cancel", async () => {
		const { panel, transport } = await watchHome()

		act(() => panel().onRemove(ALEX_JOINED_ROW))
		act(() => panel().onRemoveCancel())
		act(() => panel().onRemoveConfirm())
		await settle()

		expect(panel().removing).toBeNull()
		expect(transport.remove).not.toHaveBeenCalled()
	})

	it("shows no answer that lands once hosting is off", async () => {
		const { panel, rerender } = await watchHome({
			invite: vi.fn(async () => refused({ kind: "limitReached" })),
		})

		act(() => panel().onInvite("sam@example.com"))
		rerender({ space: HOME, isHosted: false })
		await settle()

		expect(panel().failure).toBeUndefined()
	})
	it("waits on its first read of the members while nothing is held", () => {
		const transport = createFakeTransport({
			list: vi.fn(() => new Promise<never>(() => undefined)),
		})

		const { result } = renderHook(() => useMembers(HOME, true, { transport }), {
			wrapper: createQueryTestWrapper().wrapper,
		})

		expect(shown(result.current).isPending).toBe(true)
	})

	it("keeps the members it holds while it reads them again", async () => {
		const list = vi
			.fn<MembersTransport["list"]>()
			.mockResolvedValueOnce(ok([STEVE, SAM_PENDING, ALEX_JOINED]))
			.mockReturnValue(new Promise(() => undefined))
		const { panel } = await watchHome({ list })

		act(() => changeAnnounced())
		await settle()

		expect(list).toHaveBeenCalledTimes(2)
		expect(panel().isPending).toBe(false)
		expect(panel().members).toEqual([
			STEVE_ROW,
			SAM_PENDING_ROW,
			ALEX_JOINED_ROW,
		])
	})

	it("stops waiting on the members once their read fails", async () => {
		const { panel } = await watchHome({
			list: vi.fn(async () =>
				refused({ kind: "unreachable", reason: "relay down" }),
			),
		})

		expect(panel().isPending).toBe(false)
	})
})
