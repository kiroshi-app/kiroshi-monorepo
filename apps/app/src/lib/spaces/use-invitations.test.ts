// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import type { InvitationsTransport } from "./invitations-transport"
import { useInvitations } from "./use-invitations"

import {
	INVITATION_CHANGED_EVENT,
	type Invitation,
	type InvitationError,
	type JoinedSpace,
	type JoinedSpaceError,
} from "../bindings"
import { listen } from "../host"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("../host", () => ({
	isDesktopHost: () => true,
	listen: vi.fn(async () => () => undefined),
}))
vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["Date"],
		now: Date.parse("2026-10-10T09:00:00Z"),
	})
})

afterEach(() => {
	cleanup()
	vi.useRealTimers()
	vi.mocked(raiseFailureNotice).mockClear()
	vi.mocked(listen).mockClear()
})

const STUDIO: Invitation = {
	id: "invitation-studio",
	instanceId: "instance-studio",
	instanceName: "Studio Nord",
	inviterEmail: "lea@example.com",
	invitedAt: "2026-10-08T09:00:00Z",
	expiresAt: "2026-10-15T09:00:00Z",
}

const JOINED_STUDIO: JoinedSpace = {
	id: "joined-studio",
	hostUrl: "wss://cloud.kiroshi.test/instances/instance-studio/relay/member",
	remoteSpaceId: null,
	name: "Studio Nord",
	state: "online",
}

const WAITING_ROW = {
	id: STUDIO.instanceId,
	name: "Studio Nord",
	hostEmail: "lea@example.com",
	state: "waiting",
}

const OFFLINE: InvitationError = { kind: "offline", reason: "no route" }

const ACCEPT_OFFLINE: JoinedSpaceError = {
	kind: "relayUnreachable",
	detail: "no route",
}

const ACCEPT_SERVERS: JoinedSpaceError = {
	kind: "couldNotAccept",
	detail: "timed out",
}

const STORAGE: InvitationError = { kind: "storage", detail: "disk full" }

const settle = () =>
	act(async () => {
		for (let round = 0; round < 3; round += 1) {
			await new Promise((resolve) => setTimeout(resolve, 0))
		}
	})

const transportFake = (listed: Invitation[]) => ({
	list: vi.fn(async () => listed),
	accept: vi.fn(async (_id: string) => JOINED_STUDIO),
	decline: vi.fn(async (_id: string) => undefined),
	onJoinLinkOpened: vi.fn(
		async (_listener: (invitationId: string) => void) => () => undefined,
	),
	askForJoinLinks: vi.fn(async () => undefined),
})

const changeAnnounced = () => {
	const [, announce] =
		vi
			.mocked(listen)
			.mock.calls.find(([event]) => event === INVITATION_CHANGED_EVENT) ?? []
	announce?.({ event: INVITATION_CHANGED_EVENT, id: 1, payload: null }, null)
}

const gearFor = async (listed: Invitation[] = [STUDIO]) => {
	const transport = transportFake(listed)
	const admit = vi.fn(async (_joined: JoinedSpace) => {})
	const { result, rerender } = renderHook(
		() =>
			useInvitations(
				{ admit },
				{ transport: transport satisfies InvitationsTransport },
			),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
	await settle()
	const announce = async (invitations: Invitation[]) => {
		transport.list.mockResolvedValue(invitations)
		changeAnnounced()
		await settle()
	}
	const accept = async (id: string) => {
		act(() => result.current.accept(id))
		await settle()
	}
	const decline = async (id: string) => {
		act(() => result.current.decline(id))
		await settle()
	}
	const rows = () => result.current.rows
	return {
		transport,
		admit,
		announce,
		accept,
		decline,
		rows,
		rerender,
		sweep: () => act(() => result.current.sweepWithdrawn()),
	}
}

type Gear = Awaited<ReturnType<typeof gearFor>>

describe("listing invitations", () => {
	it("shows every listed invitation as a waiting row", async () => {
		const gear = await gearFor()

		expect(gear.rows()).toEqual([WAITING_ROW])
	})

	it("reads the list once for two readers mounted together", async () => {
		const transport = transportFake([STUDIO])
		const admit = vi.fn()
		const { result } = renderHook(
			() => [
				useInvitations({ admit }, { transport }),
				useInvitations({ admit }, { transport }),
			],
			{ wrapper: createQueryTestWrapper().wrapper },
		)

		await waitFor(() =>
			expect(result.current.map(({ rows }) => rows)).toEqual([
				[WAITING_ROW],
				[WAITING_ROW],
			]),
		)
		expect(transport.list).toHaveBeenCalledOnce()
	})

	it("reads the rows again when the invitations change", async () => {
		const gear = await gearFor([])

		await gear.announce([STUDIO])

		expect(gear.rows()).toEqual([WAITING_ROW])
	})

	it("shows nothing and reports nothing while signed out", async () => {
		const transport = transportFake([])
		transport.list.mockRejectedValueOnce({ kind: "notSignedIn" })
		const { result } = renderHook(
			() => useInvitations({ admit: vi.fn() }, { transport }),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		expect(result.current.rows).toEqual([])
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("shows an invitation past its expiry as expired with its date", async () => {
		const lapsed = { ...STUDIO, expiresAt: "2026-10-09T09:00:00Z" }

		const gear = await gearFor([lapsed])

		expect(gear.rows()).toEqual([
			{
				...WAITING_ROW,
				state: "expired",
				expiresAt: Date.parse(lapsed.expiresAt),
			},
		])
	})

	it("raises a list it could not read, naming the reason", async () => {
		const transport = transportFake([])
		transport.list.mockRejectedValueOnce(STORAGE)
		renderHook(() => useInvitations({ admit: vi.fn() }, { transport }), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				description: "disk full",
				report: expect.objectContaining({
					context: expect.objectContaining({ raisedIn: "use-invitations" }),
				}),
			}),
		)
	})
})

describe("accepting an invitation", () => {
	it("shows the row as accepting while the accept runs", async () => {
		const gear = await gearFor()
		gear.transport.accept.mockReturnValueOnce(new Promise(() => {}))

		await gear.accept(STUDIO.instanceId)

		expect(gear.rows()).toEqual([{ ...WAITING_ROW, state: "accepting" }])
	})

	it("drops the row and hands the joined space over with its inviter", async () => {
		const gear = await gearFor()

		await gear.accept(STUDIO.instanceId)

		expect(gear.transport.accept).toHaveBeenCalledWith(STUDIO.id)
		expect(gear.rows()).toEqual([])
		expect(gear.admit).toHaveBeenCalledWith(JOINED_STUDIO)
	})

	it("keeps an accepting row the refreshed list no longer carries", async () => {
		const gear = await gearFor()
		gear.transport.accept.mockReturnValueOnce(new Promise(() => {}))
		await gear.accept(STUDIO.instanceId)

		await gear.announce([])

		expect(gear.rows()).toEqual([{ ...WAITING_ROW, state: "accepting" }])
	})

	it("accepts a row once while its accept runs", async () => {
		const gear = await gearFor()
		gear.transport.accept.mockReturnValueOnce(new Promise(() => {}))

		await gear.accept(STUDIO.instanceId)
		await gear.accept(STUDIO.instanceId)

		expect(gear.transport.accept).toHaveBeenCalledOnce()
	})

	it.each([
		[ACCEPT_SERVERS, "servers"],
		[ACCEPT_OFFLINE, "offline"],
	])(
		"keeps the row failed on %o and accepts again on Try again",
		async (error, failure) => {
			const gear = await gearFor()
			gear.transport.accept.mockRejectedValueOnce(error)

			await gear.accept(STUDIO.instanceId)

			expect(gear.rows()).toEqual([
				{ ...WAITING_ROW, state: "failed", failure },
			])
			expect(raiseFailureNotice).not.toHaveBeenCalled()

			await gear.accept(STUDIO.instanceId)

			expect(gear.transport.accept).toHaveBeenCalledTimes(2)
			expect(gear.admit).toHaveBeenCalledWith(JOINED_STUDIO)
		},
	)

	it("shows a withdrawn invitation as withdrawn until the list drops it", async () => {
		const gear = await gearFor()
		gear.transport.accept.mockRejectedValueOnce({
			kind: "invitationWithdrawn",
		})

		await gear.accept(STUDIO.instanceId)

		expect(gear.rows()).toEqual([{ ...WAITING_ROW, state: "withdrawn" }])
		expect(gear.admit).not.toHaveBeenCalled()

		await gear.announce([])

		expect(gear.rows()).toEqual([])
	})

	it.each(["invitationWithdrawn", "invitationUsed"])(
		"shows the row withdrawn when the accept answers %s",
		async (kind) => {
			const gear = await gearFor()
			gear.transport.accept.mockRejectedValueOnce({ kind })

			await gear.accept(STUDIO.instanceId)

			expect(gear.rows()).toEqual([{ ...WAITING_ROW, state: "withdrawn" }])
			expect(raiseFailureNotice).not.toHaveBeenCalled()
		},
	)

	it("shows the row expired with its date when the accept answers it expired", async () => {
		const gear = await gearFor()
		gear.transport.accept.mockRejectedValueOnce({ kind: "invitationExpired" })

		await gear.accept(STUDIO.instanceId)

		expect(gear.rows()).toEqual([
			{
				...WAITING_ROW,
				state: "expired",
				expiresAt: Date.parse(STUDIO.expiresAt),
			},
		])
		expect(gear.admit).not.toHaveBeenCalled()
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("raises an invitation for another email and keeps the row on Accept", async () => {
		const gear = await gearFor()
		gear.transport.accept.mockRejectedValueOnce({
			kind: "invitationOtherEmail",
		})

		await gear.accept(STUDIO.instanceId)

		expect(gear.rows()).toEqual([WAITING_ROW])
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "This invitation is for another email",
			}),
		)
	})
})

describe("declining an invitation", () => {
	it("declines and removes the row without reporting anything", async () => {
		const gear = await gearFor()

		await gear.decline(STUDIO.instanceId)

		expect(gear.transport.decline).toHaveBeenCalledWith(STUDIO.id)
		expect(gear.rows()).toEqual([])
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("raises a failed decline and keeps the row", async () => {
		const gear = await gearFor()
		gear.transport.decline.mockRejectedValueOnce(OFFLINE)

		await gear.decline(STUDIO.instanceId)

		expect(gear.rows()).toEqual([WAITING_ROW])
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({ description: "no route" }),
		)
	})
})

describe("sweeping withdrawn invitations when the switcher closes", () => {
	const HARBOUR: Invitation = {
		id: "invitation-harbour",
		instanceId: "instance-harbour",
		instanceName: "Harbour",
		inviterEmail: "sam@example.com",
		invitedAt: "2026-10-08T10:00:00Z",
		expiresAt: "2026-10-15T09:00:00Z",
	}

	const HARBOUR_ROW = {
		id: HARBOUR.instanceId,
		name: "Harbour",
		hostEmail: "sam@example.com",
		state: "waiting",
	}

	const withdrawnGear = async (listed: Invitation[] = [STUDIO]) => {
		const gear = await gearFor(listed)
		gear.transport.accept.mockRejectedValueOnce({
			kind: "invitationWithdrawn",
		})
		await gear.accept(STUDIO.instanceId)
		return gear
	}

	it("removes every withdrawn invitation", async () => {
		const gear = await withdrawnGear()

		gear.sweep()

		expect(gear.rows()).toEqual([])
	})

	const HARBOUR_STATES: [string, (gear: Gear) => Promise<unknown>][] = [
		["waiting", async () => undefined],
		[
			"accepting",
			async (gear) => {
				gear.transport.accept.mockReturnValueOnce(new Promise(() => {}))
				await gear.accept(HARBOUR.instanceId)
			},
		],
		[
			"failed",
			async (gear) => {
				gear.transport.accept.mockRejectedValueOnce(ACCEPT_OFFLINE)
				await gear.accept(HARBOUR.instanceId)
			},
		],
	]

	it.each(HARBOUR_STATES)(
		"keeps a %s invitation with its status",
		async (state, reach) => {
			const gear = await withdrawnGear([STUDIO, HARBOUR])
			await reach(gear)
			const harbourRow = gear
				.rows()
				.find((row) => row.id === HARBOUR.instanceId)

			gear.sweep()

			expect(harbourRow?.state).toBe(state)
			expect(gear.rows()).toEqual([harbourRow])
		},
	)

	it("keeps a swept invitation out when the list still carries it", async () => {
		const gear = await withdrawnGear([STUDIO, HARBOUR])
		gear.sweep()

		await gear.announce([STUDIO, HARBOUR])

		expect(gear.rows()).toEqual([HARBOUR_ROW])
	})

	it("shows a new invitation for the same space as waiting", async () => {
		const gear = await withdrawnGear()
		gear.sweep()
		await gear.announce([])

		await gear.announce([{ ...STUDIO, invitedAt: "2026-10-09T09:00:00Z" }])

		expect(gear.rows()).toEqual([WAITING_ROW])
	})
})

describe("opening a join link", () => {
	const linkOpened = async (gear: Gear, invitationId: string) => {
		const [listener] = gear.transport.onJoinLinkOpened.mock.calls[0] ?? []
		act(() => listener?.(invitationId))
		await settle()
	}

	it("asks for join links once its listener is attached", async () => {
		const transport = transportFake([STUDIO])
		let attach = (_unlisten: () => undefined) => {}
		transport.onJoinLinkOpened.mockReturnValueOnce(
			new Promise<() => undefined>((resolve) => {
				attach = resolve
			}),
		)
		renderHook(() => useInvitations({ admit: vi.fn() }, { transport }), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(transport.askForJoinLinks).not.toHaveBeenCalled()

		attach(() => undefined)
		await settle()

		expect(transport.askForJoinLinks).toHaveBeenCalledOnce()
	})

	it("asks for join links once under strict mode", async () => {
		const transport = transportFake([STUDIO])
		renderHook(() => useInvitations({ admit: vi.fn() }, { transport }), {
			wrapper: createQueryTestWrapper().wrapper,
			reactStrictMode: true,
		})
		await settle()

		expect(transport.askForJoinLinks).toHaveBeenCalledOnce()
	})

	it("raises nothing for a listed invitation", async () => {
		const gear = await gearFor()

		await linkOpened(gear, STUDIO.id)

		expect(gear.transport.list).toHaveBeenCalledOnce()
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("reads the list again and raises nothing when the invitation appears", async () => {
		const gear = await gearFor([])
		gear.transport.list.mockResolvedValue([STUDIO])

		await linkOpened(gear, STUDIO.id)

		expect(gear.transport.list).toHaveBeenCalledTimes(2)
		expect(gear.rows()).toEqual([WAITING_ROW])
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("reads the list once more, then raises an invitation still missing", async () => {
		const gear = await gearFor()

		await linkOpened(gear, "invitation-elsewhere")

		expect(gear.transport.list).toHaveBeenCalledTimes(2)
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({ title: "You’re not invited to this space" }),
		)
	})
})
