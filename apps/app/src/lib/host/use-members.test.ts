// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	type NoticeMessage,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"
import type { SpaceMember } from "@workspace/ui/components/space-settings-dialog/members-panel"
import "@workspace/ui/lib/i18n"

import { listen } from "./index"
import { toSpaceMember } from "./member-actions"
import type { HostedMember, MembersTransport } from "./members-transport"
import { type MembersProps, useMembers } from "./use-members"

import {
	commands,
	HOSTING_MEMBERS_CHANGED_EVENT,
	JOINED_SPACE_MEMBERS_CHANGED_EVENT,
	type JoinedSpaceMember,
	type Member,
	type MembersError,
} from "../bindings"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("./index", () => ({
	isDesktopHost: () => true,
	listen: vi.fn(async () => () => undefined),
	joinedHosts: { getState: () => ({ active: null, connections: {} }) },
}))
vi.mock("../bindings", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../bindings")>()
	return {
		...actual,
		commands: { ...actual.commands, joinedSpaceMembers: vi.fn() },
	}
})
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
	resend: vi.fn(async () => ok([STEVE, SAM_PENDING, ALEX_JOINED])),
	withdraw: vi.fn(async () => ok([STEVE, ALEX_JOINED])),
	remove: vi.fn(async () => ok([STEVE, SAM_PENDING])),
	inviteAgain: vi.fn(async () => ok([STEVE])),
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

	it("names a member with no name by the unnamed copy, never by the email", async () => {
		const { panel } = await watchHome({
			list: vi.fn(async () =>
				ok([
					{ ...STEVE, name: null },
					{ ...ALEX_JOINED, name: "" },
					SAM_PENDING,
				]),
			),
		})

		expect(panel().members).toEqual([
			{ ...STEVE_ROW, name: "No name" },
			{ ...ALEX_JOINED_ROW, name: "No name" },
			SAM_PENDING_ROW,
		])
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
			report: expect.objectContaining({
				context: expect.objectContaining({ raisedIn: "use-members" }),
			}),
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
			description: "The link in their email stops working.",
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

	it("asks to confirm the removal of its own host row on the host desktop and sends it to the host", async () => {
		const { panel, transport } = await watchHome()

		act(() => panel().onRemove(STEVE_ROW))
		expect(panel().removing).toEqual(STEVE_ROW)
		act(() => panel().onRemoveConfirm())
		await settle()

		expect(transport.remove).toHaveBeenCalledWith("home", "steve")
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

describe("useMembers on a joined space", () => {
	const STUDIO = { id: "studio", name: "Studio Nord" }

	const LEA_FINGERPRINT = [
		"orbit",
		"velvet",
		"canal",
		"fossil",
		"ripple",
		"mango",
	]

	const TOM_FINGERPRINT = [
		"abandon",
		"ability",
		"able",
		"about",
		"above",
		"absent",
	]

	const LEA: JoinedSpaceMember = {
		userId: "lea",
		name: "Lea",
		role: "host",
		deviceId: "device-of-lea",
		fingerprint: LEA_FINGERPRINT,
		isPresent: true,
	}

	const TOM: JoinedSpaceMember = {
		userId: "tom",
		name: "Tom",
		role: "guest",
		deviceId: "device-of-tom",
		fingerprint: TOM_FINGERPRINT,
		isPresent: true,
	}

	const LEA_ANSWERED: Member = {
		userId: "lea",
		name: "Lea",
		email: "lea@example.com",
		status: "host",
	}

	const TOM_ANSWERED: Member = {
		userId: "tom",
		name: "Tom",
		email: "tom@example.com",
		status: "joined",
	}

	const LEA_ROW: SpaceMember = {
		id: "lea",
		name: "Lea",
		email: "lea@example.com",
		status: "host",
		fingerprint: "orbit velvet canal fossil ripple mango",
	}

	const TOM_ROW: SpaceMember = {
		id: "tom",
		name: "Tom",
		email: "tom@example.com",
		status: "joined",
		fingerprint: "abandon ability able about above absent",
	}

	const rosterAnswered = (roster: JoinedSpaceMember[]) =>
		vi.mocked(commands.joinedSpaceMembers).mockResolvedValue({
			status: "ok",
			data: roster,
		})

	type StudioState = { isHostOffline: boolean }

	const watchStudio = (
		overrides: Partial<MembersTransport> = {},
		initialProps: StudioState = { isHostOffline: false },
	) => {
		const transport = createFakeTransport({
			list: vi.fn(async () => ok([LEA_ANSWERED, TOM_ANSWERED])),
			...overrides,
		})
		const hook = renderHook(
			({ isHostOffline }: StudioState) =>
				useMembers(STUDIO, true, {
					transport,
					joinedId: "joined-studio",
					isHostOffline,
				}),
			{ wrapper: createQueryTestWrapper().wrapper, initialProps },
		)
		return {
			transport,
			rerender: hook.rerender,
			panel: () => shown(hook.result.current),
		}
	}

	const membersChangeAnnounced = () => {
		const [, announce] =
			vi
				.mocked(listen)
				.mock.calls.find(
					([event]) => event === JOINED_SPACE_MEMBERS_CHANGED_EVENT,
				) ?? []
		act(() => {
			announce?.(
				{
					event: JOINED_SPACE_MEMBERS_CHANGED_EVENT,
					id: 1,
					payload: { id: "joined-studio", members: [] },
				},
				null,
			)
		})
	}

	afterEach(() => vi.mocked(commands.joinedSpaceMembers).mockReset())

	it("lists the people of the signed roster, the host first, with the roster fingerprints", async () => {
		rosterAnswered([TOM, LEA])

		const { panel, transport } = watchStudio()

		await waitFor(() => expect(panel().members).toEqual([LEA_ROW, TOM_ROW]))
		expect(commands.joinedSpaceMembers).toHaveBeenCalledWith("joined-studio")
		expect(transport.list).toHaveBeenCalledWith("studio")
	})

	it("lists no one the host answers who is not in the signed roster", async () => {
		rosterAnswered([LEA])

		const { panel } = watchStudio()

		await waitFor(() => expect(panel().members).toEqual([LEA_ROW]))
	})

	it("lists a person once when the roster signs two of their devices", async () => {
		rosterAnswered([
			LEA,
			TOM,
			{ ...TOM, deviceId: "phone-of-tom", fingerprint: LEA_FINGERPRINT },
		])

		const { panel } = watchStudio()

		await waitFor(() => expect(panel().members).toEqual([LEA_ROW, TOM_ROW]))
	})

	it("lists the invitations the host answers for the space", async () => {
		rosterAnswered([LEA, TOM])

		const { panel } = watchStudio({
			list: vi.fn(async () => ok([LEA_ANSWERED, SAM_PENDING, TOM_ANSWERED])),
		})

		await waitFor(() =>
			expect(panel().members).toEqual([LEA_ROW, TOM_ROW, SAM_PENDING_ROW]),
		)
	})

	it("sends an invite to the host and shows the invitation once answered", async () => {
		rosterAnswered([LEA, TOM])
		const { panel, transport } = watchStudio()
		await waitFor(() => expect(panel().members).toHaveLength(2))

		act(() => panel().onInvite("sam@example.com"))

		await waitFor(() =>
			expect(panel().members).toEqual([LEA_ROW, TOM_ROW, SAM_PENDING_ROW]),
		)
		expect(transport.invite).toHaveBeenCalledWith("studio", "sam@example.com")
	})

	it("drops a removed person at once, without waiting for the roster to be signed again", async () => {
		rosterAnswered([LEA, TOM])
		const { panel, transport } = watchStudio({
			remove: vi.fn(async () => ok([LEA_ANSWERED])),
		})
		await waitFor(() => expect(panel().members).toHaveLength(2))

		act(() => panel().onRemove(TOM_ROW))
		act(() => panel().onRemoveConfirm())
		await settle()

		expect(transport.remove).toHaveBeenCalledWith("studio", "tom")
		expect(panel().members).toEqual([LEA_ROW])
		expect(commands.joinedSpaceMembers).toHaveBeenCalledOnce()
	})

	it("reads nothing from the host and raises no notice while the host is offline", async () => {
		rosterAnswered([LEA, TOM])

		const { panel, transport } = watchStudio(
			{
				list: vi.fn(async () =>
					refused({ kind: "unreachable", reason: "down" }),
				),
			},
			{ isHostOffline: true },
		)

		await waitFor(() => expect(panel().isPending).toBe(false))
		await settle()
		expect(transport.list).not.toHaveBeenCalled()
		expect(raiseFailureNotice).not.toHaveBeenCalled()
		expect(panel().members).toEqual([
			{ ...LEA_ROW, email: "" },
			{ ...TOM_ROW, email: "" },
		])
	})

	it("reads the host once it comes back and shows its invitations", async () => {
		rosterAnswered([LEA, TOM])
		const { panel, transport, rerender } = watchStudio(
			{
				list: vi.fn(async () => ok([LEA_ANSWERED, TOM_ANSWERED, SAM_PENDING])),
			},
			{ isHostOffline: true },
		)
		await waitFor(() => expect(panel().members).toHaveLength(2))

		rerender({ isHostOffline: false })

		await waitFor(() =>
			expect(panel().members).toEqual([LEA_ROW, TOM_ROW, SAM_PENDING_ROW]),
		)
		await settle()
		expect(transport.list).toHaveBeenCalledOnce()
		expect(transport.list).toHaveBeenCalledWith("studio")
	})

	it("holds the removal the host refuses in the failure slot", async () => {
		rosterAnswered([LEA, TOM])
		const { panel } = watchStudio({
			remove: vi.fn(async () => refused({ kind: "hostNotRemovable" })),
		})
		await waitFor(() => expect(panel().members).toHaveLength(2))

		act(() => panel().onRemove(TOM_ROW))
		act(() => panel().onRemoveConfirm())
		await settle()

		expect(panel().failure).toEqual({
			action: "remove",
			reason: "host",
			member: { ...TOM_ROW, fingerprint: undefined },
		})
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it.each([[{ kind: "hostNotRemovable" }, "host"]] as const)(
		"names the roster host in the failure to remove it, sending nothing even when the host would answer %o",
		async (error, reason) => {
			rosterAnswered([LEA, TOM])
			const { panel, transport } = watchStudio({
				list: vi.fn(async () =>
					ok([{ ...LEA_ANSWERED, name: "Lea Martin" }, TOM_ANSWERED]),
				),
				remove: vi.fn(async () => refused(error)),
			})
			await waitFor(() => expect(panel().members).toHaveLength(2))

			act(() => panel().onRemove(LEA_ROW))
			await settle()

			expect(transport.remove).not.toHaveBeenCalled()
			expect(panel().removing).toBeNull()
			expect(panel().failure).toEqual({
				action: "remove",
				reason,
				member: { ...LEA_ROW, name: "Lea", fingerprint: undefined },
			})
		},
	)

	it("waits on the roster, not on the host, for its first read", async () => {
		rosterAnswered([LEA])

		const { panel } = watchStudio({
			list: vi.fn(() => new Promise<never>(() => undefined)),
		})

		await waitFor(() => expect(panel().isPending).toBe(false))
		expect(panel().members).toEqual([{ ...LEA_ROW, email: "" }])
	})

	it("names a host with no name by the unnamed copy", async () => {
		rosterAnswered([{ ...LEA, name: "" }])

		const { panel } = watchStudio()

		await waitFor(() =>
			expect(panel().members.map((member) => member.name)).toEqual(["No name"]),
		)
	})

	it("relabels the host once the joined roster changes", async () => {
		rosterAnswered([LEA])
		const { panel } = watchStudio()
		await waitFor(() => expect(panel().members[0]?.name).toBe("Lea"))

		rosterAnswered([{ ...LEA, name: "Léa Martin" }])
		membersChangeAnnounced()

		await waitFor(() => expect(panel().members[0]?.name).toBe("Léa Martin"))
	})
})

const DAY_MS = 24 * 60 * 60 * 1000

const NOW = Date.parse("2026-10-19T12:00:00.000Z")

const isoAt = (moment: number) => new Date(moment).toISOString()

const BOB_SENT_AT = NOW - 9 * DAY_MS

const BOB_EXPIRED: HostedMember = {
	userId: "bob-invitation",
	name: null,
	email: "bob@example.com",
	status: "pending",
	invitation: {
		id: "bob-invitation",
		email: "bob@example.com",
		sentAt: isoAt(BOB_SENT_AT),
		expiresAt: isoAt(BOB_SENT_AT + 7 * DAY_MS),
		state: "expired",
	},
}

const invitedAt = (email: string, sentAt: number): HostedMember => ({
	userId: `${email}-invitation`,
	name: null,
	email,
	status: "pending",
	invitation: {
		id: `${email}-invitation`,
		email,
		sentAt: isoAt(sentAt),
		expiresAt: isoAt(sentAt + 7 * DAY_MS),
		state: "invited",
	},
})

const BOB_RESENT: HostedMember = {
	...invitedAt("bob@example.com", NOW),
	userId: "bob-invitation",
}

const BOB_EXPIRED_ROW: SpaceMember = {
	id: "bob-invitation",
	name: undefined,
	email: "bob@example.com",
	status: "expired",
	sentAt: BOB_SENT_AT,
}

const BOB_PENDING_ROW: SpaceMember = {
	id: "bob-invitation",
	name: undefined,
	email: "bob@example.com",
	status: "pending",
	expiresInDays: 7,
}

const ADA_NEEDS_INVITATION: Member = {
	userId: "ada",
	name: "Ada Lovelace",
	email: "ada@example.com",
	status: "needsInvitation",
}

type SignInState = { isSignedOut: boolean }

describe("useMembers on the invitations of a hosted space", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] })
		vi.setSystemTime(NOW)
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("shows an invited row with its days left rounded up and an expired row with its send date", async () => {
		const { panel } = await watchHome({
			list: vi.fn(async () =>
				ok([
					STEVE,
					invitedAt("ana@example.com", NOW - 2 * DAY_MS - 3_600_000),
					BOB_EXPIRED,
				]),
			),
		})

		expect(panel().members).toEqual([
			STEVE_ROW,
			{
				id: "ana@example.com-invitation",
				name: undefined,
				email: "ana@example.com",
				status: "pending",
				expiresInDays: 5,
			},
			BOB_EXPIRED_ROW,
		])
	})

	it("shows a new invitation with 7 days left and clears the email", async () => {
		const { panel } = await watchHome({
			list: vi.fn(async () => ok([STEVE])),
			invite: vi.fn(async () => ok(invitedAt("sam@example.com", NOW))),
		})
		act(() => panel().onEmailChange("sam@example.com"))

		act(() => panel().onInvite("sam@example.com"))
		await settle()

		expect(panel().members).toContainEqual(
			expect.objectContaining({
				email: "sam@example.com",
				status: "pending",
				expiresInDays: 7,
			}),
		)
		expect(panel().email).toBe("")
	})

	it("raises the sent notice until the expiry of the answered invitation once an invite is answered", async () => {
		const { panel, reportSuccess } = await watchHome({
			list: vi.fn(async () => ok([STEVE])),
			invite: vi.fn(async () => ok(invitedAt("sam@example.com", NOW))),
		})

		act(() => panel().onInvite(" Sam@Example.com "))
		await settle()

		expect(reportSuccess).toHaveBeenCalledOnce()
		expect(reportSuccess).toHaveBeenCalledWith({
			title: "Invitation sent to sam@example.com",
			description: "It works once, until October 26.",
		})
	})

	it("raises the sent notice from the re-sent invitation once a resend is answered", async () => {
		const { panel, reportSuccess } = await watchHome({
			list: vi.fn(async () => ok([STEVE, BOB_EXPIRED])),
			resend: vi.fn(async () =>
				ok([STEVE, invitedAt("ana@example.com", NOW - DAY_MS), BOB_RESENT]),
			),
		})

		act(() => panel().onInvite("bob@example.com"))
		await settle()

		expect(reportSuccess).toHaveBeenCalledOnce()
		expect(reportSuccess).toHaveBeenCalledWith({
			title: "Invitation sent to bob@example.com",
			description: "It works once, until October 26.",
		})
	})

	it("invites a member needing a new invitation again by their id, shows the invitation and raises the sent notice", async () => {
		const { panel, transport, reportSuccess } = await watchHome({
			list: vi.fn(async () => ok([STEVE, ADA_NEEDS_INVITATION])),
			inviteAgain: vi.fn(async () =>
				ok([STEVE, invitedAt("ada@example.com", NOW)]),
			),
		})
		const [, ada] = panel().members

		expect(ada).toEqual({
			id: "ada",
			name: "Ada Lovelace",
			email: "ada@example.com",
			status: "needsInvitation",
		})
		act(() => panel().onInviteAgain(ada))
		await settle()

		expect(transport.inviteAgain).toHaveBeenCalledExactlyOnceWith("home", "ada")
		expect(panel().members.map((member) => member.status)).toEqual([
			"host",
			"pending",
		])
		expect(reportSuccess).toHaveBeenCalledExactlyOnceWith({
			title: "Invitation sent to ada@example.com",
			description: "It works once, until October 26.",
		})
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("names the member being invited again until the host answers", async () => {
		let answer: (answered: ReturnType<typeof ok<HostedMember[]>>) => void =
			() => undefined
		const { panel } = await watchHome({
			list: vi.fn(async () => ok([STEVE, ADA_NEEDS_INVITATION])),
			inviteAgain: vi.fn(
				() =>
					new Promise<ReturnType<typeof ok<HostedMember[]>>>((resolve) => {
						answer = resolve
					}),
			),
		})

		expect(panel().invitingAgainId).toBeUndefined()
		act(() => panel().onInviteAgain(toSpaceMember(ADA_NEEDS_INVITATION)))
		await settle()
		expect(panel().invitingAgainId).toBe("ada")

		act(() => answer(ok([STEVE, invitedAt("ada@example.com", NOW)])))
		await settle()
		expect(panel().invitingAgainId).toBeUndefined()
	})

	it("raises a notice naming the removal and the unsent invitation when the invitation is refused after the removal", async () => {
		const { panel, reportSuccess } = await watchHome({
			list: vi.fn(async () => ok([STEVE, ADA_NEEDS_INVITATION])),
			inviteAgain: vi.fn(async () =>
				refused({
					kind: "removedButNotInvited",
					cause: { kind: "limitReached" },
				}),
			),
		})

		act(() => panel().onInviteAgain(toSpaceMember(ADA_NEEDS_INVITATION)))
		await settle()

		expect(raiseFailureNotice).toHaveBeenCalledExactlyOnceWith({
			title:
				"Ada Lovelace was removed, the invitation to ada@example.com wasn’t sent",
			description: "Type that address under Invite people and select Invite.",
			report: expect.objectContaining({
				context: expect.objectContaining({ raisedIn: "use-members" }),
			}),
		})
		expect(reportSuccess).not.toHaveBeenCalled()
	})

	it("raises a notice saying the invitation was sent when only the list read back failed", async () => {
		const { panel } = await watchHome({
			list: vi.fn(async () => ok([STEVE, ADA_NEEDS_INVITATION])),
			inviteAgain: vi.fn(async () =>
				refused({
					kind: "invitedButNotListed",
					cause: { kind: "unreachable", reason: "down" },
				}),
			),
		})

		act(() => panel().onInviteAgain(toSpaceMember(ADA_NEEDS_INVITATION)))
		await settle()

		expect(raiseFailureNotice).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				title: "Invitation sent to ada@example.com",
				description:
					"The member list didn’t refresh. It shows the invitation within a few seconds.",
			}),
		)
	})

	it("raises a notice saying nothing changed when the removal itself is unreachable", async () => {
		const { panel } = await watchHome({
			list: vi.fn(async () => ok([STEVE, ADA_NEEDS_INVITATION])),
			inviteAgain: vi.fn(async () =>
				refused({ kind: "unreachable", reason: "down" }),
			),
		})

		act(() => panel().onInviteAgain(toSpaceMember(ADA_NEEDS_INVITATION)))
		await settle()

		expect(raiseFailureNotice).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				title: "Couldn’t invite Ada Lovelace again",
				description: "Nothing changed, try again.",
			}),
		)
	})

	it("raises a notice saying nothing changed when invite again is refused before the removal", async () => {
		const { panel } = await watchHome({
			list: vi.fn(async () => ok([STEVE, ADA_NEEDS_INVITATION])),
			inviteAgain: vi.fn(async () => refused({ kind: "notNeedingInvitation" })),
		})

		act(() => panel().onInviteAgain(toSpaceMember(ADA_NEEDS_INVITATION)))
		await settle()

		expect(raiseFailureNotice).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				title: "Couldn’t invite Ada Lovelace again",
				description: "Nothing changed, try again.",
			}),
		)
	})

	it("raises no sent notice once a withdraw or a removal is answered", async () => {
		const samInvited = invitedAt("sam@example.com", NOW)
		const { panel, transport, reportSuccess } = await watchHome({
			list: vi.fn(async () => ok([STEVE, BOB_EXPIRED, ALEX_JOINED])),
			withdraw: vi.fn(async () => ok([STEVE, ALEX_JOINED, samInvited])),
			remove: vi.fn(async () => ok([STEVE, samInvited])),
		})

		act(() => panel().onWithdraw(BOB_EXPIRED_ROW))
		await settle()
		act(() => panel().onRemove(ALEX_JOINED_ROW))
		act(() => panel().onRemoveConfirm())
		await settle()

		expect(transport.remove).toHaveBeenCalledWith("home", "alex")
		expect(reportSuccess).toHaveBeenCalledOnce()
		expect(reportSuccess).toHaveBeenCalledWith({
			title: "Invitation to bob@example.com withdrawn",
			description: "The link in their email stops working.",
		})
	})

	it("resends an expired invitation by its id, never inviting again, and shows it pending", async () => {
		const { panel, transport } = await watchHome({
			list: vi.fn(async () => ok([STEVE, BOB_EXPIRED])),
			resend: vi.fn(async () => ok([STEVE, BOB_RESENT])),
		})

		act(() => panel().onInvite("bob@example.com"))
		await settle()

		expect(transport.resend).toHaveBeenCalledWith("home", "bob-invitation")
		expect(transport.invite).not.toHaveBeenCalled()
		expect(panel().members).toEqual([STEVE_ROW, BOB_PENDING_ROW])
	})

	it.each([
		[{ kind: "notHosting" }, "notHosting"],
		[{ kind: "notOwner" }, "notOwner"],
		[{ kind: "needsSignIn" }, "needsSignIn"],
		[{ kind: "unreachable", reason: "relay down" }, "unreachable"],
		[{ kind: "limitReached" }, "limitReached"],
		[{ kind: "unknownInvitation" }, "generic"],
		[{ kind: "alreadyInvited" }, "generic"],
	] as const)(
		"holds the invite failure of the expired email for a resend answered %o, as %s",
		async (error, reason) => {
			const { panel, reportSuccess } = await watchHome({
				list: vi.fn(async () => ok([STEVE, BOB_EXPIRED])),
				resend: vi.fn(async () => refused(error)),
			})

			act(() => panel().onInvite("bob@example.com"))
			await settle()

			expect(panel().failure).toEqual({
				action: "invite",
				reason,
				email: "bob@example.com",
			})
			expect(panel().refusal).toBeUndefined()
			expect(panel().members).toEqual([STEVE_ROW, BOB_EXPIRED_ROW])
			expect(raiseFailureNotice).not.toHaveBeenCalled()
			expect(reportSuccess).not.toHaveBeenCalled()
		},
	)

	it("holds a generic invite failure of the expired email when the resend is rejected", async () => {
		const { panel } = await watchHome({
			list: vi.fn(async () => ok([STEVE, BOB_EXPIRED])),
			resend: vi.fn(async () => {
				throw new Error("ipc closed")
			}),
		})

		act(() => panel().onInvite("bob@example.com"))
		await settle()

		expect(panel().failure).toEqual({
			action: "invite",
			reason: "generic",
			email: "bob@example.com",
		})
	})

	it("resends the expired invitation of a typed email after trimming and lowercasing it", async () => {
		const { panel, transport } = await watchHome({
			list: vi.fn(async () => ok([STEVE, BOB_EXPIRED])),
			resend: vi.fn(async () => ok([STEVE, BOB_RESENT])),
		})

		act(() => panel().onInvite(" Bob@Example.com "))
		await settle()

		expect(transport.resend).toHaveBeenCalledWith("home", "bob-invitation")
		expect(transport.invite).not.toHaveBeenCalled()
	})

	it("clears the email once a resend succeeds for the email it holds", async () => {
		const { panel } = await watchHome({
			list: vi.fn(async () => ok([STEVE, BOB_EXPIRED])),
			resend: vi.fn(async () => ok([STEVE, BOB_RESENT])),
		})
		act(() => panel().onEmailChange(" BOB@example.com "))

		act(() => panel().onInvite(" BOB@example.com "))
		await settle()

		expect(panel().email).toBe("")
	})

	it("leaves the email untouched once a resend succeeds for another email", async () => {
		const { panel } = await watchHome({
			list: vi.fn(async () => ok([STEVE, BOB_EXPIRED])),
			resend: vi.fn(async () => ok([STEVE, BOB_RESENT])),
		})
		act(() => panel().onEmailChange("ana@exa"))

		act(() => panel().onInvite("bob@example.com"))
		await settle()

		expect(panel().members).toEqual([STEVE_ROW, BOB_PENDING_ROW])
		expect(panel().email).toBe("ana@exa")
	})

	it("shows 1 day left for an invited row whose expiry has passed", async () => {
		const { panel } = await watchHome({
			list: vi.fn(async () =>
				ok([STEVE, invitedAt("ana@example.com", NOW - 8 * DAY_MS)]),
			),
		})

		expect(panel().members).toContainEqual(
			expect.objectContaining({
				email: "ana@example.com",
				status: "pending",
				expiresInDays: 1,
			}),
		)
	})

	it("maps an invited invitation past its expiry to a pending member with 1 day left", () => {
		expect(
			toSpaceMember(invitedAt("ana@example.com", NOW - 7 * DAY_MS - 1)),
		).toEqual({
			id: "ana@example.com-invitation",
			name: undefined,
			email: "ana@example.com",
			status: "pending",
			expiresInDays: 1,
		})
	})

	it("blocks the invite on signedOut while no account is signed in", async () => {
		const transport = createFakeTransport()
		const { result, rerender } = renderHook(
			({ isSignedOut }: SignInState) =>
				useMembers(HOME, true, { transport, isSignedOut }),
			{
				wrapper: createQueryTestWrapper().wrapper,
				initialProps: { isSignedOut: true },
			},
		)
		await settle()

		expect(shown(result.current).blockedBy).toBe("signedOut")

		rerender({ isSignedOut: false })
		expect(shown(result.current).blockedBy).toBeUndefined()
	})
})
