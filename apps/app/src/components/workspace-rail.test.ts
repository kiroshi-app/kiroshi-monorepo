// @vitest-environment happy-dom

import { RouterProvider } from "@tanstack/react-router"
import {
	act,
	cleanup,
	fireEvent,
	render,
	renderHook,
	screen,
	within,
} from "@testing-library/react"
import { createElement, type ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppRail } from "@workspace/ui/components/app-rail"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { i18n } from "@workspace/ui/lib/i18n"

import { useWorkspaceRail } from "@/components/workspace-rail"
import type { JoinedSpace, Space, TransportError } from "@/lib/bindings"
import { newBotIdentity } from "@/lib/bots/bot-settings"
import type { ChatDriver } from "@/lib/chat/driver"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { createHomeEntries } from "@/lib/home/home-entries"
import { MAIN_CHAT_PAUSE_MS } from "@/lib/home/home-visits"
import type { JoinedHostState } from "@/lib/host/joined-hosts"
import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import type {
	DepartedSpace,
	JoinedSpacesController,
} from "@/lib/spaces/joined-spaces-controller"
import { joinedRowIdOf } from "@/lib/spaces/joined-spaces-controller"
import { useSwitcherSpaces } from "@/lib/spaces/use-joined-spaces"
import { createWorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import { readMirror, writeMirror } from "@/lib/user/preferences-mirror"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterLists } from "@/lib/workspace/use-roster-lists"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { useSidebarPanelSwitch } from "@/lib/workspace/use-sidebar-panel-switch"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"

type MountedApp = {
	store: TranscriptStore | null
	openJoinedSpace: JoinedSpace | null
	departed: DepartedSpace | null
	sessionFailure: TransportError | null
}

const mounted = vi.hoisted(
	(): MountedApp => ({
		store: null,
		openJoinedSpace: null,
		departed: null,
		sessionFailure: null,
	}),
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
	const failingWhenAsked = (driver: ChatDriver): ChatDriver => ({
		...driver,
		startOrResumeSession: (...args) =>
			mounted.sessionFailure
				? Promise.reject(mounted.sessionFailure)
				: driver.startOrResumeSession(...args),
	})
	return {
		createChatDriver: (store: TranscriptStore) =>
			failingWhenAsked(
				withFakeHostWrites(createFakeChatDriver({ stepMs: 1 }), store),
			),
	}
})

vi.mock("@/lib/spaces/use-joined-spaces", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("@/lib/spaces/use-joined-spaces")>()
	const useJoinedSpaces: typeof original.useJoinedSpaces = (...args) => {
		const joinedSpaces = original.useJoinedSpaces(...args)
		const open = mounted.openJoinedSpace
		if (mounted.departed) {
			return {
				...joinedSpaces,
				state: { ...joinedSpaces.state, departed: mounted.departed },
			}
		}
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
const HOME: Space = { ...OWNED, id: "home", name: "Home", colour: 42 }
const GARAGE: Space = { ...OWNED, id: "garage", name: "Garage", colour: 210 }
const STUDIO: JoinedSpace = {
	id: "studio-host",
	hostUrl: "https://studio.example",
	remoteSpaceId: "studio",
	name: "Studio Nord",
	state: "online",
	hostedBy: "Lea",
	colour: 296,
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
	badgesBySpaceId?: RosterLists["badgesBySpaceId"]
}

const RailHarness = ({
	selectedSpaceId,
	railSettings = "space",
	navigation = {},
	onSelectSpace = () => undefined,
	badgesBySpaceId = {},
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
	const { rail, currentSpace, currentSpaceHost } = useWorkspaceRail({
		homeEntries: createHomeEntries(),
		navigation: navigation as SettingsNavigation,
		overlay: {
			search: { isOpen: false, open: () => {} },
		} as unknown as WorkspaceOverlay,
		panels: { railSettings } as SettingsPanels,
		rosterLines: {
			sidebarActions: { onCreateSpace: () => undefined },
		} as RosterLines,
		rosterLists: { badgesBySpaceId } as RosterLists,
		sidebarTab: { openTab: "conversations" } as ReturnType<
			typeof useSidebarPanelSwitch
		>,
		switcher,
		tabs: createWorkspaceTabs(),
		onSelectSpace,
	})
	return createElement(AppRail, {
		...rail,
		space: currentSpace,
		spaceHost: currentSpaceHost,
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

const renderWithQueries = (screen: ReactElement) =>
	render(screen, { wrapper: createQueryTestWrapper().wrapper })

describe.each(SETTINGS_RAILS)(
	"the rail on the %s settings screen",
	(railSettings) => {
		it("wears the colour of the owned Space that is open", () => {
			renderWithQueries(
				createElement(RailHarness, { selectedSpaceId: HOME.id, railSettings }),
			)

			expect(railLogoTint()).toBe(String(BLOT_HUES.red))
		})

		it("wears the host colour of the joined Space that is open", () => {
			renderWithQueries(
				createElement(RailHarness, {
					selectedSpaceId: "studio",
					railSettings,
				}),
			)

			expect(railLogoTint()).toBe(String(BLOT_HUES.purple))
		})

		it("repaints its logo when another Space is selected", () => {
			const { rerender } = renderWithQueries(
				createElement(RailHarness, { selectedSpaceId: HOME.id, railSettings }),
			)
			expect(railLogoTint()).toBe(String(BLOT_HUES.red))

			rerender(
				createElement(RailHarness, {
					selectedSpaceId: GARAGE.id,
					railSettings,
				}),
			)

			expect(railLogoTint()).toBe("210")
		})
	},
)

describe("the rail on a settings screen", () => {
	it("falls back to the first Space when none matches the selection", () => {
		renderWithQueries(createElement(RailHarness, { selectedSpaceId: "gone" }))

		expect(railLogoTint()).toBe(String(BLOT_HUES.red))
	})

	it("draws the open Space in the host state the switcher reads", () => {
		const { rerender } = renderWithQueries(
			createElement(RailHarness, { selectedSpaceId: HOME.id }),
		)
		expect(railLogo()?.dataset.state).toBe("local")

		rerender(createElement(RailHarness, { selectedSpaceId: "studio" }))

		expect(railLogo()?.dataset.state).toBe("connecting")
	})

	it("opens the Spaces menu from its logo, its Space settings opening the selected Space settings", () => {
		const openSpaceSettings = vi.fn()
		renderWithQueries(
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
		renderWithQueries(
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
		renderWithQueries(createElement(RailHarness, { selectedSpaceId: HOME.id }))

		const menu = openSpacesMenu()

		expect(
			within(menu).getByRole("menuitem", {
				name: i18n.t("bots:spaces.create"),
			}),
		).toBeTruthy()
	})
})

describe("the Spaces button of the rail", () => {
	it("carries no dot while other Spaces carry attention and failed", () => {
		renderWithQueries(
			createElement(RailHarness, {
				selectedSpaceId: HOME.id,
				badgesBySpaceId: {
					[GARAGE.id]: "failed",
					[joinedRowIdOf(STUDIO.id)]: "attention",
				},
			}),
		)

		expect(
			railLogo()
				?.closest("button")
				?.querySelector("[data-slot='app-rail-dot']"),
		).toBeNull()
	})
})

type ProducedSpace = {
	label: string
	selectedSpaceId: string
	connections: Record<string, JoinedHostState>
	space: { id: string; name: string }
	host: string | undefined
}

const STUDIO_ROW_ID = joinedRowIdOf(STUDIO.id)

const PRODUCED_SPACES: ProducedSpace[] = [
	{
		label: "an owned Space",
		selectedSpaceId: HOME.id,
		connections: {},
		space: { id: HOME.id, name: HOME.name },
		host: undefined,
	},
	{
		label: "a joined Space online",
		selectedSpaceId: STUDIO_ROW_ID,
		connections: { [STUDIO.id]: { status: "up" } },
		space: { id: STUDIO_ROW_ID, name: STUDIO.name },
		host: "up",
	},
	{
		label: "a joined Space not connected",
		selectedSpaceId: STUDIO_ROW_ID,
		connections: { [STUDIO.id]: { status: "down" } },
		space: { id: STUDIO_ROW_ID, name: STUDIO.name },
		host: "down",
	},
]

const produceRailFor = ({
	selectedSpaceId,
	connections,
}: Pick<ProducedSpace, "selectedSpaceId" | "connections">) =>
	renderHook(
		() =>
			useWorkspaceRail({
				homeEntries: createHomeEntries(),
				navigation: {} as SettingsNavigation,
				overlay: {
					search: { isOpen: false, open: () => {} },
				} as unknown as WorkspaceOverlay,
				panels: {} as SettingsPanels,
				rosterLines: { sidebarActions: {} } as RosterLines,
				rosterLists: {} as RosterLists,
				sidebarTab: { openTab: "conversations" } as ReturnType<
					typeof useSidebarPanelSwitch
				>,
				switcher: useSwitcherSpaces(
					{ spaces: [HOME, GARAGE], selectedSpaceId },
					{
						state: {
							joinedSpaces: [STUDIO],
							hasFailedToLoad: false,
							openId: selectedSpaceId === STUDIO_ROW_ID ? STUDIO.id : null,
							departed: null,
						},
						controller: {} as JoinedSpacesController,
						hosts: { active: null, connections },
					},
					NO_INVITATIONS,
				),
				tabs: createWorkspaceTabs(),
				onSelectSpace: () => undefined,
			}),
		{ wrapper: createQueryTestWrapper().wrapper },
	).result.current

describe.each(PRODUCED_SPACES)(
	"the sidebar frame producer with $label selected",
	({ selectedSpaceId, connections, space, host }) => {
		it("outputs that Space as the current Space", () => {
			const { currentSpace } = produceRailFor({ selectedSpaceId, connections })

			expect(currentSpace).toMatchObject(space)
		})

		it("outputs the connection state of that Space", () => {
			const { currentSpaceHost } = produceRailFor({
				selectedSpaceId,
				connections,
			})

			expect(currentSpaceHost).toBe(host)
		})

		it("keeps handing the Space switcher rows every Space's connection state", () => {
			const { hostBySpaceId } = produceRailFor({
				selectedSpaceId,
				connections,
			}).rail

			expect(hostBySpaceId?.[space.id]).toBe(host)
		})
	},
)

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
	{
		label: "an owned",
		joined: null,
		rowId: PERSONAL_SPACE_ID,
		colour: String(BLOT_HUES.red),
	},
	{
		label: "a joined",
		joined: HOST_OF_PERSONAL,
		rowId: joinedRowIdOf(HOST_OF_PERSONAL.id),
		colour: String(BLOT_HUES.purple),
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
	document.body.querySelector("[data-hue]")?.getAttribute("data-hue")

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

describe("the Home page", () => {
	afterEach(() => {
		vi.useRealTimers()
		mounted.store = null
		mounted.departed = null
		mounted.sessionFailure = null
		localStorage.clear()
	})

	const launchApp = async () => {
		const router = createWorkspaceRouter()
		render(createElement(RouterProvider, { router }), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()
		return router
	}

	const mountAppWithTwoAgents = async () => {
		writeMirror({ ...readMirror(), firstRunDone: true })
		const store = createFakeTranscriptStore()
		const first = await store.createBot(newBotIdentity([]), PERSONAL_SPACE_ID)
		const second = await store.createBot(
			newBotIdentity([first]),
			PERSONAL_SPACE_ID,
		)
		mounted.store = store
		vi.useFakeTimers()
		const router = await launchApp()
		const [firstOfSpace] = await store.bots(PERSONAL_SPACE_ID)
		return { router, store, first, second, firstOfSpace }
	}

	type RailEntry = "home" | "conversations" | "missions" | "library"

	const railEntry = (name: RailEntry) =>
		within(railOf()).getByRole("button", { name: i18n.t(`bots:rail.${name}`) })

	const selectedEntries = () =>
		within(railOf())
			.getAllByRole("button")
			.filter((entry) => entry.getAttribute("aria-current") === "true")
			.map((entry) => entry.getAttribute("aria-label") ?? entry.textContent)

	const pressInRail = async (name: RailEntry) => {
		act(() => {
			fireEvent.click(railEntry(name))
		})
		await settle()
	}

	const pickedAgentName = () =>
		document.querySelector("[data-slot='home-agent-chip']")?.textContent

	const slot = (name: string) => document.querySelector(`[data-slot='${name}']`)

	it("opens from the rail on the first agent, marking Home and no panel entry", async () => {
		const { router, firstOfSpace } = await mountAppWithTwoAgents()

		await pressInRail("home")

		expect(router.state.location.pathname).toBe("/home")
		expect(selectedEntries()).toEqual([i18n.t("bots:rail.home")])
		expect(pickedAgentName()).toBe(firstOfSpace.name)
		expect(slot("home-layout")).not.toBeNull()
	})

	it("opens on the agent last picked on the Home in this Space", async () => {
		const { second } = await mountAppWithTwoAgents()
		cleanup()
		localStorage.setItem(
			"homeAgentIdBySpace",
			JSON.stringify({ [PERSONAL_SPACE_ID]: second.id }),
		)
		await launchApp()

		await pressInRail("home")

		expect(pickedAgentName()).toBe(second.name)
	})

	it("shows the Home of the agent picked in the composer, the previous agent chat untouched", async () => {
		const { firstOfSpace, second, store } = await mountAppWithTwoAgents()
		await pressInRail("home")
		const previousChat = await store.mainChat(
			firstOfSpace.id,
			PERSONAL_SPACE_ID,
		)

		act(() => {
			fireEvent.click(slot("home-agent-chip") as HTMLElement)
		})
		await settle()
		act(() => {
			fireEvent.click(screen.getByRole("menuitemradio", { name: second.name }))
		})
		await settle()

		expect(pickedAgentName()).toBe(second.name)
		expect((await store.mainChat(firstOfSpace.id, PERSONAL_SPACE_ID)).id).toBe(
			previousChat.id,
		)
		expect(
			JSON.parse(localStorage.getItem("homeAgentIdBySpace") ?? ""),
		).toEqual({ [PERSONAL_SPACE_ID]: second.id })
	})

	const sayInMainChat = async (
		store: TranscriptStore,
		conversationId: string,
		createdAt: number,
	) => {
		await store.startTurn({
			conversationId,
			id: "said",
			startedAt: createdAt,
		})
		await store.appendUserMessage({
			id: "said-message",
			conversationId,
			turnId: "said",
			authorBotId: null,
			repliedToMessageId: null,
			content: "Book the flights.",
			createdAt,
		})
	}

	it("archives a main chat holding messages only once the Home opens, one click away", async () => {
		const { router, firstOfSpace, store } = await mountAppWithTwoAgents()
		const earlier = await store.mainChat(firstOfSpace.id, PERSONAL_SPACE_ID)
		await sayInMainChat(store, earlier.id, 1)

		await act(() =>
			router.navigate({ to: "/", search: { bot: firstOfSpace.id } }),
		)
		await settle()
		expect((await store.mainChat(firstOfSpace.id, PERSONAL_SPACE_ID)).id).toBe(
			earlier.id,
		)

		await pressInRail("home")

		expect(
			(await store.mainChat(firstOfSpace.id, PERSONAL_SPACE_ID)).id,
		).not.toBe(earlier.id)
		expect(slot("home-layout")?.getAttribute("data-stage")).toBe("empty")
		expect(screen.getByRole("button", { name: "Open it" })).toBeTruthy()
	})

	it("keeps a main chat said to within the hour, then archives it on a later opening past the hour", async () => {
		const { firstOfSpace, store } = await mountAppWithTwoAgents()
		const renewal = vi.spyOn(store, "renewMainChat")
		const earlier = await store.mainChat(firstOfSpace.id, PERSONAL_SPACE_ID)
		const saidAt = Date.now()
		await sayInMainChat(store, earlier.id, saidAt)
		const mainChatId = async () =>
			(await store.mainChat(firstOfSpace.id, PERSONAL_SPACE_ID)).id

		await pressInRail("home")

		expect(renewal).not.toHaveBeenCalled()
		expect(await mainChatId()).toBe(earlier.id)
		expect(slot("home-layout")?.getAttribute("data-stage")).toBe("conversation")

		await pressInRail("conversations")
		vi.setSystemTime(saidAt + MAIN_CHAT_PAUSE_MS + 1)
		await pressInRail("home")

		expect(renewal).toHaveBeenCalledOnce()
		expect(await mainChatId()).not.toBe(earlier.id)
		expect(slot("home-layout")?.getAttribute("data-stage")).toBe("empty")
		expect(screen.getByRole("button", { name: "Open it" })).toBeTruthy()

		await pressInRail("conversations")
		await pressInRail("home")

		expect(renewal).toHaveBeenCalledOnce()
		expect(screen.getByRole("button", { name: "Open it" })).toBeTruthy()
	})

	const homeStage = () => slot("home-layout")?.getAttribute("data-stage")

	const keepHomeTabOpen = () =>
		localStorage.setItem(
			`spaceTabs:${PERSONAL_SPACE_ID}`,
			JSON.stringify({
				tabs: [
					{ href: "/home", isPinned: false, entries: ["/home"], index: 0 },
				],
				activeIndex: 0,
			}),
		)

	const bringWindowBack = async () => {
		const visibility = vi.spyOn(document, "visibilityState", "get")
		for (const state of ["hidden", "visible"] as const) {
			visibility.mockReturnValue(state)
			act(() => {
				document.dispatchEvent(new Event("visibilitychange"))
			})
		}
		visibility.mockRestore()
		await settle()
	}

	const mountHomeSaidToNow = async () => {
		const mounted = await mountAppWithTwoAgents()
		const { firstOfSpace, store } = mounted
		const renewal = vi.spyOn(store, "renewMainChat")
		const earlier = await store.mainChat(firstOfSpace.id, PERSONAL_SPACE_ID)
		const saidAt = Date.now()
		await sayInMainChat(store, earlier.id, saidAt)
		const mainChatId = async () =>
			(await store.mainChat(firstOfSpace.id, PERSONAL_SPACE_ID)).id
		await pressInRail("home")
		return { ...mounted, renewal, earlier, saidAt, mainChatId }
	}

	const expectFreshHome = async (
		mainChatId: () => Promise<string>,
		earlierId: string,
	) => {
		expect(await mainChatId()).not.toBe(earlierId)
		expect(homeStage()).toBe("empty")
		expect(screen.getByRole("button", { name: "Open it" })).toBeTruthy()
	}

	it("launches on a fresh Home, the main chat past the hour archived one click away", async () => {
		const { firstOfSpace, store } = await mountAppWithTwoAgents()
		const earlier = await store.mainChat(firstOfSpace.id, PERSONAL_SPACE_ID)
		await sayInMainChat(store, earlier.id, Date.now() - MAIN_CHAT_PAUSE_MS - 1)
		cleanup()
		keepHomeTabOpen()

		const router = await launchApp()

		expect(router.state.location.pathname).toBe("/home")
		await expectFreshHome(
			async () => (await store.mainChat(firstOfSpace.id, PERSONAL_SPACE_ID)).id,
			earlier.id,
		)
	})

	it("opens a fresh Home when its window comes back past the hour, keeping the chat when it comes back within it", async () => {
		const { renewal, earlier, saidAt, mainChatId } = await mountHomeSaidToNow()

		await bringWindowBack()

		expect(renewal).not.toHaveBeenCalled()
		expect(homeStage()).toBe("conversation")

		vi.setSystemTime(saidAt + MAIN_CHAT_PAUSE_MS + 1)
		await bringWindowBack()

		expect(renewal).toHaveBeenCalledOnce()
		await expectFreshHome(mainChatId, earlier.id)
	})

	it("opens a fresh Home when its rail entry is pressed on the Home past the hour, keeping the chat within it", async () => {
		const { renewal, earlier, saidAt, mainChatId } = await mountHomeSaidToNow()

		await pressInRail("home")

		expect(renewal).not.toHaveBeenCalled()
		expect(homeStage()).toBe("conversation")

		vi.setSystemTime(saidAt + MAIN_CHAT_PAUSE_MS + 1)
		await pressInRail("home")

		expect(renewal).toHaveBeenCalledOnce()
		await expectFreshHome(mainChatId, earlier.id)
	})

	it("opens a fresh Home when the person goes back to it from another page past the hour", async () => {
		const { router, earlier, saidAt, mainChatId } = await mountHomeSaidToNow()
		await pressInRail("library")

		vi.setSystemTime(saidAt + MAIN_CHAT_PAUSE_MS + 1)
		act(() => {
			router.history.back()
		})
		await settle()

		expect(router.state.location.pathname).toBe("/home")
		await expectFreshHome(mainChatId, earlier.id)
	})

	it.each<RailEntry>(["conversations", "missions", "library"])(
		"leaves the Home for %s, the rail selecting that entry",
		async (entry) => {
			await mountAppWithTwoAgents()
			await pressInRail("home")

			await pressInRail(entry)

			expect(selectedEntries()).toEqual([i18n.t(`bots:rail.${entry}`)])
			expect(slot("home-layout")).toBeNull()
		},
	)

	const threadChrome = () => ({
		header: slot("app-header"),
		identity: slot("header-identity-button"),
		activityToggle: screen.queryByRole("button", {
			name: i18n.t("chat:activity.panel.toggle"),
		}),
		activityPanel: screen.queryByRole("complementary", {
			name: i18n.t("chat:activity.panel.label"),
		}),
	})

	const openInConversations = async (
		router: Awaited<ReturnType<typeof launchApp>>,
		botId: string,
	) => {
		await act(() => router.navigate({ to: "/", search: { bot: botId } }))
		await settle()
	}

	const sendFromHome = async (text: string) => {
		const composer = screen.getByRole("textbox")
		act(() => {
			fireEvent.change(composer, { target: { value: text } })
			fireEvent.keyDown(composer, { key: "Enter" })
		})
		await settle()
	}

	it("frames the empty Home and its first message with no thread header and no routines trigger", async () => {
		await mountAppWithTwoAgents()
		await pressInRail("home")

		expect(slot("home-layout")?.getAttribute("data-stage")).toBe("empty")
		expect(threadChrome().header).toBeNull()
		expect(threadChrome().activityToggle).toBeNull()

		await sendFromHome("Book the flights.")

		expect(slot("home-layout")?.getAttribute("data-stage")).toBe("conversation")
		expect(screen.getByText("Book the flights.")).toBeTruthy()
		expect(threadChrome().header).toBeNull()
		expect(threadChrome().identity).toBeNull()
		expect(threadChrome().activityToggle).toBeNull()
	})

	it("shows no activity panel on the Home, even with the panel left open in Conversations", async () => {
		writeMirror({ ...readMirror(), activityPanelOpen: true })
		const { router, first } = await mountAppWithTwoAgents()
		await openInConversations(router, first.id)
		expect(threadChrome().activityPanel).not.toBeNull()

		await pressInRail("home")

		expect(slot("home-layout")).not.toBeNull()
		expect(threadChrome().activityPanel).toBeNull()
		expect(threadChrome().activityToggle).toBeNull()
	})

	it("frames the Home of a left Space as a read-only Home, the departure notice in place of the composer", async () => {
		mounted.departed = {
			rowId: "studio-host",
			spaceId: PERSONAL_SPACE_ID,
			reason: "removed",
			space: "Studio Nord",
			host: "Lea",
			threadId: null,
		}
		await mountAppWithTwoAgents()

		await pressInRail("home")

		expect(slot("home-layout")?.getAttribute("data-stage")).toBe("conversation")
		expect(slot("space-access-banner")?.getAttribute("data-reason")).toBe(
			"removed",
		)
		expect(slot("home-composer")).toBeNull()
		expect(slot("chat-layout")).toBeNull()
	})

	it("keeps the Home frame and its composer when the first turn fails, the failure notice raised", async () => {
		mounted.sessionFailure = { kind: "spawnFailed", detail: "no binary" }
		await mountAppWithTwoAgents()
		await pressInRail("home")

		await sendFromHome("Book the flights.")

		expect(slot("home-layout")?.getAttribute("data-stage")).toBe("empty")
		expect(slot("home-composer")).not.toBeNull()
		expect(slot("chat-layout")).toBeNull()
		expect(screen.getAllByText(/no binary/)).not.toHaveLength(0)
	})

	it("keeps the thread header and the activity panel of an agent opened in Conversations", async () => {
		const { router, first } = await mountAppWithTwoAgents()

		await openInConversations(router, first.id)

		expect(threadChrome().header).not.toBeNull()
		expect(threadChrome().activityToggle).not.toBeNull()
	})

	it("shows an agent opened in Conversations in its thread layout, never a Home view", async () => {
		const { router, first } = await mountAppWithTwoAgents()

		await openInConversations(router, first.id)

		expect(slot("chat-layout")).not.toBeNull()
		expect(slot("home-layout")).toBeNull()
	})
})
