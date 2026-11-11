// @vitest-environment happy-dom

import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useWorkspaceNavigation } from "@/components/workspace-navigation"
import type { HostingState, Space } from "@/lib/bindings"
import { hostQueryKeys } from "@/lib/host/host-query-keys"
import type { HostedMember } from "@/lib/host/members-transport"
import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import type { JoinedSpacesController } from "@/lib/spaces/joined-spaces-controller"
import { useSwitcherSpaces } from "@/lib/spaces/use-joined-spaces"
import { createWorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterLists } from "@/lib/workspace/use-roster-lists"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"

type HostBoundaries = {
	members: HostedMember[]
	hosting: HostingState
}

const host = vi.hoisted(
	(): HostBoundaries => ({ members: [], hosting: { kind: "off" } }),
)

const readMembers = vi.hoisted(() =>
	vi.fn(async () => ({ status: "ok" as const, data: host.members })),
)

vi.mock("@/lib/host/index", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/index")>()),
	isDesktopHost: () => true,
}))

vi.mock("@/lib/host/members-transport", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("@/lib/host/members-transport")>()
	return {
		...original,
		membersTransport: {
			...original.membersTransport,
			list: readMembers,
			onChanged: async () => () => undefined,
		},
	}
})

vi.mock("@/lib/host/hosting-transport", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("@/lib/host/hosting-transport")>()
	return {
		...original,
		hostingTransport: {
			...original.hostingTransport,
			read: async () => host.hosting,
		},
	}
})

const HOSTED_HERE: Space = {
	id: "atelier",
	name: "Atelier",
	colour: 42,
	position: 0,
	createdAt: 0,
	shared: false,
	instanceId: "instance-of-atelier",
}

const OWNER: HostedMember = {
	userId: "owner",
	name: "Shoto",
	email: "shoto@example.com",
	status: "host",
}

const MEMBER: HostedMember = {
	userId: "lea",
	name: "Lea",
	email: "lea@example.com",
	status: "joined",
}

const NO_INVITATIONS = {
	rows: [],
	termsOf: () => undefined,
	joinedIdOf: () => undefined,
	accept: () => undefined,
	decline: () => undefined,
	sweepWithdrawn: () => undefined,
}

const useNavigationOfSpaceHostedHere = () => {
	const switcher = useSwitcherSpaces(
		{ spaces: [HOSTED_HERE], selectedSpaceId: HOSTED_HERE.id },
		{
			state: {
				joinedSpaces: [],
				hasFailedToLoad: false,
				openId: null,
				departed: null,
			},
			controller: {} as JoinedSpacesController,
			hosts: { active: null, connections: {} },
		},
		NO_INVITATIONS,
	)
	return useWorkspaceNavigation({
		navigation: {} as SettingsNavigation,
		overlay: {
			search: { isOpen: false, open: () => {} },
		} as unknown as WorkspaceOverlay,
		rosterLines: {
			sidebarActions: { onCreateSpace: () => undefined },
		} as RosterLines,
		rosterLists: { badgesBySpaceId: {} } as RosterLists,
		switcher,
		tabs: createWorkspaceTabs(),
		onSelectSpace: () => undefined,
	})
}

const hostOfSpaceHostedHere = async (boundaries: HostBoundaries) => {
	Object.assign(host, boundaries)
	const { queryClient, wrapper } = createQueryTestWrapper()
	const { result } = renderHook(useNavigationOfSpaceHostedHere, { wrapper })
	await waitFor(() => {
		expect(readMembers.mock.settledResults[0]?.type).toBe("fulfilled")
		expect(
			queryClient.getQueryState(hostQueryKeys.hostingStateOf(HOSTED_HERE.id))
				?.status,
		).toBe("success")
	})
	return result.current.sidebar.hostBySpaceId?.[HOSTED_HERE.id]
}

afterEach(() => {
	cleanup()
	readMembers.mockClear()
})

describe("the Space switcher of a Space hosted from this computer", () => {
	it("reads up when the Space has members and its hosting reads online", async () => {
		expect(
			await hostOfSpaceHostedHere({
				members: [OWNER, MEMBER],
				hosting: { kind: "online" },
			}),
		).toBe("up")
	})

	it("reads down when the Space has members and its hosting reads stopped", async () => {
		expect(
			await hostOfSpaceHostedHere({
				members: [OWNER, MEMBER],
				hosting: { kind: "off" },
			}),
		).toBe("down")
	})

	it("reads no host when the Space has no members", async () => {
		expect(
			await hostOfSpaceHostedHere({
				members: [OWNER],
				hosting: { kind: "online" },
			}),
		).toBeUndefined()
	})
})
