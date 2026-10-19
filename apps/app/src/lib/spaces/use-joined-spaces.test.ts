// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import type { InvitationsTransport } from "./invitations-transport"
import { createJoinedSpacesController } from "./joined-spaces-controller"
import { spaceQueryKeys } from "./space-query-keys"
import { createSpacesController } from "./spaces-controller"
import { useInvitations } from "./use-invitations"
import { useOpenJoinedHost, useSwitcherSpaces } from "./use-joined-spaces"

import type { Invitation, JoinedSpace } from "../bindings"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { JoinedHostState } from "../host/joined-hosts"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("../host", async (importOriginal) => ({
	...(await importOriginal<typeof import("../host")>()),
	isDesktopHost: () => true,
	listen: vi.fn(async () => () => undefined),
}))

afterEach(cleanup)

const STUDIO: Invitation = {
	id: "invitation-studio",
	instanceId: "instance-studio",
	instanceName: "Studio Nord",
	inviterEmail: "lea@example.com",
	invitedAt: "2026-10-08T09:00:00Z",
	expiresAt: "2026-10-15T09:00:00Z",
}

const transport = {
	list: vi.fn(async () => [STUDIO]),
	accept: vi.fn(async () => {
		throw { kind: "invitationWithdrawn" }
	}),
	decline: vi.fn(async () => undefined),
} satisfies InvitationsTransport

const renderSwitcher = async () => {
	const { queryClient, wrapper } = createQueryTestWrapper()
	const joinedController = createJoinedSpacesController({
		queryClient,
		spaces: createSpacesController(createFakeTranscriptStore(), {
			queryClient,
		}),
	})
	const { result } = renderHook(
		() =>
			useSwitcherSpaces(
				{ spaces: [], selectedSpaceId: null },
				{
					state: joinedController.getState(),
					controller: joinedController,
					hosts: { active: null, connections: {} },
				},
				useInvitations(joinedController, { transport }),
			),
		{ wrapper },
	)
	await waitFor(() => expect(result.current.invitations).toHaveLength(1))
	act(() => result.current.onAcceptInvitation(STUDIO.instanceId))
	await waitFor(() => expect(statesOf(result.current)).toEqual(["withdrawn"]))
	return result
}

const statesOf = (switcher: { invitations: { state: string }[] }) =>
	switcher.invitations.map((row) => row.state)

it("keeps the withdrawn row while the switcher opens", async () => {
	const switcher = await renderSwitcher()

	act(() => switcher.current.onSpaceSwitcherOpenChange(true))

	expect(statesOf(switcher.current)).toEqual(["withdrawn"])
})

it("drops the withdrawn row when the switcher closes", async () => {
	const switcher = await renderSwitcher()

	act(() => switcher.current.onSpaceSwitcherOpenChange(false))

	expect(statesOf(switcher.current)).toEqual([])
})

const STUDIO_SPACE: JoinedSpace = {
	id: "joined-studio",
	hostUrl: "wss://cloud.kiroshi.test/instances/studio/relay/member",
	remoteSpaceId: "studio",
	name: "Studio Nord",
	state: "online",
}

const openStudio = async () => {
	const store = createFakeTranscriptStore()
	const home = await store.createSpace("Home")
	const { queryClient } = createQueryTestWrapper()
	const spaces = createSpacesController(store, { queryClient })
	await spaces.load(home.id)
	queryClient.setQueryData(spaceQueryKeys.joinedMembersOf(STUDIO_SPACE.id), [
		{ userId: "u-lea", name: "Lea", role: "host" },
	])
	const joined = createJoinedSpacesController({
		queryClient,
		spaces,
		hosts: {
			getState: () => ({ active: null, connections: {} }),
			connect: async () => undefined,
			activate: async () => undefined,
			forget: () => undefined,
		},
		transport: {
			list: async () => [STUDIO_SPACE],
			remove: async () => undefined,
			onChanged: async () => () => undefined,
			onRemoved: async () => () => undefined,
		},
	})
	await joined.admit(STUDIO_SPACE)
	return { home, spaces, joined }
}

const renderOpenHost = async (connection: JoinedHostState) => {
	const { spaces, joined } = await openStudio()
	return renderHook(
		({ status }: { status: JoinedHostState }) =>
			useOpenJoinedHost(spaces.getState().selectedSpaceId, {
				state: joined.getState(),
				controller: joined,
				hosts: {
					active: STUDIO_SPACE.id,
					connections: { [STUDIO_SPACE.id]: status },
				},
			}),
		{ initialProps: { status: connection } },
	)
}

it("reads the host name and the host presence of the open joined space", async () => {
	const { result } = await renderOpenHost({ status: "up" })

	expect(result.current).toEqual({
		spaceName: "Studio Nord",
		hostName: "Lea",
		isOnline: true,
		isDown: false,
	})
})

it.each<[string, JoinedHostState]>([
	["connecting", { status: "connecting" }],
	["refused", { status: "refused", failure: "Couldn’t open this space" }],
	["down", { status: "down" }],
])("reads the host offline while it is %s", async (_, connection) => {
	const { result } = await renderOpenHost(connection)

	expect(result.current?.isOnline).toBe(false)
})

it("reads the host offline while it has no connection entry yet", async () => {
	const { spaces, joined } = await openStudio()

	const { result } = renderHook(() =>
		useOpenJoinedHost(spaces.getState().selectedSpaceId, {
			state: joined.getState(),
			controller: joined,
			hosts: { active: STUDIO_SPACE.id, connections: {} },
		}),
	)

	expect(result.current?.isOnline).toBe(false)
})

it.each<[string, JoinedHostState, boolean]>([
	["connecting", { status: "connecting" }, false],
	[
		"refused",
		{ status: "refused", failure: "Couldn’t open this space" },
		false,
	],
	["down", { status: "down" }, true],
	["up", { status: "up" }, false],
])(
	"reads the host down only on a down link, here %s",
	async (_, connection, isDown) => {
		const { result } = await renderOpenHost(connection)

		expect(result.current?.isDown).toBe(isDown)
	},
)

it("follows the host going offline and coming back without a reload", async () => {
	const { result, rerender } = await renderOpenHost({ status: "up" })

	rerender({ status: { status: "down" } })
	expect(result.current?.isOnline).toBe(false)

	rerender({ status: { status: "up" } })
	expect(result.current?.isOnline).toBe(true)
})

it("reads no joined host while a local space is open", async () => {
	const { home, spaces, joined } = await openStudio()
	joined.selectSpace(home.id)

	const { result } = renderHook(() =>
		useOpenJoinedHost(spaces.getState().selectedSpaceId, {
			state: joined.getState(),
			controller: joined,
			hosts: { active: null, connections: {} },
		}),
	)

	expect(result.current).toBeNull()
})
