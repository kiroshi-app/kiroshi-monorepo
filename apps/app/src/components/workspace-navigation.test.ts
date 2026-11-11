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
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { i18n } from "@workspace/ui/lib/i18n"

import { useWorkspaceNavigation } from "@/components/workspace-navigation"
import type { JoinedSpace, Space } from "@/lib/bindings"
import { newBotIdentity } from "@/lib/bots/bot-settings"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
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
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"

type MountedApp = {
	store: TranscriptStore | null
	openJoinedSpace: JoinedSpace | null
	departed: DepartedSpace | null
}

const mounted = vi.hoisted(
	(): MountedApp => ({
		store: null,
		openJoinedSpace: null,
		departed: null,
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
const NO_INVITATIONS = {
	rows: [],
	termsOf: () => undefined,
	joinedIdOf: () => undefined,
	accept: () => undefined,
	decline: () => undefined,
	sweepWithdrawn: () => undefined,
}

const sidebarOf = () =>
	screen.getByRole("navigation", { name: i18n.t("bots:rail.label") })

const switcherTint = () =>
	sidebarOf()
		.querySelector<HTMLElement>("[data-slot='space-avatar']")
		?.getAttribute("data-colour")

afterEach(cleanup)

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

const produceNavigationFor = ({
	selectedSpaceId,
	connections,
}: Pick<ProducedSpace, "selectedSpaceId" | "connections">) =>
	renderHook(
		() =>
			useWorkspaceNavigation({
				navigation: {} as SettingsNavigation,
				overlay: {
					search: { isOpen: false, open: () => {} },
				} as unknown as WorkspaceOverlay,
				rosterLines: { sidebarActions: {} } as RosterLines,
				rosterLists: {} as RosterLists,
				sidebarMissions: { openMissionThread: () => undefined },
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
	"the navigation of the sidebar with $label selected",
	({ selectedSpaceId, connections, space, host }) => {
		it("selects that Space in the Space switcher", () => {
			const { selectedSpaceId: selected } = produceNavigationFor({
				selectedSpaceId,
				connections,
			})

			expect(selected).toBe(space.id)
		})

		it("hands the Space switcher every Space's connection state", () => {
			const { hostBySpaceId } = produceNavigationFor({
				selectedSpaceId,
				connections,
			}).sidebar

			expect(hostBySpaceId?.[space.id]).toBe(host)
		})
	},
)

describe("the navigation of the sidebar on a Space that is gone", () => {
	it("selects the first Space in the Space switcher", () => {
		const { selectedSpaceId } = produceNavigationFor({
			selectedSpaceId: "gone",
			connections: {},
		})

		expect(selectedSpaceId).toBe(HOME.id)
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

		it("paints the Space switcher of the sidebar with the selected Space", async () => {
			await mountAppAtConversations(joined)

			expect(switcherTint()).toBe(colour)
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

	type SidebarEntry = "newConversation" | "missions" | "library"

	const sidebarEntry = (name: SidebarEntry) =>
		within(sidebarOf()).getByRole("button", {
			name: new RegExp(`^${i18n.t(`bots:rail.${name}`)}( \\d+)?$`),
		})

	const currentEntries = () =>
		within(sidebarOf())
			.getAllByRole("button")
			.filter((entry) => entry.getAttribute("aria-current") === "page")

	const pressInSidebar = async (name: SidebarEntry) => {
		act(() => {
			fireEvent.click(sidebarEntry(name))
		})
		await settle()
	}

	const pickedAgentName = () =>
		document.querySelector("[data-slot='home-agent-chip']")?.textContent

	const slot = (name: string) => document.querySelector(`[data-slot='${name}']`)

	it("opens from New conversation on the first agent, marking New conversation alone", async () => {
		const { router, firstOfSpace } = await mountAppWithTwoAgents()

		await pressInSidebar("newConversation")

		expect(router.state.location.pathname).toBe("/home")
		expect(currentEntries()).toEqual([sidebarEntry("newConversation")])
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

		await pressInSidebar("newConversation")

		expect(pickedAgentName()).toBe(second.name)
	})

	it("shows the Home of the agent picked in the composer, the previous agent chat untouched", async () => {
		const { firstOfSpace, second, store } = await mountAppWithTwoAgents()
		await pressInSidebar("newConversation")
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

	it.each<SidebarEntry>(["missions", "library"])(
		"leaves the Home for %s, the sidebar marking that entry",
		async (entry) => {
			await mountAppWithTwoAgents()
			await pressInSidebar("newConversation")

			await pressInSidebar(entry)

			expect(currentEntries()).toEqual([sidebarEntry(entry)])
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

	const composerText = () =>
		(screen.getByRole("textbox") as HTMLTextAreaElement).value

	const conversationsSeating = async (
		store: TranscriptStore,
		agentId: string,
	) =>
		(await store.conversations(PERSONAL_SPACE_ID)).filter(({ participants }) =>
			participants.some(({ botId }) => botId === agentId),
		)

	const pickInComposer = async (agentName: string) => {
		act(() => {
			fireEvent.click(slot("home-agent-chip") as HTMLElement)
		})
		await settle()
		act(() => {
			fireEvent.click(screen.getByRole("menuitemradio", { name: agentName }))
		})
		await settle()
	}

	it("frames the fresh Home with no thread header and no routines trigger", async () => {
		await mountAppWithTwoAgents()
		await pressInSidebar("newConversation")

		expect(slot("home-layout")?.getAttribute("data-stage")).toBe("empty")
		expect(threadChrome().header).toBeNull()
		expect(threadChrome().identity).toBeNull()
		expect(threadChrome().activityToggle).toBeNull()
	})

	it("opens the first message in a new conversation seating the picked agent", async () => {
		const { router, store, second } = await mountAppWithTwoAgents()
		await pressInSidebar("newConversation")
		await pickInComposer(second.name)

		await sendFromHome("Book the flights.")

		const [created] = await conversationsSeating(store, second.id)
		expect(router.state.location.pathname).toBe("/")
		expect(router.state.location.search).toEqual({ conversation: created?.id })
		expect(slot("home-layout")).toBeNull()
		expect(screen.getAllByText("Book the flights.")).not.toHaveLength(0)
	})

	it("comes back to a fresh Home after a send, a second send opening a second conversation", async () => {
		const { router, store, firstOfSpace } = await mountAppWithTwoAgents()
		await pressInSidebar("newConversation")
		await sendFromHome("Book the flights.")

		await pressInSidebar("newConversation")

		expect(slot("home-layout")?.getAttribute("data-stage")).toBe("empty")
		expect(composerText()).toBe("")
		expect(slot("home-layout")?.textContent).not.toContain("Book the flights.")

		await sendFromHome("Book the hotel.")

		const opened = await conversationsSeating(store, firstOfSpace.id)
		expect(opened.map(({ title }) => title).sort()).toEqual([
			"Book the flights.",
			"Book the hotel.",
		])
		expect(router.state.location.search).toEqual({
			conversation: opened.find(({ title }) => title === "Book the hotel.")?.id,
		})
	})

	it("shows no activity panel on the Home, even with the panel left open in Conversations", async () => {
		writeMirror({ ...readMirror(), activityPanelOpen: true })
		const { router, first } = await mountAppWithTwoAgents()
		await openInConversations(router, first.id)
		expect(threadChrome().activityPanel).not.toBeNull()

		await pressInSidebar("newConversation")

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

		await pressInSidebar("newConversation")

		expect(slot("home-layout")?.getAttribute("data-stage")).toBe("empty")
		expect(slot("space-access-banner")?.getAttribute("data-reason")).toBe(
			"removed",
		)
		expect(slot("home-composer")).toBeNull()
		expect(slot("chat-layout")).toBeNull()
	})

	it("keeps the draft on the Home and raises a notice when the conversation can't be created", async () => {
		const { router, store } = await mountAppWithTwoAgents()
		vi.spyOn(store, "createConversation").mockRejectedValue(
			new Error("disk full"),
		)
		await pressInSidebar("newConversation")

		await sendFromHome("Book the flights.")

		expect(router.state.location.pathname).toBe("/home")
		expect(composerText()).toBe("Book the flights.")
		expect(
			screen.getAllByText(i18n.t("chat:home.failure.send.title")),
		).not.toHaveLength(0)
	})

	it("keeps the draft on the Home and raises a notice when the message can't be sent", async () => {
		const { router, store } = await mountAppWithTwoAgents()
		vi.spyOn(store, "sendUserMessage").mockRejectedValue(new Error("disk full"))
		await pressInSidebar("newConversation")

		await sendFromHome("Book the flights.")

		expect(router.state.location.pathname).toBe("/home")
		expect(composerText()).toBe("Book the flights.")
		expect(
			screen.getAllByText(i18n.t("chat:home.failure.send.title")),
		).not.toHaveLength(0)
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
