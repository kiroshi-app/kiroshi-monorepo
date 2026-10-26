// @vitest-environment happy-dom

import { createMemoryHistory, RouterProvider } from "@tanstack/react-router"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import { WorkspaceRail } from "@/components/workspace-rail"
import type { JoinedSpace, Space } from "@/lib/bindings"
import { newBotIdentity } from "@/lib/bots/bot-settings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import type { JoinedSpacesController } from "@/lib/spaces/joined-spaces-controller"
import { joinedRowIdOf } from "@/lib/spaces/joined-spaces-controller"
import { useSwitcherSpaces } from "@/lib/spaces/use-joined-spaces"
import { readMirror, writeMirror } from "@/lib/user/preferences-mirror"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterLists } from "@/lib/workspace/use-roster-lists"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { useSidebarPanelSwitch } from "@/lib/workspace/use-sidebar-panel-switch"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"

type MountedApp = {
	store: TranscriptStore | null
	openJoinedSpace: JoinedSpace | null
}

const mounted = vi.hoisted(
	(): MountedApp => ({ store: null, openJoinedSpace: null }),
)

vi.mock("@/lib/conversations/create-store", () => ({
	createTranscriptStore: () => mounted.store,
}))

vi.mock("@/lib/host/index", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/index")>()),
	isDesktopHost: () => false,
}))

vi.mock("@/lib/chat/create-driver", async () => {
	const { withFakeHostWrites } = await import(
		"@/lib/conversations/fake-host-writes"
	)
	return {
		createChatDriver: (store: TranscriptStore) =>
			withFakeHostWrites(createFakeChatDriver({ stepMs: 1 }), store),
	}
})

vi.mock("@/lib/spaces/use-joined-spaces", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("@/lib/spaces/use-joined-spaces")>()
	const useJoinedSpaces: typeof original.useJoinedSpaces = (...args) => {
		const joinedSpaces = original.useJoinedSpaces(...args)
		const open = mounted.openJoinedSpace
		return open
			? {
					...joinedSpaces,
					state: {
						...joinedSpaces.state,
						joinedSpaces: [open],
						openId: open.id,
					},
				}
			: joinedSpaces
	}
	return { ...original, useJoinedSpaces }
})

const { createWorkspaceRouter } = await import("@/workspace-router")

const OWNED = { position: 0, createdAt: 0, shared: false }
const HOME: Space = { ...OWNED, id: "home", name: "Home", colour: "red" }
const GARAGE: Space = { ...OWNED, id: "garage", name: "Garage", colour: "blue" }
const STUDIO: JoinedSpace = {
	id: "studio-host",
	hostUrl: "https://studio.example",
	remoteSpaceId: "studio",
	name: "Studio Nord",
	state: "online",
	hostedBy: "Lea",
	colour: "purple",
}
const SPACE_SETTINGS = i18n.t("bots:rail.spaceSettings")
const SETTINGS_RAILS: SettingsPanels["railSettings"][] = ["space", "you"]

const NO_INVITATIONS = {
	rows: [],
	termsOf: () => undefined,
	joinedIdOf: () => undefined,
	accept: () => undefined,
	decline: () => undefined,
	sweepWithdrawn: () => undefined,
}

type RailHarnessProps = {
	selectedSpaceId: string
	railSettings?: SettingsPanels["railSettings"]
	navigation?: Partial<SettingsNavigation>
}

const RailHarness = ({
	selectedSpaceId,
	railSettings = "space",
	navigation = {},
}: RailHarnessProps) => {
	const switcher = useSwitcherSpaces(
		{ spaces: [HOME, GARAGE], selectedSpaceId },
		{
			state: {
				joinedSpaces: [STUDIO],
				hasFailedToLoad: false,
				openId: STUDIO.id,
				departed: null,
			},
			controller: {} as JoinedSpacesController,
			hosts: { active: null, connections: {} },
		},
		NO_INVITATIONS,
	)
	return createElement(WorkspaceRail, {
		collapsedSectionIds: [],
		core: {} as WorkspaceCore,
		navigation: navigation as SettingsNavigation,
		overlay: {} as WorkspaceOverlay,
		panels: { railSettings } as SettingsPanels,
		requestLeave: (leave) => leave(),
		rosterLines: {} as RosterLines,
		rosterLists: {} as RosterLists,
		sidebarTab: { openTab: "conversations" } as ReturnType<
			typeof useSidebarPanelSwitch
		>,
		space: switcher.selectedSpace,
	})
}

const railLogoTint = () =>
	screen
		.getByRole("button", { name: SPACE_SETTINGS })
		.querySelector<HTMLElement>("[data-slot='space-dot']")?.style
		.backgroundColor

afterEach(cleanup)

describe.each(SETTINGS_RAILS)(
	"the rail on the %s settings screen",
	(railSettings) => {
		it("wears the colour of the owned Space that is open", () => {
			render(
				createElement(RailHarness, { selectedSpaceId: HOME.id, railSettings }),
			)

			expect(railLogoTint()).toBe("var(--bot-blot-red)")
		})

		it("wears the host colour of the joined Space that is open", () => {
			render(
				createElement(RailHarness, {
					selectedSpaceId: "studio",
					railSettings,
				}),
			)

			expect(railLogoTint()).toBe("var(--bot-blot-purple)")
		})

		it("repaints its logo when another Space is selected", () => {
			const { rerender } = render(
				createElement(RailHarness, { selectedSpaceId: HOME.id, railSettings }),
			)
			expect(railLogoTint()).toBe("var(--bot-blot-red)")

			rerender(
				createElement(RailHarness, {
					selectedSpaceId: GARAGE.id,
					railSettings,
				}),
			)

			expect(railLogoTint()).toBe("var(--bot-blot-blue)")
		})
	},
)

describe("the rail on a settings screen", () => {
	it("falls back to the first Space when none matches the selection", () => {
		render(createElement(RailHarness, { selectedSpaceId: "gone" }))

		expect(railLogoTint()).toBe("var(--bot-blot-red)")
	})

	it("opens the selected Space settings when its logo is pressed", () => {
		const openSpaceSettings = vi.fn()
		render(
			createElement(RailHarness, {
				selectedSpaceId: GARAGE.id,
				navigation: { openSpaceSettings },
			}),
		)

		fireEvent.click(screen.getByRole("button", { name: SPACE_SETTINGS }))

		expect(openSpaceSettings).toHaveBeenCalledExactlyOnceWith(GARAGE.id)
	})
})

const SETTLE_MS = 200

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(SETTLE_MS)
	})
}

const PERSONAL_SPACE_ID = "personal"

const HOST_OF_PERSONAL: JoinedSpace = {
	...STUDIO,
	remoteSpaceId: PERSONAL_SPACE_ID,
}

type OpenSpace = {
	label: string
	joined: JoinedSpace | null
	rowId: string
	colour: string
}

const OPEN_SPACES: OpenSpace[] = [
	{ label: "an owned", joined: null, rowId: PERSONAL_SPACE_ID, colour: "red" },
	{
		label: "a joined",
		joined: HOST_OF_PERSONAL,
		rowId: joinedRowIdOf(HOST_OF_PERSONAL.id),
		colour: "purple",
	},
]

const mountAppAtConversations = async (joined: JoinedSpace | null) => {
	writeMirror({ ...readMirror(), firstRunDone: true })
	const store = createFakeTranscriptStore()
	const companion = await store.createBot(newBotIdentity([]), PERSONAL_SPACE_ID)
	mounted.store = store
	mounted.openJoinedSpace = joined
	vi.useFakeTimers()
	const router = createWorkspaceRouter(
		createMemoryHistory({ initialEntries: ["/"] }),
	)
	render(createElement(RouterProvider, { router }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
	return { router, companionId: companion.id }
}

type WorkspaceRouter = Awaited<
	ReturnType<typeof mountAppAtConversations>
>["router"]

type SettingsRoute = {
	path: string
	open: (router: WorkspaceRouter, ids: SettingsIds) => Promise<void>
}

type SettingsIds = { spaceRowId: string; companionId: string }

const SETTINGS_ROUTES: SettingsRoute[] = [
	{
		path: "/settings/space/$spaceId",
		open: (router, { spaceRowId }) =>
			router.navigate({
				to: "/settings/space/$spaceId",
				params: { spaceId: spaceRowId },
				search: {},
			}),
	},
	{
		path: "/settings/user",
		open: (router) => router.navigate({ to: "/settings/user", search: {} }),
	},
	{
		path: "/settings/companion/$companionId",
		open: (router, { companionId }) =>
			router.navigate({
				to: "/settings/companion/$companionId",
				params: { companionId },
				search: {},
			}),
	},
]

const shellTint = () =>
	document.body
		.querySelector<HTMLElement>("[data-space-tint]")
		?.getAttribute("data-space-tint")

describe.each(OPEN_SPACES)(
	"the app with $label Space open",
	({ joined, rowId, colour }) => {
		afterEach(() => {
			vi.useRealTimers()
			mounted.store = null
			mounted.openJoinedSpace = null
		})

		it("paints the rail logo of the conversations sidebar with the selected Space", async () => {
			await mountAppAtConversations(joined)

			expect(railLogoTint()).toBe(`var(--bot-blot-${colour})`)
		})

		it.each(SETTINGS_ROUTES)(
			"keeps the shell tint of / on $path",
			async ({ open }) => {
				const { router, companionId } = await mountAppAtConversations(joined)
				expect(shellTint()).toBe(colour)

				await act(() => open(router, { spaceRowId: rowId, companionId }))
				await settle()

				expect(router.state.location.pathname).not.toBe("/")
				expect(shellTint()).toBe(colour)
			},
		)
	},
)
