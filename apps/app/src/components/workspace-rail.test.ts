// @vitest-environment happy-dom

import { RouterProvider } from "@tanstack/react-router"
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react"
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
import { createWorkspaceTabs } from "@/lib/tabs/workspace-tabs"
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

const OWNED = { position: 0, createdAt: 0, shared: false, instanceId: null }
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
	instanceId: "instance-of-studio-host",
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
	onSelectSpace?: (id: string) => void
}

const RailHarness = ({
	selectedSpaceId,
	railSettings = "space",
	navigation = {},
	onSelectSpace = () => undefined,
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
		rosterLines: {
			sidebarActions: { onCreateSpace: () => undefined },
		} as RosterLines,
		rosterLists: { badgesBySpaceId: {} } as RosterLists,
		sidebarTab: { openTab: "conversations" } as ReturnType<
			typeof useSidebarPanelSwitch
		>,
		switcher,
		tabs: createWorkspaceTabs(),
		onSelectSpace,
	})
}

const railOf = () =>
	screen.getByRole("navigation", { name: i18n.t("bots:rail.label") })

const railLogo = () =>
	railOf().querySelector<HTMLElement>("[data-slot='space-avatar']")

const openSpacesMenu = () => {
	const trigger = railLogo()?.closest("button")
	act(() => {
		fireEvent.click(trigger as HTMLElement)
	})
	return screen.getByRole("menu", { name: i18n.t("bots:spaces.label") })
}

const railLogoTint = () => railLogo()?.dataset.colour

afterEach(cleanup)

describe.each(SETTINGS_RAILS)(
	"the rail on the %s settings screen",
	(railSettings) => {
		it("wears the colour of the owned Space that is open", () => {
			render(
				createElement(RailHarness, { selectedSpaceId: HOME.id, railSettings }),
			)

			expect(railLogoTint()).toBe("red")
		})

		it("wears the host colour of the joined Space that is open", () => {
			render(
				createElement(RailHarness, {
					selectedSpaceId: "studio",
					railSettings,
				}),
			)

			expect(railLogoTint()).toBe("purple")
		})

		it("repaints its logo when another Space is selected", () => {
			const { rerender } = render(
				createElement(RailHarness, { selectedSpaceId: HOME.id, railSettings }),
			)
			expect(railLogoTint()).toBe("red")

			rerender(
				createElement(RailHarness, {
					selectedSpaceId: GARAGE.id,
					railSettings,
				}),
			)

			expect(railLogoTint()).toBe("blue")
		})
	},
)

describe("the rail on a settings screen", () => {
	it("falls back to the first Space when none matches the selection", () => {
		render(createElement(RailHarness, { selectedSpaceId: "gone" }))

		expect(railLogoTint()).toBe("red")
	})

	it("draws the open Space in the host state the switcher reads", () => {
		const { rerender } = render(
			createElement(RailHarness, { selectedSpaceId: HOME.id }),
		)
		expect(railLogo()?.dataset.state).toBe("local")

		rerender(createElement(RailHarness, { selectedSpaceId: "studio" }))

		expect(railLogo()?.dataset.state).toBe("connecting")
	})

	it("opens the Spaces menu from its logo, its Space settings opening the selected Space settings", () => {
		const openSpaceSettings = vi.fn()
		render(
			createElement(RailHarness, {
				selectedSpaceId: GARAGE.id,
				navigation: { openSpaceSettings },
			}),
		)

		const menu = openSpacesMenu()
		expect(openSpaceSettings).not.toHaveBeenCalled()
		act(() => {
			fireEvent.click(
				within(menu).getByRole("menuitem", { name: SPACE_SETTINGS }),
			)
		})

		expect(openSpaceSettings).toHaveBeenCalledExactlyOnceWith(GARAGE.id)
	})

	it("switches to the Space picked in its Spaces menu", () => {
		const onSelectSpace = vi.fn()
		render(
			createElement(RailHarness, { selectedSpaceId: HOME.id, onSelectSpace }),
		)

		const menu = openSpacesMenu()
		act(() => {
			fireEvent.click(
				within(menu).getByRole("menuitemradio", { name: /Garage/ }),
			)
		})

		expect(onSelectSpace).toHaveBeenCalledExactlyOnceWith(GARAGE.id)
	})

	it("offers to create a space in its Spaces menu", () => {
		render(createElement(RailHarness, { selectedSpaceId: HOME.id }))

		const menu = openSpacesMenu()

		expect(
			within(menu).getByRole("menuitem", {
				name: i18n.t("bots:spaces.create"),
			}),
		).toBeTruthy()
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
	const router = createWorkspaceRouter()
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
		.querySelector("[data-space-tint]")
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

			expect(railLogoTint()).toBe(colour)
		})

		it.each(SETTINGS_ROUTES)(
			"keeps the shell tint of / on $path",
			async ({ path, open }) => {
				const { router, companionId } = await mountAppAtConversations(joined)
				expect(shellTint()).toBe(colour)

				await act(() => open(router, { spaceRowId: rowId, companionId }))
				await settle()

				expect(router.state.matches.at(-1)?.routeId).toBe(path)
				expect(shellTint()).toBe(colour)
			},
		)
	},
)
