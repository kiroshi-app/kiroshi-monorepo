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
import { createElement, useEffect } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import { newBotIdentity } from "@/lib/bots/bot-settings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type {
	Bot,
	Conversation,
	ConversationInPage,
} from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import type { Invoke } from "@/lib/host/joined-hosts-invoke"
import type { Mission } from "@/lib/missions/mission-contract"
import { aMission } from "@/lib/missions/mission-fixtures"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { stubSentinelObserver } from "@/lib/query/sentinel-test-observer"
import { rosterRowNamed, rosterRowOf } from "@/lib/sidebar/sidebar-fixtures"
import { readMirror, writeMirror } from "@/lib/user/preferences-mirror"

type HeldMission = {
	mission: Mission
	bot: Bot
	conversation: Conversation
}

type Harness = {
	store: TranscriptStore | null
	missions: HeldMission[]
	mounts: { expandedSidebar: number; titleBar: number }
	refusesSidebarLayout: boolean
}

const harness = vi.hoisted(
	(): Harness => ({
		store: null,
		missions: [],
		mounts: { expandedSidebar: 0, titleBar: 0 },
		refusesSidebarLayout: false,
	}),
)

const savedLayouts = vi.hoisted(() => vi.fn())

const raiseFailureNotice = vi.hoisted(() => vi.fn(() => "notice"))

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseFailureNotice,
}))

vi.mock("@workspace/ui/components/expanded-sidebar", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@workspace/ui/components/expanded-sidebar")
		>()
	const CountedExpandedSidebar = (
		props: Parameters<typeof actual.ExpandedSidebar>[0],
	) => {
		useEffect(() => {
			harness.mounts.expandedSidebar += 1
		}, [])
		return createElement(actual.ExpandedSidebar, props)
	}
	return { ...actual, ExpandedSidebar: CountedExpandedSidebar }
})

vi.mock("@workspace/ui/components/app-title-bar", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@workspace/ui/components/app-title-bar")
		>()
	const CountedAppTitleBar = (
		props: Parameters<typeof actual.AppTitleBar>[0],
	) => {
		useEffect(() => {
			harness.mounts.titleBar += 1
		}, [])
		return createElement(actual.AppTitleBar, props)
	}
	return { ...actual, AppTitleBar: CountedAppTitleBar }
})

vi.mock("@/lib/conversations/create-store", () => ({
	createTranscriptStore: () => harness.store,
}))

vi.mock("@/lib/host/index", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/host/index")>()
	const saveSidebarLayout = async <T>(args: unknown): Promise<T> => {
		savedLayouts(args)
		if (harness.refusesSidebarLayout)
			return Promise.reject(new Error("refused"))
		const { readMirror } = await import("@/lib/user/preferences-mirror")
		const { isCollapsed } = args as { isCollapsed: boolean }
		return { ...readMirror(), sidebarCollapsed: isCollapsed } as T
	}
	const invoke: Invoke = <T>(...call: Parameters<Invoke>) => {
		if (call[0] === "library_list") return Promise.resolve([] as T)
		if (call[0] === "user_set_sidebar_collapsed")
			return saveSidebarLayout<T>(call[1])
		return actual.invoke<T>(...call)
	}
	return { ...actual, invoke, isDesktopHost: () => false }
})

vi.mock("@/lib/chat/create-driver", async () => {
	const { withFakeHostWrites } = await import(
		"@/lib/conversations/fake-host-writes"
	)
	return {
		createChatDriver: (store: TranscriptStore) =>
			withFakeHostWrites(createFakeChatDriver({ stepMs: 1 }), store),
	}
})

vi.mock("@/lib/missions/missions-transport", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/missions/missions-transport")>()
	const { aSpacePage } = await import("@/lib/missions/mission-fixtures")
	return {
		...actual,
		missionsTransport: {
			...actual.missionsTransport,
			board: async () =>
				harness.missions.map(({ mission, bot }) => ({ mission, bot })),
			spacePage: async () =>
				aSpacePage(
					harness.missions.map(({ mission, conversation }) => ({
						mission,
						conversationId: conversation.id,
						conversationTitle: conversation.title,
					})),
				),
		},
	}
})

vi.mock("@/lib/search/search-port", () => ({
	searchPort: {
		messages: async () => [],
		catalogue: async () => ({ chats: [], missions: [], routines: [] }),
		recent: async () => [],
	},
}))

const { createWorkspaceRouter } = await import("@/workspace-router")

const SETTLE_MS = 200

type RoutedPath = "/" | "/home" | "/missions" | "/library" | "/settings/user"

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.useRealTimers()
	vi.unstubAllGlobals()
	harness.store = null
	harness.missions = []
	harness.mounts = { expandedSidebar: 0, titleBar: 0 }
	harness.refusesSidebarLayout = false
	savedLayouts.mockClear()
	raiseFailureNotice.mockClear()
})

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(SETTLE_MS)
	})
}

type SpaceSeed = {
	store: TranscriptStore
	spaceId: string
	bot: Bot
}

const mountApp = async (
	seed: (held: SpaceSeed) => Promise<void> = async () => undefined,
) => {
	writeMirror({ ...readMirror(), firstRunDone: true })
	const store = createFakeTranscriptStore()
	const [space] = await store.spaces()
	const bot = await store.createBot(newBotIdentity([]), space.id)
	await seed({ store, spaceId: space.id, bot })
	vi.useFakeTimers()
	harness.store = store
	const router = createWorkspaceRouter()
	render(createElement(RouterProvider, { router }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
	return { router, botId: bot.id }
}

type WorkspaceRouter = Awaited<ReturnType<typeof mountApp>>["router"]

const navigateTo = async (router: WorkspaceRouter, to: RoutedPath) => {
	await act(async () => {
		await router.navigate({ to })
	})
	await settle()
}

const slotOf = (slot: string) =>
	document.querySelector<HTMLElement>(`[data-slot="${slot}"]`)

const slotsOf = (slot: string) =>
	document.querySelectorAll(`[data-slot="${slot}"]`)

const sidebar = () =>
	screen.getByRole("navigation", { name: i18n.t("bots:rail.label") })

const entry = (name: string | RegExp) =>
	within(sidebar()).getByRole("button", { name })

const currentEntries = () =>
	within(sidebar())
		.getAllByRole("button")
		.filter((button) => button.getAttribute("aria-current") === "page")
		.filter((button) => !button.querySelector('[data-slot="roster-row-name"]'))

const press = async (control: HTMLElement) => {
	await act(async () => {
		fireEvent.click(control)
	})
	await settle()
}

const pressCommand = async (key: string, target: Element | Window = window) => {
	await act(async () => {
		fireEvent.keyDown(target, { key, metaKey: true })
	})
	await settle()
}

const toggleSidebarButton = () =>
	within(slotOf("app-title-bar") as HTMLElement).getByRole("button", {
		name: i18n.t("common:sidebar.toggle"),
	})

const SEARCH = i18n.t("search:open")
const NEW_CONVERSATION = i18n.t("bots:rail.newConversation")
const MISSIONS = i18n.t("bots:rail.missions")
const MISSIONS_ENTRY = new RegExp(`^${MISSIONS}( \\d+)?$`)
const LIBRARY = i18n.t("bots:rail.library")

const titleBarSearchButton = () =>
	within(slotOf("app-title-bar") as HTMLElement).getByRole("button", {
		name: SEARCH,
	})

describe("the workspace frame", () => {
	it("keeps one navigation sidebar and one title bar mounted across every page, and no rail", async () => {
		const { router } = await mountApp()
		const paths: RoutedPath[] = [
			"/home",
			"/missions",
			"/library",
			"/settings/user",
			"/",
		]

		for (const path of paths) {
			await navigateTo(router, path)
			expect(slotsOf("expanded-sidebar")).toHaveLength(1)
			expect(slotsOf("app-title-bar")).toHaveLength(1)
			expect(slotOf("app-rail")).toBeNull()
		}
		expect(harness.mounts).toEqual({ expandedSidebar: 1, titleBar: 1 })
	})

	it.each<{ path: RoutedPath; current: (string | RegExp)[] }>([
		{ path: "/home", current: [NEW_CONVERSATION] },
		{ path: "/missions", current: [MISSIONS_ENTRY] },
		{ path: "/library", current: [LIBRARY] },
		{ path: "/", current: [] },
	])(
		"marks $current as the current entry on $path",
		async ({ path, current }) => {
			const { router } = await mountApp()

			await navigateTo(router, path)

			expect(currentEntries()).toEqual(current.map(entry))
		},
	)

	it("marks no entry on a conversation or a mission thread", async () => {
		const { router, botId } = await mountApp()

		for (const search of [{ bot: botId }, { bot: botId, mission: "m-1" }]) {
			await act(async () => {
				await router.navigate({ to: "/", search })
			})
			await settle()

			expect(slotsOf("expanded-sidebar")).toHaveLength(1)
			expect(currentEntries()).toEqual([])
		}
	})

	it.each<{ name: string | RegExp; path: RoutedPath }>([
		{ name: NEW_CONVERSATION, path: "/home" },
		{ name: MISSIONS_ENTRY, path: "/missions" },
		{ name: LIBRARY, path: "/library" },
	])("opens $path from $name", async ({ name, path }) => {
		const { router } = await mountApp()

		await press(entry(name))

		expect(router.state.location.pathname).toBe(path)
	})

	it("shows the Missions page of the current Space in the main area", async () => {
		await mountApp()

		await press(entry(MISSIONS_ENTRY))

		expect(slotOf("missions-page")).not.toBeNull()
		expect(
			screen.getByRole("heading", {
				level: 1,
				name: i18n.t("chat:missions.page.title"),
			}),
		).toBeTruthy()
	})

	it("opens the user settings from the settings of its footer", async () => {
		const { router } = await mountApp()

		await press(entry(i18n.t("bots:rail.personSettings", { name: "You" })))

		expect(router.state.location.pathname).toBe("/settings/user")
	})

	it.each<RoutedPath>(["/", "/library", "/settings/user"])(
		"opens the search on Search and on Cmd K on %s",
		async (path) => {
			const { router } = await mountApp()
			await navigateTo(router, path)

			await pressCommand("k")
			expect(slotOf("search-palette")).not.toBeNull()

			await act(async () => {
				fireEvent.keyDown(document.activeElement ?? document.body, {
					key: "Escape",
				})
			})
			await settle()
			expect(slotOf("search-palette")).toBeNull()

			expect(
				within(slotOf("expanded-sidebar") as HTMLElement).queryByRole(
					"button",
					{ name: SEARCH },
				),
			).toBeNull()
			await press(titleBarSearchButton())
			expect(slotOf("search-palette")).not.toBeNull()
		},
	)
})

describe("the sidebar toggle", () => {
	it("collapses the sidebar from the title bar button and saves it, then expands it back", async () => {
		await mountApp()

		await press(toggleSidebarButton())

		expect(slotOf("expanded-sidebar")).toBeNull()
		expect(slotOf("sidebar-peek-edge")).not.toBeNull()
		expect(savedLayouts).toHaveBeenLastCalledWith({ isCollapsed: true })

		await press(toggleSidebarButton())

		expect(slotOf("expanded-sidebar")).not.toBeNull()
		expect(savedLayouts).toHaveBeenLastCalledWith({ isCollapsed: false })
		expect(savedLayouts).toHaveBeenCalledTimes(2)
		expect(raiseFailureNotice).not.toHaveBeenCalledWith(
			expect.objectContaining({
				title: i18n.t("common:sidebar.collapseUnsaved"),
			}),
		)
	})

	it("toggles once per Cmd+B press, never from inside a text field", async () => {
		const { router } = await mountApp()
		await navigateTo(router, "/home")

		await pressCommand("b")

		expect(slotOf("sidebar-peek-edge")).not.toBeNull()
		expect(savedLayouts).toHaveBeenCalledExactlyOnceWith({ isCollapsed: true })

		await pressCommand("b", screen.getByRole("textbox"))

		expect(slotOf("expanded-sidebar")).toBeNull()
		expect(slotOf("sidebar-peek-edge")).not.toBeNull()
		expect(savedLayouts).toHaveBeenCalledTimes(1)

		await pressCommand("b")

		expect(slotOf("expanded-sidebar")).not.toBeNull()
		expect(savedLayouts).toHaveBeenCalledTimes(2)
		expect(savedLayouts).toHaveBeenLastCalledWith({ isCollapsed: false })
	})

	it("opens collapsed with no expanded sidebar ever drawn when the sidebar was left collapsed", async () => {
		await mountCollapsed()

		expect(slotOf("sidebar-peek-edge")).not.toBeNull()
		expect(harness.mounts.expandedSidebar).toBe(0)
	})

	it("rolls the sidebar back to expanded and raises a notice when the layout can't be saved", async () => {
		await mountApp()
		harness.refusesSidebarLayout = true

		await press(toggleSidebarButton())

		expect(slotOf("sidebar-peek-edge")).toBeNull()
		expect(slotOf("expanded-sidebar")).not.toBeNull()
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				title: i18n.t("common:sidebar.collapseUnsaved"),
			}),
		)
	})
})

const SKELETON_MS = 400

const roomIn = (
	{ store, spaceId, bot }: SpaceSeed,
	title: string,
): Promise<Conversation> =>
	store.createConversation({
		botIds: [bot.id],
		sectionId: null,
		spaceId,
		title,
	})

const missionOn = (
	{ bot }: SpaceSeed,
	conversation: Conversation,
	held: Partial<Mission>,
): HeldMission => ({
	mission: aMission({
		botId: bot.id,
		originConversationId: conversation.id,
		threadConversationId: conversation.id,
		...held,
	}),
	bot,
	conversation,
})

const mountCollapsed = (seed?: (held: SpaceSeed) => Promise<void>) => {
	writeMirror({ ...readMirror(), sidebarCollapsed: true })
	return mountApp(seed)
}

const restOnLeftEdge = async () => {
	await act(async () => {
		fireEvent.pointerEnter(slotOf("sidebar-peek-edge") as HTMLElement)
	})
	await settle()
}

describe("the collapsed sidebar", () => {
	it("draws nothing on the left, then floats the conversations from the left edge and opens the one picked", async () => {
		let roomId = ""
		const { router } = await mountCollapsed(async (held) => {
			roomId = (await roomIn(held, "Release train")).id
		})

		expect(slotOf("expanded-sidebar")).toBeNull()
		expect(slotOf("sidebar-peek")).toBeNull()

		await restOnLeftEdge()
		const peek = slotOf("sidebar-peek") as HTMLElement
		expect(peek.contains(rosterRowOf("Release train"))).toBe(true)
		await press(rosterRowOf("Release train"))

		expect(router.state.location.search).toMatchObject({
			conversation: roomId,
		})
	})
})

const foldNamesOf = (index: number) =>
	Array.from(
		slotsOf("fold-section")[index].querySelectorAll(
			'[data-slot="roster-row-name"]',
		),
	).map((name) => name.textContent)

const pinnedNames = () => foldNamesOf(0)

const recentNames = () => foldNamesOf(1)

const openRowMenu = async (name: string) => {
	await act(async () => {
		fireEvent.contextMenu(rosterRowOf(name), { clientX: 20, clientY: 20 })
	})
	await settle()
}

const pickInRowMenu = async (name: string, item: string) => {
	await openRowMenu(name)
	await press(screen.getByRole("menuitem", { name: item }))
}

const seedPinned = async (held: SpaceSeed) => {
	const first = await roomIn(held, "First pin")
	const second = await roomIn(held, "Second pin")
	await roomIn(held, "Loose room")
	await held.store.pinRoster(held.spaceId, [
		{ id: first.id, sectionId: null },
		{ id: second.id, sectionId: null },
	])
}

const liftRow = (name: string) => {
	const row = rosterRowOf(name)
	fireEvent.pointerDown(row, {
		button: 0,
		clientX: 0,
		clientY: 0,
		pointerId: 1,
	})
	fireEvent.pointerMove(window, { clientX: 0, clientY: 12, pointerId: 1 })
}

const dropOver = async (target: Element) => {
	vi.spyOn(document, "elementFromPoint").mockReturnValue(target)
	await act(async () => {
		fireEvent.pointerMove(window, { clientX: 0, clientY: 24, pointerId: 1 })
		fireEvent.pointerUp(window, { clientX: 0, clientY: 24, pointerId: 1 })
	})
	await settle()
	vi.restoreAllMocks()
}

const rowNameIn = (index: number) =>
	document.querySelectorAll('[data-slot="roster-row-name"]')[index]
		.textContent as string

const dropAreaWith = (name: string) =>
	rosterRowOf(name).closest("[data-roster-drop]") as Element

describe("the rows of the expanded sidebar", () => {
	it("opens a conversation picked from the Missions page", async () => {
		let roomId = ""
		const { router } = await mountApp(async (held) => {
			roomId = (await roomIn(held, "Release train")).id
		})
		await navigateTo(router, "/missions")

		await press(rosterRowOf("Release train"))

		expect(router.state.location.pathname).toBe("/")
		expect(router.state.location.search).toMatchObject({
			conversation: roomId,
		})
	})

	it("shows the pinned rows in Pinned in their saved order and the other rows in Conversations", async () => {
		await mountApp(seedPinned)

		expect(pinnedNames()).toEqual(["First pin", "Second pin"])
		expect(recentNames()).toContain("Loose room")
		expect(recentNames()).not.toContain("First pin")
	})

	it("opens the mission of a conversation from its row, inside the conversation's menu area, and marks it alone as current", async () => {
		const { router } = await mountApp(async (held) => {
			const room = await roomIn(held, "Release train")
			harness.missions = [missionOn(held, room, { id: "mission-release" })]
		})

		const capsule = slotOf("mission-capsule") as HTMLElement
		const menuArea = capsule.closest('[data-slot="context-menu-trigger"]')
		expect(menuArea?.contains(rosterRowOf("Release train"))).toBe(true)
		expect(capsule.getAttribute("aria-current")).toBeNull()
		await press(capsule)

		expect(router.state.location.search).toHaveProperty(
			"mission",
			"mission-release",
		)
		await settle()
		expect(slotOf("mission-capsule")?.getAttribute("aria-current")).toBe("page")
		expect(rosterRowOf("Release train").getAttribute("aria-current")).toBeNull()
	})

	it("marks the person button current while the person's settings are on screen, and at rest once they are left", async () => {
		const { router } = await mountApp(seedPinned)
		const personButton = () => slotOf("expanded-sidebar-footer") as HTMLElement
		expect(personButton().getAttribute("aria-current")).toBeNull()

		await press(personButton())
		await settle()

		expect(router.state.location.pathname).toBe("/settings/user")
		expect(personButton().getAttribute("aria-current")).toBe("page")

		await navigateTo(router, "/missions")

		expect(personButton().getAttribute("aria-current")).toBeNull()
	})

	it("opens a row from any page", async () => {
		const { router } = await mountApp(seedPinned)
		await navigateTo(router, "/missions")

		await press(rosterRowOf("Loose room"))

		expect(router.state.location.pathname).toBe("/")
	})

	it.each<[string, () => void]>([
		[
			"a Cmd-press",
			() =>
				fireEvent.click(rosterRowOf("Loose room"), {
					ctrlKey: true,
					detail: 1,
					metaKey: true,
				}),
		],
		[
			"a middle-button press",
			() =>
				fireEvent(
					rosterRowOf("Loose room"),
					new MouseEvent("auxclick", {
						bubbles: true,
						button: 1,
						detail: 1,
					}),
				),
		],
	])(
		"opens a row in a new tab on %s and stays on the page",
		async (_, pressRow) => {
			const { router } = await mountApp(seedPinned)
			await navigateTo(router, "/missions")
			const tabsBefore = screen.getAllByRole("tab").length

			await act(async () => pressRow())
			await settle()

			expect(router.state.location.pathname).toBe("/missions")
			expect(screen.getAllByRole("tab").length).toBe(tabsBefore + 1)
		},
	)

	it("moves a row between the slots from its menu and keeps it after a relaunch", async () => {
		let store: TranscriptStore | undefined
		let spaceId = ""
		await mountApp(async (held) => {
			store = held.store
			spaceId = held.spaceId
			await seedPinned(held)
		})

		await pickInRowMenu("Loose room", i18n.t("bots:roster.pin"))
		expect(pinnedNames()).toContain("Loose room")
		expect(recentNames()).not.toContain("Loose room")

		const pinnedAfter = async () => {
			const page = await store?.conversationPage(spaceId, null, 30)
			return page?.pinned.map(({ title }) => title)
		}
		expect(await pinnedAfter()).toContain("Loose room")

		await pickInRowMenu("Loose room", i18n.t("bots:roster.unpin"))
		expect(recentNames()).toContain("Loose room")
		expect(await pinnedAfter()).not.toContain("Loose room")
	})

	it("opens the settings of a conversation from its row menu", async () => {
		const { router } = await mountApp(seedPinned)

		await pickInRowMenu("Loose room", i18n.t("bots:roster.settings"))

		expect(router.state.matches.at(-1)?.routeId).toBe(
			"/settings/conversation/$conversationId",
		)
	})

	it("deletes a conversation from its row menu", async () => {
		await mountApp(seedPinned)

		await pickInRowMenu("Loose room", i18n.t("bots:roster.delete"))

		expect(rosterRowNamed("Loose room")).toBeNull()
	})

	it("shows the name field for a new section and files the row in it", async () => {
		let store: TranscriptStore | undefined
		let spaceId = ""
		await mountApp(async (held) => {
			store = held.store
			spaceId = held.spaceId
			await seedPinned(held)
		})

		await openRowMenu("Loose room")
		await press(
			screen.getByRole("menuitem", {
				name: i18n.t("bots:roster.section.moveTo"),
			}),
		)
		await press(
			screen.getByRole("menuitem", {
				name: i18n.t("bots:roster.section.create"),
			}),
		)
		const field = screen.getByRole("textbox", {
			name: i18n.t("bots:roster.section.createField"),
		})
		await act(async () => {
			fireEvent.change(field, { target: { value: "Clients" } })
			fireEvent.keyDown(field, { key: "Enter" })
		})
		await settle()

		const [section] = (await store?.sections(spaceId)) ?? []
		const page = await store?.conversationPage(spaceId, null, 30)
		expect(section?.name).toBe("Clients")
		expect(
			page?.pinned.find(({ title }) => title === "Loose room")?.sectionId,
		).toBe(section?.id)
	})

	it("moves a pinned row one place on Alt with an arrow and announces the move", async () => {
		await mountApp(seedPinned)

		await act(async () => {
			fireEvent.keyDown(rosterRowOf("First pin"), {
				altKey: true,
				key: "ArrowDown",
			})
		})
		await settle()

		expect(pinnedNames()).toEqual(["Second pin", "First pin"])
		expect(slotOf("roster-move-announcement")?.textContent).toBe(
			i18n.t("bots:roster.moved", {
				name: "First pin",
				position: 2,
				count: 2,
			}),
		)
	})

	it("files a row dropped on Pinned from Conversations, and unpins a row dropped back", async () => {
		await mountApp(seedPinned)

		liftRow("Loose room")
		await dropOver(dropAreaWith("First pin"))
		expect(pinnedNames()).toContain("Loose room")

		liftRow("Loose room")
		await dropOver(
			slotOf("fold-section")
				?.parentElement?.querySelectorAll("[data-roster-drop]")
				.item(
					document.querySelectorAll("[data-roster-drop]").length - 1,
				) as Element,
		)
		expect(recentNames()).toContain("Loose room")
	})

	it("marks the row of a mission reached by its route current, and not the row of its conversation", async () => {
		let roomId = ""
		const { router } = await mountApp(async (held) => {
			const room = await roomIn(held, "Release train")
			roomId = room.id
			harness.missions = [missionOn(held, room, { id: "mission-release" })]
		})

		await act(async () => {
			await router.navigate({
				to: "/",
				search: { conversation: roomId, mission: "mission-release" },
			})
		})
		await settle()

		expect(slotOf("mission-capsule")?.getAttribute("aria-current")).toBe("page")
		expect(rosterRowOf("Release train").getAttribute("aria-current")).toBeNull()
	})
})

describe("the open mission count of the expanded sidebar", () => {
	const missionsIn =
		(states: Mission["state"][]) => async (held: SpaceSeed) => {
			const room = await roomIn(held, "Release train")
			harness.missions = states.map((state, index) =>
				missionOn(held, room, { id: `mission-${index}`, state }),
			)
		}

	it("shows five for one mission waiting on the person and four in progress", async () => {
		await mountApp(
			missionsIn([
				"waiting_human",
				"working",
				"waiting_bot",
				"ready_to_merge",
				"working",
			]),
		)

		expect(entry(`${MISSIONS} 5`)).toBeTruthy()
	})

	it("draws no count when the Space holds no open mission", async () => {
		await mountApp(missionsIn(["done"]))

		expect(entry(MISSIONS).textContent).toBe(MISSIONS)
	})
})

const FAILED_LINE = i18n.t("bots:roster.failed")
const EMPTY_LINE = i18n.t("bots:roster.empty")
const PINNED = i18n.t("bots:roster.pinned")
const CONVERSATIONS = i18n.t("bots:rail.conversations")

const foldHeaders = () =>
	Array.from(slotsOf("fold-section-trigger")).map(
		(header) => header.textContent,
	)

const emptyLine = () => screen.queryByText(EMPTY_LINE)

const SECTION_DROP = '[data-slot="roster-section-drop"]'

const foldOf = (name: string) =>
	Array.from(slotsOf("fold-section")).find(
		(fold) =>
			fold.querySelector('[data-slot="fold-section-trigger"]')?.textContent ===
			name,
	) as Element

const filterPagesBy = (
	store: TranscriptStore,
	keeps: (row: ConversationInPage) => boolean,
) => {
	const read = store.conversationPage.bind(store)
	vi.spyOn(store, "conversationPage").mockImplementation(async (...args) => {
		const page = await read(...args)
		return {
			...page,
			pinned: page.pinned.filter(keeps),
			conversations: page.conversations.filter(keeps),
		}
	})
}

const holdsNoAgent = (store: TranscriptStore) =>
	vi.spyOn(store, "bots").mockResolvedValue([])

const holdsNoRow = (store: TranscriptStore) => {
	holdsNoAgent(store)
	filterPagesBy(store, () => false)
}

const holdsRoomsOnly = (store: TranscriptStore) => {
	holdsNoAgent(store)
	filterPagesBy(store, ({ soloBotId }) => !soloBotId)
}

const nameFieldFor = async (name: string) => {
	await openRowMenu(name)
	await press(
		screen.getByRole("menuitem", {
			name: i18n.t("bots:roster.section.moveTo"),
		}),
	)
	await press(
		screen.getByRole("menuitem", {
			name: i18n.t("bots:roster.section.create"),
		}),
	)
}

describe("the list states of the expanded sidebar", () => {
	it("draws no Pinned header when nothing is pinned, and the Conversations under it", async () => {
		await mountApp()

		expect(foldHeaders()).toEqual([CONVERSATIONS])
	})

	it("keeps the Pinned header for the name field of the only pinned row", async () => {
		await mountApp(async (held) => {
			const room = await roomIn(held, "Only pin")
			await held.store.pinRoster(held.spaceId, [
				{ id: room.id, sectionId: null },
			])
			holdsRoomsOnly(held.store)
		})

		expect(foldHeaders()).toEqual([PINNED])
		await nameFieldFor("Only pin")

		expect(foldHeaders()).toEqual([PINNED])
		expect(
			screen.getByRole("textbox", {
				name: i18n.t("bots:roster.section.createField"),
			}),
		).toBeTruthy()
	})

	it("draws no Conversations header when every row is pinned", async () => {
		await mountApp(async (held) => {
			const room = await roomIn(held, "Only pin")
			await held.store.pinRoster(held.spaceId, [
				{ id: room.id, sectionId: null },
			])
			holdsRoomsOnly(held.store)
		})

		expect(foldHeaders()).toEqual([PINNED])
	})

	it("keeps the Conversations header for the name field of the only loose row", async () => {
		await mountApp(async (held) => {
			await roomIn(held, "Only room")
			holdsRoomsOnly(held.store)
		})

		await nameFieldFor("Only room")

		expect(foldHeaders()).toEqual([CONVERSATIONS])
		expect(
			screen.getByRole("textbox", {
				name: i18n.t("bots:roster.section.createField"),
			}),
		).toBeTruthy()
	})

	it("draws the empty line alone when the Space holds no row and no section", async () => {
		await mountApp(async ({ store }) => holdsNoRow(store))

		expect(emptyLine()).not.toBeNull()
		expect(foldHeaders()).toEqual([])
	})

	it("draws the section and its drop zone, not the empty line, for a Space holding only a section", async () => {
		await mountApp(async ({ store, spaceId }) => {
			await store.createSection(spaceId, "Clients")
			holdsNoRow(store)
		})

		expect(emptyLine()).toBeNull()
		expect(foldHeaders()).toEqual(["Clients"])
		expect(foldOf("Clients").querySelector(SECTION_DROP)).not.toBeNull()
	})

	it("keeps the drop zone of Pinned while its only way in is a lifted row", async () => {
		await mountApp()
		expect(slotOf("roster-section-drop")).toBeNull()

		act(() => liftRow(rowNameIn(0)))

		expect(foldHeaders()).toEqual([PINNED, CONVERSATIONS])
		expect(slotOf("roster-section-drop")?.textContent).toBe(
			i18n.t("bots:roster.pinDrop"),
		)
	})

	it("keeps the drop zone of Conversations emptied by a lifted pinned row", async () => {
		await mountApp(async (held) => {
			const room = await roomIn(held, "Only pin")
			await held.store.pinRoster(held.spaceId, [
				{ id: room.id, sectionId: null },
			])
			holdsRoomsOnly(held.store)
		})

		act(() => liftRow("Only pin"))

		expect(foldHeaders()).toEqual([PINNED, CONVERSATIONS])
		expect(slotOf("roster-section-drop")?.textContent).toBe(
			i18n.t("bots:roster.section.empty"),
		)
	})

	it("draws the skeleton in place of both slots from the first moment the list is read again, never the empty line", async () => {
		await mountApp(async ({ store }) => {
			vi.spyOn(store, "bots")
				.mockRejectedValueOnce(new Error("no record"))
				.mockReturnValue(new Promise(() => undefined))
		})

		await press(
			within(sidebar()).getByRole("button", {
				name: i18n.t("bots:roster.retry"),
			}),
		)

		expect(slotOf("sidebar-list-skeleton")).not.toBeNull()
		expect(emptyLine()).toBeNull()
		expect(foldHeaders()).toEqual([])
	})

	it("draws the failure line and reloads the list on its Retry", async () => {
		let reads: ReturnType<typeof vi.spyOn> | null = null
		await mountApp(async ({ store }) => {
			reads = vi
				.spyOn(store, "bots")
				.mockRejectedValueOnce(new Error("no record"))
		})

		expect(screen.getByText(FAILED_LINE)).toBeTruthy()
		await press(
			within(sidebar()).getByRole("button", {
				name: i18n.t("bots:roster.retry"),
			}),
		)

		expect(reads).toHaveBeenCalledTimes(2)
		expect(screen.queryByText(FAILED_LINE)).toBeNull()
		expect(foldHeaders()).toEqual([CONVERSATIONS])
	})

	it("draws the list end under Conversations while more conversations load", async () => {
		const scroll = stubSentinelObserver()
		await mountApp(async ({ store }) => {
			const read = store.conversationPage.bind(store)
			vi.spyOn(store, "conversationPage").mockImplementation(
				async (spaceId, cursor, limit) =>
					cursor === null
						? { ...(await read(spaceId, cursor, limit)), nextCursor: "more" }
						: new Promise(() => undefined),
			)
		})
		const conversations = slotsOf("fold-section")[0]
		const sentinel = conversations.querySelector(
			'[data-slot="list-end-sentinel"]',
		) as Element

		await scroll.scrollInto(sentinel)
		await act(async () => {
			await vi.advanceTimersByTimeAsync(SKELETON_MS)
		})

		expect(
			conversations.querySelector('[data-slot="list-end-skeleton"]'),
		).not.toBeNull()
	})
})

const namesIn = (fold: string) =>
	Array.from(
		foldOf(fold).querySelectorAll('[data-slot="roster-row-name"]'),
	).map((name) => name.textContent)

const headerOf = (name: string) =>
	foldOf(name).querySelector(
		'[data-slot="fold-section-trigger"]',
	) as HTMLElement

const announcement = () => slotOf("roster-move-announcement")?.textContent

const seedNamedSections = async (held: SpaceSeed) => {
	const firstPin = await roomIn(held, "First pin")
	const clients = await held.store.createSection(held.spaceId, "Clients")
	const press = await held.store.createSection(held.spaceId, "Press")
	const kickoff = await roomIn(held, "Client kickoff")
	const brief = await roomIn(held, "Client brief")
	const kit = await roomIn(held, "Press kit")
	const lastPin = await roomIn(held, "Last pin")
	await roomIn(held, "Loose room")
	await held.store.pinRoster(held.spaceId, [
		{ id: firstPin.id, sectionId: null },
		{ id: clients.id, sectionId: null },
		{ id: kickoff.id, sectionId: clients.id },
		{ id: brief.id, sectionId: clients.id },
		{ id: lastPin.id, sectionId: null },
		{ id: press.id, sectionId: null },
		{ id: kit.id, sectionId: press.id },
	])
}

const mountSections = async (
	seed: (held: SpaceSeed) => Promise<void> = seedNamedSections,
) => {
	let store: TranscriptStore | undefined
	await mountApp(async (held) => {
		store = held.store
		await seed(held)
	})
	return store as TranscriptStore
}

const relaunch = async (store: TranscriptStore) => {
	cleanup()
	harness.store = store
	render(createElement(RouterProvider, { router: createWorkspaceRouter() }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
}

const SLOT_STEP = 40

const SLOT_HEIGHT = 32

const rosterSlots = () =>
	Array.from(document.querySelectorAll("[data-roster-slot]"))

const slotTopOf = (element: Element) =>
	rosterSlots().indexOf(element) * SLOT_STEP

const layOutRosterSlots = () => {
	for (const slot of rosterSlots())
		vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(
			new DOMRect(0, slotTopOf(slot), 200, SLOT_HEIGHT),
		)
}

const slotHolding = (handle: Element) =>
	handle.closest("[data-roster-slot]") as Element

const dragToSlot = async (handle: Element, area: Element, target: Element) => {
	layOutRosterSlots()
	const pointAt = (clientY: number) => ({ clientX: 0, clientY, pointerId: 1 })
	const fromY = slotTopOf(slotHolding(handle)) + SLOT_HEIGHT / 2
	const toY = slotTopOf(target) + SLOT_HEIGHT / 2
	vi.spyOn(document, "elementFromPoint").mockReturnValue(area)
	await act(async () => {
		fireEvent.pointerDown(handle, { button: 0, ...pointAt(fromY) })
		fireEvent.pointerMove(window, pointAt(fromY + 8))
		fireEvent.pointerMove(window, pointAt(toY))
		fireEvent.pointerUp(window, pointAt(toY))
	})
	await settle()
	vi.restoreAllMocks()
}

const pressAltArrow = async (control: Element, key: string) => {
	await act(async () => {
		fireEvent.keyDown(control, { altKey: true, key })
	})
	await settle()
}

const pickInSectionMenu = async (name: string, item: string) => {
	await act(async () => {
		fireEvent.contextMenu(headerOf(name), { clientX: 20, clientY: 20 })
	})
	await settle()
	await press(screen.getByRole("menuitem", { name: item }))
}

const foldsAround = (...sections: string[]) => [
	PINNED,
	...sections,
	CONVERSATIONS,
]

describe("the named sections of the expanded sidebar", () => {
	it("draws Pinned with its rows only, then each section in saved order, then Conversations", async () => {
		await mountSections()

		expect(foldHeaders()).toEqual(foldsAround("Clients", "Press"))
		expect(namesIn(PINNED)).toEqual(["First pin", "Last pin"])
		expect(namesIn("Clients")).toEqual(["Client kickoff", "Client brief"])
		expect(namesIn("Press")).toEqual(["Press kit"])
		expect(namesIn(CONVERSATIONS)).toContain("Loose room")
	})

	it("lands a pinned row saved after a section where the pointer drops it in Pinned", async () => {
		await mountSections()
		const first = rosterRowOf("First pin")

		await dragToSlot(
			rosterRowOf("Last pin"),
			dropAreaWith("First pin"),
			slotHolding(first),
		)

		expect(namesIn(PINNED)).toEqual(["Last pin", "First pin"])
		expect(foldHeaders()).toEqual(foldsAround("Clients", "Press"))
	})

	it("lands a section row dropped between two pinned rows where the pointer drops it", async () => {
		await mountSections()
		const lastPin = rosterRowOf("Last pin")

		await dragToSlot(
			rosterRowOf("Client kickoff"),
			dropAreaWith("Last pin"),
			slotHolding(lastPin),
		)

		expect(namesIn(PINNED)).toEqual(["First pin", "Client kickoff", "Last pin"])
		expect(namesIn("Clients")).toEqual(["Client brief"])
	})

	it("lands a pinned row saved after a section in the section drawn under it", async () => {
		await mountSections()
		const brief = rosterRowOf("Client brief")

		await dragToSlot(
			rosterRowOf("Last pin"),
			foldOf("Clients").closest("[data-roster-drop]") as Element,
			slotHolding(brief),
		)

		expect(namesIn(PINNED)).toEqual(["First pin"])
		expect(namesIn("Clients")).toContain("Last pin")
	})

	it("walks a pinned row saved after a section through what is drawn on Alt with an arrow", async () => {
		await mountSections()

		await pressAltArrow(rosterRowOf("Last pin"), "ArrowUp")
		expect(namesIn(PINNED)).toEqual(["Last pin", "First pin"])

		await pressAltArrow(rosterRowOf("First pin"), "ArrowDown")
		expect(namesIn(PINNED)).toEqual(["Last pin"])
		expect(namesIn("Clients")).toEqual([
			"First pin",
			"Client kickoff",
			"Client brief",
		])
	})

	it("carries the last row of a section into the next section on Alt with the Down arrow", async () => {
		await mountSections()

		await pressAltArrow(rosterRowOf("Client brief"), "ArrowDown")

		expect(namesIn(PINNED)).toEqual(["First pin", "Last pin"])
		expect(namesIn("Clients")).toEqual(["Client kickoff"])
		expect(namesIn("Press")).toEqual(["Client brief", "Press kit"])
		expect(announcement()).toBe(
			i18n.t("bots:roster.movedInSection", {
				name: "Client brief",
				position: 1,
				count: 2,
				section: "Press",
			}),
		)
	})

	it("carries the first row of a section to the end of the previous section on Alt with the Up arrow", async () => {
		await mountSections()

		await pressAltArrow(rosterRowOf("Press kit"), "ArrowUp")

		expect(namesIn(PINNED)).toEqual(["First pin", "Last pin"])
		expect(namesIn("Clients")).toEqual([
			"Client kickoff",
			"Client brief",
			"Press kit",
		])
	})

	it("leaves the last row of the last section there on Alt with the Down arrow and announces nothing", async () => {
		await mountSections()

		await pressAltArrow(rosterRowOf("Press kit"), "ArrowDown")

		expect(namesIn("Press")).toEqual(["Press kit"])
		expect(namesIn(PINNED)).toEqual(["First pin", "Last pin"])
		expect(announcement()).toBe("")
	})

	it("places a section released above Pinned first among the sections", async () => {
		const store = await mountSections()
		const first = rosterRowOf("First pin")

		await dragToSlot(
			headerOf("Press"),
			dropAreaWith("First pin"),
			slotHolding(first),
		)

		expect(foldHeaders()).toEqual(foldsAround("Press", "Clients"))
		expect(namesIn(PINNED)).toEqual(["First pin", "Last pin"])

		await relaunch(store)
		expect(foldHeaders()).toEqual(foldsAround("Press", "Clients"))
	})

	it("keeps a section and its rows when it is released over Conversations", async () => {
		await mountSections()

		await dragToSlot(
			headerOf("Clients"),
			dropAreaWith("Loose room"),
			slotHolding(headerOf("Press")),
		)

		expect(foldHeaders()).toEqual(foldsAround("Press", "Clients"))
		expect(namesIn("Clients")).toEqual(["Client kickoff", "Client brief"])
	})

	it.each([
		["Clients", "ArrowUp"],
		["Press", "ArrowDown"],
	])(
		"leaves the order unchanged on Alt with an arrow past the edge from %s and announces no move",
		async (name, key) => {
			await mountSections()

			await pressAltArrow(headerOf(name), key)

			expect(foldHeaders()).toEqual(foldsAround("Clients", "Press"))
			expect(announcement()).toBe("")
		},
	)

	it("moves a section among the sections on Alt with an arrow and counts only the sections", async () => {
		await mountSections()

		await pressAltArrow(headerOf("Press"), "ArrowUp")

		expect(foldHeaders()).toEqual(foldsAround("Press", "Clients"))
		expect(announcement()).toBe(
			i18n.t("bots:roster.moved", { name: "Press", position: 1, count: 2 }),
		)
	})

	it("draws the drop zone in the body of a section holding no row", async () => {
		await mountSections(async (held) => {
			await seedPinned(held)
			await held.store.createSection(held.spaceId, "Clients")
		})

		expect(foldOf("Clients").querySelector(SECTION_DROP)?.textContent).toBe(
			i18n.t("bots:roster.section.empty"),
		)
	})

	it("draws no Pinned header above the sections while no row is pinned or lifted", async () => {
		await mountSections(async (held) => {
			await roomIn(held, "Loose room")
			await held.store.createSection(held.spaceId, "Clients")
		})

		expect(foldHeaders()).toEqual(["Clients", CONVERSATIONS])
	})

	it("shows the drop zone of Pinned during a lift and pins a row released there outside any section", async () => {
		const seed = async (held: SpaceSeed) => {
			await roomIn(held, "Loose room")
			await held.store.createSection(held.spaceId, "Clients")
		}
		await mountSections(seed)

		act(() => liftRow("Loose room"))

		expect(foldHeaders()).toEqual([PINNED, "Clients", CONVERSATIONS])
		const zone = foldOf(PINNED).querySelector(SECTION_DROP) as Element
		expect(zone.textContent).toBe(i18n.t("bots:roster.pinDrop"))

		await dropOver(zone)

		expect(namesIn(PINNED)).toEqual(["Loose room"])
		expect(foldOf("Clients").querySelector(SECTION_DROP)).not.toBeNull()
	})

	it("keeps a renamed section after a relaunch", async () => {
		const store = await mountSections()

		await pickInSectionMenu("Clients", i18n.t("bots:roster.section.rename"))
		const field = screen.getByRole("textbox", {
			name: i18n.t("bots:roster.section.renameField", { name: "Clients" }),
		})
		await act(async () => {
			fireEvent.change(field, { target: { value: "Partners" } })
			fireEvent.keyDown(field, { key: "Enter" })
		})
		await settle()
		expect(foldHeaders()).toEqual(foldsAround("Partners", "Press"))

		await relaunch(store)
		expect(foldHeaders()).toEqual(foldsAround("Partners", "Press"))
	})

	it("keeps Move up after a relaunch", async () => {
		const store = await mountSections()

		await pickInSectionMenu("Press", i18n.t("bots:roster.section.moveUp"))
		expect(foldHeaders()).toEqual(foldsAround("Press", "Clients"))

		await relaunch(store)
		expect(foldHeaders()).toEqual(foldsAround("Press", "Clients"))
		expect(namesIn(PINNED)).toEqual(["First pin", "Last pin"])
	})

	it("keeps Move down after a relaunch", async () => {
		const store = await mountSections()

		await pickInSectionMenu("Clients", i18n.t("bots:roster.section.moveDown"))
		expect(foldHeaders()).toEqual(foldsAround("Press", "Clients"))

		await relaunch(store)
		expect(foldHeaders()).toEqual(foldsAround("Press", "Clients"))
		expect(namesIn("Clients")).toEqual(["Client kickoff", "Client brief"])
	})

	it("keeps a deleted section gone after a relaunch", async () => {
		const store = await mountSections()

		await pickInSectionMenu("Press", i18n.t("bots:roster.section.delete"))
		expect(foldHeaders()).toEqual(foldsAround("Clients"))

		await relaunch(store)
		expect(foldHeaders()).toEqual(foldsAround("Clients"))
	})

	it("keeps a dragged section after a relaunch", async () => {
		const store = await mountSections()

		await dragToSlot(
			headerOf("Clients"),
			foldOf("Press").closest("[data-roster-drop]") as Element,
			slotHolding(headerOf("Press")),
		)
		expect(foldHeaders()).toEqual(foldsAround("Press", "Clients"))

		await relaunch(store)
		expect(foldHeaders()).toEqual(foldsAround("Press", "Clients"))
	})

	it("keeps a section closed after a relaunch and opens it again", async () => {
		const store = await mountSections()

		await press(headerOf("Clients"))
		expect(headerOf("Clients").getAttribute("aria-expanded")).toBe("false")

		await relaunch(store)
		expect(headerOf("Clients").getAttribute("aria-expanded")).toBe("false")

		await press(headerOf("Clients"))
		expect(headerOf("Clients").getAttribute("aria-expanded")).toBe("true")
	})

	it("shows a row filed from its menu in the body of that section", async () => {
		await mountSections()

		await openRowMenu("Loose room")
		await press(
			screen.getByRole("menuitem", {
				name: i18n.t("bots:roster.section.moveTo"),
			}),
		)
		await press(screen.getByRole("menuitemradio", { name: "Press" }))

		expect(namesIn("Press")).toEqual(["Press kit", "Loose room"])
		expect(namesIn(CONVERSATIONS)).not.toContain("Loose room")
	})
})
