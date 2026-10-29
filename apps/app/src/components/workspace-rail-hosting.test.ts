// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppRail } from "@workspace/ui/components/app-rail"
import { i18n } from "@workspace/ui/lib/i18n"

import { useWorkspaceRail } from "@/components/workspace-rail"
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
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { useSidebarPanelSwitch } from "@/lib/workspace/use-sidebar-panel-switch"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"
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

const RailOfSpaceHostedHere = () => {
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
	const { rail, currentSpace, currentSpaceHost } = useWorkspaceRail({
		collapsedSectionIds: [],
		core: { sections: { state: { sections: {} } } } as WorkspaceCore,
		navigation: {} as SettingsNavigation,
		overlay: {} as WorkspaceOverlay,
		panels: { railSettings: undefined } as SettingsPanels,
		rosterLines: {
			sidebarActions: { onCreateSpace: () => undefined },
		} as RosterLines,
		rosterLists: { badgesBySpaceId: {} } as RosterLists,
		sidebarTab: { openTab: "conversations" } as ReturnType<
			typeof useSidebarPanelSwitch
		>,
		switcher,
		tabs: createWorkspaceTabs(),
		onSelectSpace: () => undefined,
	})
	return createElement(AppRail, {
		...rail,
		space: currentSpace,
		spaceHost: currentSpaceHost,
	})
}

const mountRail = async (boundaries: HostBoundaries) => {
	Object.assign(host, boundaries)
	const { queryClient, wrapper } = createQueryTestWrapper()
	render(createElement(RailOfSpaceHostedHere), { wrapper })
	await waitFor(() => {
		expect(readMembers).toHaveBeenCalledWith(HOSTED_HERE.id)
		expect(
			queryClient.getQueryState(hostQueryKeys.hostingStateOf(HOSTED_HERE.id))
				?.status,
		).toBe("success")
	})
}

const railSpaceAvatarState = () =>
	screen
		.getByRole("navigation", { name: i18n.t("bots:rail.label") })
		.querySelector<HTMLElement>("[data-slot='space-avatar']")?.dataset.state

afterEach(() => {
	cleanup()
	readMembers.mockClear()
})

describe("the rail logo of a Space hosted from this computer", () => {
	it("is online when the Space has members and its hosting reads online", async () => {
		await mountRail({ members: [OWNER, MEMBER], hosting: { kind: "online" } })

		await waitFor(() => expect(railSpaceAvatarState()).toBe("online"))
	})

	it("is offline when the Space has members and its hosting reads stopped", async () => {
		await mountRail({ members: [OWNER, MEMBER], hosting: { kind: "off" } })

		await waitFor(() => expect(railSpaceAvatarState()).toBe("offline"))
	})

	it("is local when the Space has no members", async () => {
		await mountRail({ members: [OWNER], hosting: { kind: "online" } })

		await waitFor(() => expect(railSpaceAvatarState()).toBe("local"))
	})
})
