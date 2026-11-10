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
import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import type { Invoke } from "@/lib/host/joined-hosts-invoke"
import type { Mission } from "@/lib/missions/mission-contract"
import { aMission } from "@/lib/missions/mission-fixtures"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
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
		.map((button) => button.getAttribute("aria-label") ?? button.textContent)

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
const MISSIONS_ENTRY = new RegExp(`^${MISSIONS} \\d+$`)
const LIBRARY = i18n.t("bots:rail.library")

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

	it.each<{ path: RoutedPath; current: string[] }>([
		{ path: "/home", current: [NEW_CONVERSATION] },
		{ path: "/missions", current: [`${MISSIONS}0`] },
		{ path: "/library", current: [LIBRARY] },
		{ path: "/", current: [] },
	])(
		"marks $current as the current entry on $path",
		async ({ path, current }) => {
			const { router } = await mountApp()

			await navigateTo(router, path)

			expect(currentEntries()).toEqual(current)
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

		await press(entry(i18n.t("bots:rail.settings")))

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

			await press(entry(SEARCH))
			expect(slotOf("search-palette")).not.toBeNull()
		},
	)
})

describe("the sidebar toggle", () => {
	it("collapses the sidebar from the title bar button and saves it, then expands it back", async () => {
		await mountApp()

		await press(toggleSidebarButton())

		expect(slotOf("expanded-sidebar")).toBeNull()
		expect(slotOf("collapsed-sidebar")).not.toBeNull()
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

	it("toggles once per Cmd+B press, inside a text field too", async () => {
		const { router } = await mountApp()
		await navigateTo(router, "/home")

		await pressCommand("b")

		expect(slotOf("collapsed-sidebar")).not.toBeNull()
		expect(savedLayouts).toHaveBeenCalledExactlyOnceWith({ isCollapsed: true })

		await pressCommand("b", screen.getByRole("textbox"))

		expect(slotOf("expanded-sidebar")).not.toBeNull()
		expect(savedLayouts).toHaveBeenCalledTimes(2)
		expect(savedLayouts).toHaveBeenLastCalledWith({ isCollapsed: false })
	})

	it("opens collapsed with no expanded sidebar ever drawn when the sidebar was left collapsed", async () => {
		writeMirror({ ...readMirror(), sidebarCollapsed: true })

		await mountApp()

		expect(slotOf("collapsed-sidebar")).not.toBeNull()
		expect(harness.mounts.expandedSidebar).toBe(0)
	})

	it("rolls the sidebar back to expanded and raises a notice when the layout can't be saved", async () => {
		await mountApp()
		harness.refusesSidebarLayout = true

		await press(toggleSidebarButton())

		expect(slotOf("collapsed-sidebar")).toBeNull()
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

const railConversationNames = () =>
	Array.from(slotsOf("collapsed-sidebar-conversation")).map((item) =>
		item.getAttribute("aria-label"),
	)

const rail = () => within(slotOf("collapsed-sidebar") as HTMLElement)

describe("the conversations of the collapsed sidebar", () => {
	it("lists the pinned conversations, then each section, then the others of the current Space", async () => {
		await mountCollapsed(async (held) => {
			const hiring = await roomIn(held, "Hiring loop")
			const roadmap = await roomIn(held, "Roadmap")
			await roomIn(held, "Pricing")
			const clients = await held.store.createSection(held.spaceId, "Clients")
			await held.store.pinRoster(held.spaceId, [
				{ id: roadmap.id, sectionId: null },
				{ id: clients.id, sectionId: null },
				{ id: hiring.id, sectionId: null },
			])
		})

		expect(railConversationNames().slice(0, 2)).toEqual([
			"Roadmap",
			"Hiring loop",
		])
		expect(railConversationNames()).toContain("Pricing")
		expect(
			rail().getByRole("img", {
				name: i18n.t("bots:roster.titled", {
					name: "Clients",
					title: i18n.t("bots:roster.section.empty"),
				}),
			}),
		).toBeTruthy()
	})

	it("shows the mission of a conversation under it and opens that mission on click", async () => {
		let roomId = ""
		const { router } = await mountCollapsed(async (held) => {
			const room = await roomIn(held, "Release train")
			roomId = room.id
			harness.missions = [missionOn(held, room, { id: "mission-release" })]
		})

		const mission = slotOf("collapsed-sidebar-mission") as HTMLElement
		await press(mission)

		expect(router.state.location.search).toMatchObject({
			conversation: roomId,
			mission: "mission-release",
		})
	})

	it("shows the skeleton while the list is read", async () => {
		await mountCollapsed(async ({ store }) => {
			vi.spyOn(store, "bots").mockReturnValue(new Promise(() => undefined))
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(SKELETON_MS)
		})

		expect(slotsOf("collapsed-sidebar-skeleton").length).toBeGreaterThan(0)
	})

	it("offers a retry when the list fails to load and reads it again on retry", async () => {
		let reads: ReturnType<typeof vi.spyOn> | null = null
		await mountCollapsed(async ({ store }) => {
			reads = vi
				.spyOn(store, "bots")
				.mockRejectedValueOnce(new Error("no record"))
		})

		await press(
			rail().getByRole("button", { name: i18n.t("bots:roster.retry") }),
		)

		expect(reads).toHaveBeenCalledTimes(2)
		expect(slotOf("collapsed-sidebar-retry")).toBeNull()
	})
})

describe("the Missions entry of the expanded sidebar", () => {
	it("counts the missions of the current Space waiting on the person", async () => {
		await mountApp(async (held) => {
			const room = await roomIn(held, "Release train")
			harness.missions = [
				missionOn(held, room, {
					id: "mission-waiting",
					state: "waiting_human",
				}),
				missionOn(held, room, { id: "mission-working", state: "working" }),
			]
		})

		expect(entry(`${MISSIONS} 1`)).toBeTruthy()
	})
})
