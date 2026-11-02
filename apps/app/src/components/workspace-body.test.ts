// @vitest-environment happy-dom

import type { InvokeArgs } from "@tauri-apps/api/core"
import {
	act,
	cleanup,
	fireEvent,
	type RenderOptions,
	render as renderWithoutQueries,
	screen,
	waitFor,
	within,
} from "@testing-library/react"
import {
	type ComponentProps,
	createElement,
	Fragment,
	type ReactElement,
	useState,
} from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import "@workspace/ui/lib/i18n"

import { LibraryScreen } from "@/components/library-screen"
import type { ActivityPanel } from "@/components/thread-routines"
import { WorkspaceBody } from "@/components/workspace-body"
import {
	commands,
	type Json,
	type LibraryDocument,
	type LibraryItem,
} from "@/lib/bindings"
import { createAttachmentsController } from "@/lib/chat/attachments-controller"
import { createAttachmentsPort } from "@/lib/chat/attachments-port"
import { createChatController } from "@/lib/chat/chat-controller"
import { initialChatState } from "@/lib/chat/chat-state"
import { createDraftsController } from "@/lib/chat/drafts-controller"
import {
	type ConversationRuntimes,
	createConversationRuntimes,
} from "@/lib/conversations/conversation-runtimes"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import {
	createScriptedDriver,
	type ScriptedDriver,
} from "@/lib/conversations/scripted-driver"
import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { seatBots } from "@/lib/conversations/transcript-fixtures"
import type { Invoke } from "@/lib/host/joined-hosts-invoke"
import type {
	Mission,
	MissionChanged,
	MissionDetail,
	MissionEvent,
} from "@/lib/missions/mission-contract"
import { missionsTransport } from "@/lib/missions/missions-transport"
import {
	createOpenedMissionController,
	type SelectedRow,
} from "@/lib/missions/opened-mission-controller"
import { createFakeOnboardingPort } from "@/lib/onboarding/fake-onboarding-port"
import { createSignInController } from "@/lib/onboarding/sign-in-controller"
import { type FakeLayout, fakeLayout } from "@/lib/perf/fake-layout"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { createOpenedRoutineController } from "@/lib/routines/opened-routine-controller"
import { routinesTransport } from "@/lib/routines/routines-transport"
import { triggerSourcesTransport } from "@/lib/routines/trigger-sources-transport"
import { createMessageLandingController } from "@/lib/search/message-landing-controller"
import {
	isJoinedRowId,
	joinedRowIdOf,
} from "@/lib/spaces/joined-spaces-controller"

let queries = createQueryTestWrapper()

beforeEach(() => {
	queries = createQueryTestWrapper()
})

const render = (ui: ReactElement, options?: RenderOptions) =>
	renderWithoutQueries(ui, { wrapper: queries.wrapper, ...options })

vi.mock("@/lib/routines/routines-transport", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/routines/routines-transport")>()

	return {
		...actual,
		routinesTransport: {
			...actual.routinesTransport,
			list: vi.fn(),
			runs: vi.fn(),
			runsOfSpace: vi.fn(),
		},
	}
})
vi.mock("@/lib/bindings", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/bindings")>()

	return {
		...actual,
		commands: {
			...actual.commands,
			librarySave: vi.fn(),
			libraryCopy: vi.fn(),
			libraryReveal: vi.fn(),
		},
	}
})
const libraryHost = vi.hoisted(() => ({
	list: vi.fn(),
	readDocument: vi.fn(),
	readImage: vi.fn(),
}))
vi.mock("@/lib/host/index", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/host/index")>()
	const libraryReads: Record<string, (args?: InvokeArgs) => Promise<unknown>> =
		{
			library_list: libraryHost.list,
			library_read_document: libraryHost.readDocument,
			library_read_image: libraryHost.readImage,
		}
	const invoke: Invoke = <T>(...call: Parameters<Invoke>) => {
		const [command, args] = call
		const read = libraryReads[command]
		return read ? (read(args) as Promise<T>) : actual.invoke<T>(...call)
	}
	return { ...actual, invoke }
})
vi.mock("@/lib/host/tauri", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/tauri")>()),
	convertFileSrc: (path: string) => `asset://localhost${path}`,
}))
vi.mock("@/lib/routines/trigger-sources-transport", () => ({
	triggerSourcesTransport: { sourcesOfSpace: vi.fn() },
}))
vi.mock("@/lib/missions/missions-transport", () => ({
	missionsTransport: {
		list: vi.fn(),
		detailOn: vi.fn(),
		close: vi.fn(),
		reopen: vi.fn(),
		onChanged: vi.fn(),
	},
}))

const listRoutines = vi.mocked(routinesTransport.list)
const listRuns = vi.mocked(routinesTransport.runsOfSpace)
const listSources = vi.mocked(triggerSourcesTransport.sourcesOfSpace)
const listMissions = vi.mocked(missionsTransport.list)
const readMission = vi.mocked(missionsTransport.detailOn)
const listenToMissions = vi.mocked(missionsTransport.onChanged)
const closeMission = vi.mocked(missionsTransport.close)
const reopenMission = vi.mocked(missionsTransport.reopen)

const SPACE = "personal"

const THREAD_CONVERSATION = "c-mission-1"

const OBJECTIVE = "Rewrite the changelog parser"

const ACTIVITY = "Toggle activity"

const CLOSE_ACTIVITY = "Close activity"

const A_MINUTE = 60_000

const BACK = "Back to the conversation"

const READ_FAILURE_TITLE = "Couldn’t load this mission"

const SEND_FAILURE_TITLE = "Couldn’t send your answer"

const missionOf = (bot: Bot, origin: Conversation): Mission => ({
	id: "m-1",
	originConversationId: origin.id,
	spaceId: null,
	botId: bot.id,
	threadConversationId: THREAD_CONVERSATION,
	objective: OBJECTIVE,
	ticket: {
		platform: "linear",
		externalId: "OPE-42",
		url: "https://linear.app/ope-42",
		title: "Changelog parser",
	},
	tools: ["Read"],
	state: "waiting_human",
	stateSeq: 1,
	isAgentRunning: false,
	openedAt: 0,
	closedAt: null,
	reportedAt: null,
	reportedTurnId: null,
	status: null,
	lastActivityAt: null,
	lastActivity: null,
	commitsAhead: null,
	dirtyFiles: null,
	pullRequestUrl: null,
	branch: null,
	workspacePath: null,
})

const eventOf = (
	kind: MissionEvent["kind"],
	createdAt: number,
	payload: Json = null,
): MissionEvent => ({
	id: `e-${kind}-${createdAt}`,
	missionId: "m-1",
	kind,
	source: "bot",
	payload,
	createdAt,
})

const createFakeRoster = () => {
	const listeners = new Set<() => void>()
	let selected: SelectedRow = {
		selectedBotId: null,
		selectedConversationId: null,
	}

	return {
		getState: () => selected,
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		select: (conversationId: string) => {
			selected = {
				selectedBotId: null,
				selectedConversationId: conversationId,
			}
			for (const listener of [...listeners]) {
				listener()
			}
		},
	}
}

type WorkspaceBodyHarnessProps = Omit<
	ComponentProps<typeof WorkspaceBody>,
	"activityPanel"
> & {
	isActivityPanelOpenAtFirst: boolean
}

const WorkspaceBodyHarness = ({
	isActivityPanelOpenAtFirst,
	...body
}: WorkspaceBodyHarnessProps) => {
	const [isOpen, setOpen] = useState(isActivityPanelOpenAtFirst)

	return createElement(WorkspaceBody, {
		...body,
		activityPanel: {
			isOpen,
			onOpenChange: setOpen,
			openedRoutine: createOpenedRoutineController(),
		},
	})
}

type Workspace = {
	bot: Bot
	conversation: Conversation
	otherConversation: Conversation
	driver: ScriptedDriver
	runtimes: ConversationRuntimes
	body: (options?: BodyOptions) => ReturnType<typeof createElement>
	controlledBody: (
		activityPanel: ActivityPanel,
	) => ReturnType<typeof createElement>
}

type BodyOptions = {
	selected?: Conversation
	isActivityPanelOpenAtFirst?: boolean
	overrides?: Partial<WorkspaceBodyHarnessProps>
}

const workspaceOf = async (store = createFakeTranscriptStore()) => {
	const [bot] = await seatBots(store, SPACE, ["Nyx"])
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: [bot.id],
	})
	const otherConversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Roof",
		botIds: [bot.id],
	})
	const driver = createScriptedDriver()
	const runtimes = createConversationRuntimes(driver, store)
	const chatController = createChatController(createScriptedDriver(), store)
	const attachments = createAttachmentsController(
		createAttachmentsPort({ chat: chatController, driver, runtimes }),
	)
	const roster = createFakeRoster()
	const missions = createOpenedMissionController(roster)
	const signIn = createSignInController(createFakeOnboardingPort(), {
		reopen: async () => undefined,
	})

	const bodyProps = (selected: Conversation) => {
		roster.select(selected.id)

		return {
			attachments,
			bots: [bot],
			chat: { state: initialChatState, controller: chatController },
			conversation: selected,
			conversationRuntimes: runtimes,
			drafts: createDraftsController(),
			haveSpacesFailed: false,
			isLibraryOpen: false,
			isMissionsPanelOpen: false,
			isOverlayOpen: false,
			landings: createMessageLandingController(),
			missions,
			onOpenConversationSettings: () => undefined,
			onOpenThreadInNewTab: () => undefined,
			onRetrySpaces: () => undefined,
			onToggleSettings: () => undefined,
			readerName: "Reader",
			signIn: { state: signIn.getState(), controller: signIn },
			spaceId: SPACE,
			spaceRowId: SPACE,
		}
	}

	const workspace: Workspace = {
		bot,
		conversation,
		otherConversation,
		driver,
		runtimes,
		body: ({
			selected = conversation,
			isActivityPanelOpenAtFirst = false,
			overrides,
		}: BodyOptions = {}) =>
			createElement(WorkspaceBodyHarness, {
				...bodyProps(selected),
				...overrides,
				isActivityPanelOpenAtFirst,
			}),
		controlledBody: (activityPanel: ActivityPanel) =>
			createElement(WorkspaceBody, {
				...bodyProps(conversation),
				activityPanel,
			}),
	}

	return workspace
}

const settle = () =>
	act(async () => {
		for (let round = 0; round < 20; round += 1) {
			await Promise.resolve()
		}
		await new Promise((notified) => setTimeout(notified, 0))
	})

const openMission = async () => {
	fireEvent.click(screen.getByRole("button", { name: ACTIVITY }))
	await settle()
	const missions = screen.getByRole("region", { name: "Waiting on you" })
	fireEvent.click(
		within(missions).getByRole("button", { name: new RegExp(OBJECTIVE) }),
	)
	await settle()
}

const missionHeader = () =>
	document.querySelector('[data-slot="mission-header"]')

const missionHeaderSkeleton = () =>
	document.querySelector('[data-slot="mission-header-skeleton"]')

const framedSlot = (frame: string, slot: string) =>
	document.querySelector(`[data-slot="${frame}"] [data-slot="${slot}"]`)

const screenSlot = (slot: string) => framedSlot("screen-layout", slot)

const threadSlot = (slot: string) => framedSlot("chat-layout", slot)

const missionChanges = () => {
	const listeners = new Set<(changed: MissionChanged) => void>()

	listenToMissions.mockImplementation((listener) => {
		listeners.add(listener)
		return Promise.resolve(() => {
			listeners.delete(listener)
		})
	})

	return () =>
		act(async () => {
			for (const listener of [...listeners]) {
				listener({
					missionId: "m-1",
					spaceId: null,
					state: "working",
					stateSeq: 1,
					isAgentRunning: false,
					lastActivityAt: null,
				})
			}
		})
}

const answer = async (text: string) => {
	const composer = screen.getByRole("textbox")
	fireEvent.change(composer, { target: { value: text } })
	fireEvent.keyDown(composer, { key: "Enter" })
	await settle()
}

describe("WorkspaceBody missions", () => {
	let layout: FakeLayout

	beforeEach(async () => {
		layout = fakeLayout()
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([])
		listRuns.mockResolvedValue([])
		listSources.mockResolvedValue([])
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		layout.restore()
	})

	const seed = async (
		detail: (mission: Mission) => MissionDetail,
		store?: TranscriptStore,
	) => {
		const workspace = await workspaceOf(store)
		const mission = missionOf(workspace.bot, workspace.conversation)
		listMissions.mockResolvedValue({ open: [mission], done: [] })
		readMission.mockResolvedValue(detail(mission))
		return { workspace, mission }
	}

	it("replaces the thread with the mission opened from the activity panel", async () => {
		const { workspace } = await seed((mission) => ({
			mission,
			events: [eventOf("opened", 0)],
		}))
		render(workspace.body(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await openMission()

		expect(readMission).toHaveBeenCalledWith(null, "m-1")
		expect(missionHeader()?.textContent).toContain("OPE-42")
		expect(missionHeader()?.textContent).toContain("Blocked on you")
	})

	it("opens the mission of the activity panel in a new tab of its conversation on a middle click, keeping the thread", async () => {
		const { workspace } = await seed((mission) => ({
			mission,
			events: [eventOf("opened", 0)],
		}))
		const onOpenThreadInNewTab = vi.fn()
		render(workspace.body({ overrides: { onOpenThreadInNewTab } }), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()
		fireEvent.click(screen.getByRole("button", { name: ACTIVITY }))
		await settle()

		fireEvent(
			within(screen.getByRole("region", { name: "Waiting on you" })).getByRole(
				"button",
				{ name: new RegExp(OBJECTIVE) },
			),
			new MouseEvent("auxclick", { bubbles: true, button: 1, detail: 1 }),
		)
		await settle()

		expect(onOpenThreadInNewTab).toHaveBeenCalledWith({
			conversation: workspace.conversation.id,
			mission: "m-1",
		})
		expect(readMission).not.toHaveBeenCalled()
		expect(missionHeader()).toBeNull()
	})

	it("sends what the composer holds to the owning companion", async () => {
		const { workspace } = await seed((mission) => ({ mission, events: [] }))
		render(workspace.body(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await openMission()
		await answer("Take the second option.")

		expect(workspace.driver.submissions).toHaveLength(1)
		expect(workspace.driver.submissions[0].scope.botId).toBe(workspace.bot.id)
		expect(workspace.driver.submissions[0].prompt).toContain(
			"Take the second option.",
		)
	})

	it("shows an event recorded after the mission was opened", async () => {
		const announce = missionChanges()
		const { workspace, mission } = await seed((opened) => ({
			mission: opened,
			events: [],
		}))
		render(workspace.body(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await openMission()
		readMission.mockResolvedValue({
			mission,
			events: [eventOf("note", A_MINUTE, { line: "Two files touched." })],
		})
		await announce()
		await settle()

		expect(screen.getByText("Two files touched.")).toBeTruthy()
	})

	it("keeps the thread on screen when a later read of the mission fails", async () => {
		const announce = missionChanges()
		const { workspace } = await seed((mission) => ({
			mission,
			events: [eventOf("opened", 0)],
		}))
		render(workspace.body(), { wrapper: createQueryTestWrapper().wrapper })
		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await openMission()
		readMission.mockRejectedValue(new Error("refused"))
		await announce()
		await settle()

		await screen.findAllByText(READ_FAILURE_TITLE)
		expect(missionHeader()).toBeTruthy()
		expect(screen.getByText(/Mission opened by/)).toBeTruthy()
	})

	it("returns to the conversation the mission was opened from", async () => {
		const { workspace } = await seed((mission) => ({ mission, events: [] }))
		render(workspace.body(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await openMission()
		expect(missionHeader()).toBeTruthy()

		fireEvent.click(screen.getByRole("button", { name: BACK }))
		await settle()

		expect(missionHeader()).toBeNull()
		expect(screen.getAllByText("Walls").length).toBeGreaterThan(0)
	})

	it("shows the thread of the origin row when it is selected again", async () => {
		const { workspace } = await seed((mission) => ({ mission, events: [] }))
		const view = render(workspace.body(), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await openMission()
		expect(missionHeader()).toBeTruthy()

		view.rerender(workspace.body({ selected: workspace.otherConversation }))
		await settle()
		expect(missionHeader()).toBeNull()

		view.rerender(workspace.body())
		await settle()

		expect(missionHeader()).toBeNull()
		expect(screen.getAllByText("Walls").length).toBeGreaterThan(0)
	})

	it("frames the loading mission under the mission header skeleton", async () => {
		const { workspace } = await seed((mission) => ({ mission, events: [] }))
		readMission.mockReturnValue(new Promise(() => undefined))
		render(workspace.body(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await openMission()

		expect(threadSlot("mission-header-skeleton")).not.toBeNull()
		expect(
			document.querySelectorAll(
				'[data-slot="chat-layout"] [data-slot="app-header"]',
			),
		).toHaveLength(1)
		expect(
			document.querySelector('[data-slot="skeleton-agent-bubble"]'),
		).toBeNull()
		await waitFor(() =>
			expect(
				threadSlot("thread-skeleton")?.querySelector(
					'[data-slot="skeleton-agent-bubble"]',
				),
			).not.toBeNull(),
		)
		expect(missionHeader()).toBeNull()
	})

	it("returns to the origin conversation from Back while the mission loads", async () => {
		const { workspace } = await seed((mission) => ({ mission, events: [] }))
		readMission.mockReturnValue(new Promise(() => undefined))
		render(workspace.body(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await openMission()
		fireEvent.click(screen.getByRole("button", { name: BACK }))
		await settle()

		expect(missionHeaderSkeleton()).toBeNull()
		expect(screen.getAllByText("Walls").length).toBeGreaterThan(0)
	})

	it("replaces the mission header skeleton once the mission arrives", async () => {
		const { workspace, mission } = await seed((opened) => ({
			mission: opened,
			events: [],
		}))
		let deliver: (detail: MissionDetail) => void = () => undefined
		readMission.mockReturnValue(
			new Promise((delivered) => {
				deliver = delivered
			}),
		)
		render(workspace.body(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await openMission()
		expect(missionHeaderSkeleton()).not.toBeNull()

		await act(async () => deliver({ mission, events: [] }))
		await settle()

		expect(missionHeader()?.textContent).toContain("OPE-42")
		expect(missionHeaderSkeleton()).toBeNull()
	})

	it("reads the mission again when the read failure is retried", async () => {
		const { workspace, mission } = await seed((opened) => ({
			mission: opened,
			events: [],
		}))
		readMission.mockRejectedValue(new Error("refused"))
		render(workspace.body(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await openMission()
		expect(screen.getByText(READ_FAILURE_TITLE)).toBeTruthy()

		readMission.mockResolvedValue({ mission, events: [eventOf("opened", 0)] })
		fireEvent.click(screen.getByRole("button", { name: "Retry" }))
		await settle()

		expect(missionHeader()?.textContent).toContain("OPE-42")
	})

	it("raises a failure notice when the answer cannot reach the companion", async () => {
		const store = createFakeTranscriptStore()
		const refusing: TranscriptStore = {
			...store,
			sendUserMessage: () => Promise.reject(new Error("refused")),
		}
		const { workspace } = await seed(
			(mission) => ({ mission, events: [] }),
			refusing,
		)
		render(workspace.body(), { wrapper: createQueryTestWrapper().wrapper })
		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await openMission()
		await answer("Take the second option.")

		await screen.findAllByText(SEND_FAILURE_TITLE)
		expect(missionHeader()).toBeTruthy()
	})
})

describe("WorkspaceBody frame", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([])
		listRuns.mockResolvedValue([])
		listSources.mockResolvedValue([])
		listenToMissions.mockResolvedValue(() => undefined)
		listMissions.mockResolvedValue({ open: [], done: [] })
	})

	afterEach(cleanup)

	it("frames an empty column under the app header when no thread is shown", async () => {
		const workspace = await workspaceOf()
		render(workspace.body({ overrides: { isMissionsPanelOpen: true } }))
		await settle()

		expect(screenSlot("app-header")).not.toBeNull()
		expect(screenSlot("screen-layout-column")?.childElementCount).toBe(0)
	})

	it("frames the spaces failure under the app header and retries once", async () => {
		const workspace = await workspaceOf()
		const onRetrySpaces = vi.fn()
		render(
			workspace.body({ overrides: { haveSpacesFailed: true, onRetrySpaces } }),
		)
		await settle()

		expect(screenSlot("app-header")).not.toBeNull()
		expect(screenSlot("screen-layout-column")?.textContent).toContain(
			"Couldn’t load your spaces",
		)

		fireEvent.click(screen.getByRole("button", { name: "Retry" }))

		expect(onRetrySpaces).toHaveBeenCalledTimes(1)
	})
})

describe("WorkspaceBody activity panel", () => {
	let layout: FakeLayout

	beforeEach(() => {
		layout = fakeLayout()
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([])
		listRuns.mockResolvedValue([])
		listSources.mockResolvedValue([])
		listMissions.mockResolvedValue({ open: [], done: [] })
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		layout.restore()
	})

	const activityToggle = () => screen.getByRole("button", { name: ACTIVITY })

	const isPanelOpen = () =>
		screen.queryByRole("button", { name: CLOSE_ACTIVITY }) !== null

	const isPanelClosed = () =>
		screen.queryByRole("button", { name: ACTIVITY }) !== null

	it("opens the first thread with the panel already open", async () => {
		const workspace = await workspaceOf()
		render(workspace.body({ isActivityPanelOpenAtFirst: true }), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(isPanelOpen()).toBe(true)
	})

	it("renders the panel closed when the preference is not set", async () => {
		const workspace = await workspaceOf()
		render(workspace.body(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(isPanelClosed()).toBe(true)
	})

	it("holds the panel open when the reader moves to another conversation", async () => {
		const workspace = await workspaceOf()
		const view = render(workspace.body(), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		fireEvent.click(activityToggle())
		await settle()
		expect(isPanelOpen()).toBe(true)

		view.rerender(workspace.body({ selected: workspace.otherConversation }))
		await settle()

		expect(isPanelOpen()).toBe(true)
	})

	it("asks for the new value and shows only the state it is given", async () => {
		const workspace = await workspaceOf()
		const onOpenChange = vi.fn()
		render(
			workspace.controlledBody({
				isOpen: false,
				onOpenChange,
				openedRoutine: createOpenedRoutineController(),
			}),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		fireEvent.click(activityToggle())
		await settle()

		expect(onOpenChange).toHaveBeenCalledWith(true)
		expect(isPanelClosed()).toBe(true)
	})
})

describe("WorkspaceBody mission menu", () => {
	const MENU = "Mission actions"
	const SUMMARY = "Shipped behind the flag"
	const PULL_REQUEST = "https://github.com/acme/app/pull/12"
	const OPEN_ENTRY = /^Open mission/
	const CLOSE_ENTRY = /^Close/

	let layout: FakeLayout

	beforeEach(() => {
		layout = fakeLayout()
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([])
		listRuns.mockResolvedValue([])
		listSources.mockResolvedValue([])
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		layout.restore()
		vi.restoreAllMocks()
	})

	const seed = async (over: Partial<Mission> = {}) => {
		const workspace = await workspaceOf()
		const mission: Mission = {
			...missionOf(workspace.bot, workspace.conversation),
			...over,
		}
		const isClosed = mission.closedAt !== null
		listMissions.mockResolvedValue(
			isClosed ? { open: [], done: [mission] } : { open: [mission], done: [] },
		)
		readMission.mockResolvedValue({ mission, events: [] })
		render(workspace.body({ isActivityPanelOpenAtFirst: true }), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()
		return { workspace, mission }
	}

	const panelGroup = (group: string) =>
		screen.queryByRole("region", { name: new RegExp(`^${group}`) })

	const panelCardIn = (group: string) => {
		const region = panelGroup(group)
		if (!region) throw new Error(`no ${group} group in the Activity panel`)
		const row = region.querySelector<HTMLElement>(
			'[data-slot="mission-card-row"]',
		)
		if (!row) throw new Error(`no mission card in ${group}`)
		return row
	}

	const transcriptCard = () =>
		screen.getByRole("article", { name: "mission opened" })

	const menuEntries = () =>
		within(screen.getByRole("menu", { name: MENU }))
			.getAllByRole("menuitem")
			.map((item) => item.textContent)

	const openMenuOf = async (card: HTMLElement) => {
		fireEvent.contextMenu(within(card).getByText(OBJECTIVE))
		await settle()
	}

	const choose = async (card: HTMLElement, entry: string | RegExp) => {
		await openMenuOf(card)
		fireEvent.click(screen.getByRole("menuitem", { name: entry }))
		await settle()
	}

	const chooseIn = async (
		card: HTMLElement,
		submenu: string | RegExp,
		entry: string,
	) => {
		await openMenuOf(card)
		fireEvent.click(screen.getByRole("menuitem", { name: submenu }))
		await settle()
		fireEvent.click(screen.getByRole("menuitem", { name: entry }))
		await settle()
	}

	const noticeTitled = (title: string) => screen.findAllByText(title)

	it("wraps the Activity panel card and the transcript card in the same menu, with no shortcut hint", async () => {
		await seed()

		for (const card of [panelCardIn("Waiting on you"), transcriptCard()]) {
			await openMenuOf(card)
			expect(menuEntries()).toEqual([
				"Open mission",
				"Copy",
				"Answer the question",
				"Close",
			])
			fireEvent.keyDown(document.activeElement ?? document.body, {
				key: "Escape",
			})
			await settle()
		}
	})

	it("opens the mission thread from Open mission", async () => {
		await seed()

		await choose(panelCardIn("Waiting on you"), OPEN_ENTRY)

		expect(readMission).toHaveBeenCalledWith(null, "m-1")
		expect(missionHeader()?.textContent).toContain("OPE-42")
	})

	it("opens the pull request in the browser", async () => {
		const opened = vi.spyOn(window, "open").mockReturnValue(null)
		await seed({ pullRequestUrl: PULL_REQUEST })

		await choose(transcriptCard(), "Open PR")

		expect(opened.mock.calls.map(([url]) => url)).toEqual([PULL_REQUEST])
	})

	it("copies each value of the mission and names what was copied", async () => {
		const written = vi
			.spyOn(navigator.clipboard, "writeText")
			.mockResolvedValue(undefined)
		await seed({
			branch: "feature/ope-42",
			pullRequestUrl: PULL_REQUEST,
			workspacePath: "/work/ope-42",
		})

		for (const kind of ["Issue ID", "Branch", "PR URL", "Workspace path"]) {
			await chooseIn(panelCardIn("Waiting on you"), "Copy", kind)
			await noticeTitled(`${kind} copied`)
		}

		expect(written.mock.calls.map(([text]) => text)).toEqual([
			"OPE-42",
			"feature/ope-42",
			PULL_REQUEST,
			"/work/ope-42",
		])
	})

	it("raises a failure notice when the clipboard refuses the copy", async () => {
		vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
			new Error("denied"),
		)
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		await seed()

		await chooseIn(transcriptCard(), "Copy", "Issue ID")

		await noticeTitled("Couldn’t copy to the clipboard")
	})

	const MENU_EXIT_MS = 30

	const holdMenuExit = () => {
		const exiting = {
			finished: new Promise((resolve) => setTimeout(resolve, MENU_EXIT_MS)),
		} as unknown as Animation
		screen.getByRole("menu").getAnimations = () => [exiting]
	}

	const chooseAsTheMenuExits = async (card: HTMLElement, entry: string) => {
		within(card).getAllByRole("button")[0].focus()
		await openMenuOf(card)
		holdMenuExit()
		fireEvent.click(screen.getByRole("menuitem", { name: entry }))
		await settle()
	}

	const menuClosed = async () => {
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
		await act(
			() => new Promise((resolve) => setTimeout(resolve, 2 * MENU_EXIT_MS)),
		)
	}

	it.each([
		{
			entry: "Message the coding session",
			state: "working",
			place: "Activity panel",
		},
		{ entry: "Message the coding session", state: "working", place: "thread" },
		{
			entry: "Answer the question",
			state: "waiting_human",
			place: "Activity panel",
		},
		{ entry: "Answer the question", state: "waiting_human", place: "thread" },
	] as const)(
		"leaves focus in the mission composer after $entry from the $place card",
		async ({ entry, state, place }) => {
			await seed({ state })
			const card =
				place === "thread"
					? transcriptCard()
					: panelCardIn(state === "working" ? "In progress" : "Waiting on you")

			await chooseAsTheMenuExits(card, entry)
			await menuClosed()

			expect(missionHeader()).toBeTruthy()
			expect(document.activeElement).toBe(screen.getByRole("textbox"))
		},
	)

	it("cancels the running turn of the mission thread from Stop the coding session", async () => {
		const { workspace } = await seed({ state: "working" })
		const thread = workspace.runtimes.runtimeFor(THREAD_CONVERSATION)
		const stopped = vi.spyOn(thread, "stop").mockResolvedValue(undefined)

		await choose(panelCardIn("In progress"), "Stop the coding session")

		expect(stopped).toHaveBeenCalledTimes(1)
	})

	it.each(["Activity panel", "thread"] as const)(
		"closes the mission at once from the %s card into the closed group with the closed pill",
		async (place) => {
			const { mission } = await seed()
			const closed: Mission = {
				...mission,
				state: "closed",
				closedAt: Date.now(),
			}
			closeMission.mockImplementation(async () => {
				listMissions.mockResolvedValue({ open: [], done: [closed] })
				return closed
			})

			await choose(
				place === "thread" ? transcriptCard() : panelCardIn("Waiting on you"),
				CLOSE_ENTRY,
			)

			expect(closeMission.mock.calls).toEqual([["m-1"]])
			expect(panelGroup("Waiting on you")).toBeNull()
			const panelCard = panelCardIn("Earlier today")
			for (const card of [panelCard, transcriptCard()]) {
				expect(within(card).getByText("Closed")).toBeTruthy()
				expect(within(card).queryByText("Completed")).toBeNull()
				expect(within(card).queryByText("Blocked")).toBeNull()
			}
		},
	)

	it("offers Reopen on a mission the person closed", async () => {
		await seed({ state: "closed", closedAt: Date.now() })

		await choose(transcriptCard(), "Reopen")

		expect(reopenMission).toHaveBeenCalledWith("m-1")
	})

	it("reopens the mission and moves it back to the open groups", async () => {
		const { mission } = await seed({ state: "done", closedAt: Date.now() })
		const reopened: Mission = { ...mission, state: "working", closedAt: null }
		reopenMission.mockImplementation(async () => {
			listMissions.mockResolvedValue({ open: [reopened], done: [] })
			return reopened
		})

		await choose(transcriptCard(), "Reopen")

		expect(reopenMission).toHaveBeenCalledWith("m-1")
		expect(panelGroup("Earlier today")).toBeNull()
		expect(panelCardIn("In progress")).toBeTruthy()
		expect(within(transcriptCard()).queryByText("Completed")).toBeNull()
	})

	it("shows the close and the reopen of the person as by you in the mission thread", async () => {
		const { mission } = await seed()
		readMission.mockResolvedValue({
			mission,
			events: [
				{ ...eventOf("dismissed", A_MINUTE), source: "person" },
				{ ...eventOf("reopened", 2 * A_MINUTE), source: "person" },
			],
		})

		await choose(panelCardIn("Waiting on you"), OPEN_ENTRY)

		expect(screen.getByText("Closed by you")).toBeTruthy()
		expect(screen.getByText("Mission reopened by You")).toBeTruthy()
	})

	it("keeps the close of the companion on its own line", async () => {
		const { mission } = await seed()
		readMission.mockResolvedValue({
			mission,
			events: [eventOf("closed", A_MINUTE, { summary: SUMMARY })],
		})

		await choose(panelCardIn("Waiting on you"), OPEN_ENTRY)

		const closeLine = screen
			.getByText(SUMMARY)
			.closest('[data-slot="mission-authored-event"]')
		expect(closeLine?.textContent).toMatch(/^NyxClosed/)
		expect(screen.queryByText("Closed by you")).toBeNull()
	})

	it("raises a failure notice naming the close or the reopen that was refused", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		closeMission.mockRejectedValue(new Error("refused"))
		await seed()

		await choose(transcriptCard(), CLOSE_ENTRY)

		await noticeTitled("Couldn’t close the mission")
		expect(panelCardIn("Waiting on you")).toBeTruthy()
	})

	it("raises a failure notice when the reopen is refused", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		reopenMission.mockRejectedValue(new Error("refused"))
		await seed({ state: "done", closedAt: Date.now() })

		await choose(transcriptCard(), "Reopen")

		await noticeTitled("Couldn’t reopen the mission")
	})

	it("leaves the mission open on Cmd+Backspace from a focused card", async () => {
		await seed()
		const open = within(transcriptCard()).getByRole("button", {
			name: `Open the mission: ${OBJECTIVE}`,
		})
		open.focus()

		fireEvent.keyDown(open, { key: "Backspace", metaKey: true })
		await settle()

		expect(closeMission).not.toHaveBeenCalled()
	})
})

describe("WorkspaceBody library", () => {
	const save = vi.mocked(commands.librarySave)
	const copyToClipboard = vi.mocked(commands.libraryCopy)
	const reveal = vi.mocked(commands.libraryReveal)
	const OTHER_SPACE = "studio"
	const JOINED_ROW = joinedRowIdOf("garage")
	const HOST_SPACE = "garage-space"
	const EXCERPT = "What we ship in April."

	const itemOf = (
		kind: LibraryItem["kind"],
		name: string,
		minutesAgo: number,
		bytes: number,
	): LibraryItem => ({
		name,
		kind,
		path: `/library/${name}`,
		bytes,
		modifiedAt: Date.now() - minutesAgo * A_MINUTE,
		createdAt: null,
	})

	const HERO = itemOf("image", "hero-dunes.png", 8, 253_952)
	const BRIEF = itemOf("document", "Spring launch brief.md", 21, 4_096)
	const FERN = itemOf("image", "fern-study.jpg", 30, 884_736)
	const DUSK = itemOf("image", "dusk.png", 40, 2_048)
	const NOTES = itemOf("document", "notes.txt", 50, 512)

	const refusal = { kind: "unreadable" as const, detail: "denied" }

	const answered = <Data>(data: Data) => ({ status: "ok" as const, data })

	const failed = (detail: string) => ({
		status: "error" as const,
		error: { kind: "unwritable" as const, detail },
	})

	type NamedRead = { spaceId: string; name: string }

	const documentOf = (name: string): LibraryDocument => ({
		name,
		format: "markdown",
		content: `# Spring launch\n\n${EXCERPT}`,
	})

	const readDocumentOf = async ({ name }: NamedRead) =>
		name === NOTES.name ? Promise.reject(refusal) : documentOf(name)

	const imageOf = ({ name }: NamedRead) => ({
		name,
		mimeType: "image/png",
		content: btoa(name),
	})

	beforeEach(() => {
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([])
		listRuns.mockResolvedValue([])
		listSources.mockResolvedValue([])
		listenToMissions.mockResolvedValue(() => undefined)
		listMissions.mockResolvedValue({ open: [], done: [] })
		libraryHost.list.mockResolvedValue([HERO, BRIEF, FERN, DUSK, NOTES])
		libraryHost.readDocument.mockImplementation(readDocumentOf)
		libraryHost.readImage.mockImplementation(async (read: NamedRead) =>
			imageOf(read),
		)
		save.mockResolvedValue(answered("/Users/reader/Downloads/hero-dunes.png"))
		copyToClipboard.mockResolvedValue(answered(null))
		reveal.mockResolvedValue(answered(null))
	})

	afterEach(() => {
		cleanup()
		vi.restoreAllMocks()
	})

	type LibraryPlace = { spaceId?: string; spaceRowId?: string }

	const libraryScreen = ({
		spaceId = SPACE,
		spaceRowId = SPACE,
	}: LibraryPlace = {}) =>
		createElement(LibraryScreen, {
			isJoined: isJoinedRowId(spaceRowId),
			key: spaceRowId,
			spaceId,
		})

	const openLibrary = async (place: LibraryPlace = {}) => {
		const view = render(libraryScreen(place))
		render(createElement(NoticeSurface))
		await settle()
		return { view }
	}

	const openJoinedLibrary = () =>
		openLibrary({ spaceId: HOST_SPACE, spaceRowId: JOINED_ROW })

	const shownNames = () =>
		[...document.querySelectorAll('[data-slot="library-item"] [title]')]
			.map((name) => name.getAttribute("title"))
			.sort()

	const itemNamed = (name: string) => {
		const item = screen.getByTitle(name).closest("button")
		if (!item) throw new Error(`no Library item named ${name}`)
		return item
	}

	const isBusy = () =>
		document.querySelector('[data-slot="library-panel"] [aria-busy="true"]') !==
		null

	const search = async (query: string) => {
		fireEvent.change(screen.getByRole("searchbox"), {
			target: { value: query },
		})
		await settle()
	}

	const open = async (name: string) => {
		fireEvent.click(itemNamed(name))
		await settle()
	}

	const press = async (name: string) => {
		fireEvent.click(screen.getByRole("button", { name }))
		await settle()
	}

	const noticeTitled = (title: string) => screen.findAllByText(title)

	it("lists the Library of the Space once it has loaded", async () => {
		render(libraryScreen())

		expect(isBusy()).toBe(true)

		await settle()

		expect(libraryHost.list).toHaveBeenCalledWith({ spaceId: SPACE })
		expect(isBusy()).toBe(false)
		expect(shownNames()).toEqual(
			[
				"hero-dunes.png",
				"Spring launch brief",
				"fern-study.jpg",
				"dusk.png",
				"notes",
			].sort(),
		)
	})

	it("shows an empty Library with no action to take", async () => {
		libraryHost.list.mockResolvedValue([])
		await openLibrary()

		const panel = document.querySelector<HTMLElement>(
			'[data-slot="library-panel"]',
		)
		if (!panel) throw new Error("no Library panel")
		expect(within(panel).getByRole("heading", { level: 1 }).textContent).toBe(
			"Library",
		)
		expect(within(panel).queryAllByRole("button")).toHaveLength(0)
		expect(within(panel).queryByRole("radiogroup")).toBeNull()
		expect(within(panel).queryByRole("searchbox")).toBeNull()
	})

	it("draws an image from its file and a document from its excerpt, an unreadable one left blank", async () => {
		await openLibrary()

		expect(itemNamed("hero-dunes.png").querySelector("img")?.src).toBe(
			"asset://localhost/library/hero-dunes.png",
		)
		expect(libraryHost.readImage).not.toHaveBeenCalled()
		await waitFor(() =>
			expect(
				itemNamed("Spring launch brief").querySelector(
					'[data-slot="library-page"]',
				)?.textContent,
			).toContain(EXCERPT),
		)
		expect(
			itemNamed("notes").querySelector('[data-slot="library-page"]')
				?.textContent,
		).toBe("")
	})

	it("details each item by format, size and time since it changed", async () => {
		await openLibrary()

		expect(itemNamed("hero-dunes.png").textContent).toContain(
			"PNG · 248 KB · 8 minutes ago",
		)
		expect(itemNamed("Spring launch brief").textContent).toContain(
			"MD · 4 KB · 21 minutes ago",
		)
		expect(itemNamed("fern-study.jpg").textContent).toContain(
			"JPG · 864 KB · 30 minutes ago",
		)
	})

	it("shows only the items matching the filter and the query", async () => {
		await openLibrary()

		await search("DUN")
		expect(shownNames()).toEqual(["hero-dunes.png"])

		await search("")
		fireEvent.click(screen.getByRole("radio", { name: /^Images/ }))
		await settle()

		expect(shownNames()).toEqual(
			["hero-dunes.png", "fern-study.jpg", "dusk.png"].sort(),
		)
		expect(screen.getByRole("radio", { name: /^Images/ }).textContent).toBe(
			"Images3",
		)
		expect(screen.getByRole("radio", { name: /^Documents/ }).textContent).toBe(
			"Documents2",
		)
	})

	it("lists the folder again when the window regains focus or the panel opens again", async () => {
		libraryHost.list.mockResolvedValueOnce([HERO])
		const { view } = await openLibrary()
		expect(shownNames()).toEqual(["hero-dunes.png"])

		fireEvent(window, new Event("focus"))
		await settle()

		expect(shownNames()).toContain("dusk.png")

		view.rerender(createElement(Fragment))
		view.rerender(libraryScreen())
		await settle()

		expect(libraryHost.list).toHaveBeenCalledTimes(3)
	})

	it("never shows the items of the previous Space once the Space changes", async () => {
		const { view } = await openLibrary()
		libraryHost.list.mockReturnValue(new Promise(() => undefined))

		view.rerender(
			libraryScreen({ spaceId: OTHER_SPACE, spaceRowId: OTHER_SPACE }),
		)

		expect(shownNames()).toEqual([])
		expect(isBusy()).toBe(true)
		expect(libraryHost.list).toHaveBeenLastCalledWith({ spaceId: OTHER_SPACE })
	})

	it("steps through the images of the filtered order in the lightbox", async () => {
		await openLibrary()
		await search(".png")

		await open("hero-dunes.png")
		expect(screen.getByRole("dialog", { name: "hero-dunes.png" })).toBeTruthy()
		expect(screen.getByText("1 of 2")).toBeTruthy()

		await press("Next image")

		expect(screen.getByRole("dialog", { name: "dusk.png" })).toBeTruthy()
		expect(
			screen
				.getByRole("button", { name: "Next image" })
				.hasAttribute("disabled"),
		).toBe(true)

		await press("Previous image")

		expect(screen.getByRole("dialog", { name: "hero-dunes.png" })).toBeTruthy()
	})

	it("reads an opened document and returns to the grid with its filter and query kept", async () => {
		await openLibrary()
		await search("brief")
		fireEvent.click(screen.getByRole("radio", { name: /^Documents/ }))
		await settle()

		await open("Spring launch brief")

		expect(libraryHost.readDocument).toHaveBeenCalledWith({
			spaceId: SPACE,
			name: BRIEF.name,
		})
		expect(
			screen.getByRole("heading", { level: 1, name: "Spring launch brief" }),
		).toBeTruthy()
		expect(screen.getByText(EXCERPT)).toBeTruthy()
		expect(screen.queryByRole("searchbox")).toBeNull()

		await press("Library")

		expect(screen.getByRole("searchbox")).toHaveProperty("value", "brief")
		expect(
			screen
				.getByRole("radio", { name: /^Documents/ })
				.getAttribute("aria-checked"),
		).toBe("true")
		expect(shownNames()).toEqual(["Spring launch brief"])
	})

	it("raises what failed when the Library cannot be listed and leaves the loading state", async () => {
		libraryHost.list.mockRejectedValue(refusal)
		await openLibrary()

		await noticeTitled("Couldn’t open the Library")
		expect(isBusy()).toBe(false)
	})

	it("raises what failed when a document cannot be read and keeps the grid", async () => {
		await openLibrary()

		await open("notes")

		await noticeTitled("Couldn’t open this file. Retry.")
		expect(shownNames()).toContain("notes")
	})

	const SAVE_FAILURE = "Couldn’t save the file"
	const COPY_FAILURE = "Couldn’t copy the image"
	const REVEAL_FAILURE = "Couldn’t show the file in its folder"

	it("saves the opened image, and raises no notice when the person cancels", async () => {
		save.mockResolvedValue(answered(null))
		await openLibrary()
		await open("hero-dunes.png")

		await press("Download")

		expect(save).toHaveBeenCalledExactlyOnceWith(SPACE, HERO.name)
		expect(screen.queryByText(SAVE_FAILURE)).toBeNull()
	})

	it("raises the save failure notice when the file cannot be saved", async () => {
		save.mockResolvedValue(failed("read-only volume"))
		await openLibrary()
		await open("hero-dunes.png")

		await press("Download")

		await noticeTitled(SAVE_FAILURE)
	})

	it("copies the opened image through this computer's clipboard, with no notice", async () => {
		await openLibrary()
		await open("fern-study.jpg")

		await press("Copy")
		await press("Next image")
		await press("Copy")

		expect(copyToClipboard.mock.calls).toEqual([
			[SPACE, FERN.name],
			[SPACE, DUSK.name],
		])
		expect(screen.queryByText(COPY_FAILURE)).toBeNull()
	})

	it("raises the copy failure notice when the clipboard refuses the image", async () => {
		copyToClipboard.mockResolvedValue({
			status: "error",
			error: { kind: "clipboardRefused", detail: "denied" },
		})
		await openLibrary()
		await open("hero-dunes.png")

		await press("Copy")

		await noticeTitled(COPY_FAILURE)
	})

	it("reveals the opened image and the opened document in their folder", async () => {
		await openLibrary()
		await open("hero-dunes.png")
		await press("More")
		await press("Close")

		await open("Spring launch brief")
		await press("More")

		expect(reveal.mock.calls).toEqual([
			[SPACE, HERO.name],
			[SPACE, BRIEF.name],
		])
		expect(screen.queryByText(REVEAL_FAILURE)).toBeNull()
	})

	it("raises the reveal failure notice when the file cannot be shown", async () => {
		reveal.mockResolvedValue({
			status: "error",
			error: { kind: "unrevealed", detail: "no file manager" },
		})
		await openLibrary()
		await open("hero-dunes.png")

		await press("More")

		await noticeTitled(REVEAL_FAILURE)
	})

	describe("in a joined Space", () => {
		it("lists and reads the Library of the host Space", async () => {
			await openJoinedLibrary()

			expect(libraryHost.list).toHaveBeenCalledWith({ spaceId: HOST_SPACE })

			await open("Spring launch brief")

			expect(libraryHost.readDocument).toHaveBeenCalledWith({
				spaceId: HOST_SPACE,
				name: BRIEF.name,
			})
		})

		it("draws each image from the bytes the host answers, not from a file path", async () => {
			await openJoinedLibrary()

			expect(libraryHost.readImage).toHaveBeenCalledWith({
				spaceId: HOST_SPACE,
				name: HERO.name,
			})
			await waitFor(() =>
				expect(itemNamed("hero-dunes.png").querySelector("img")?.src).toBe(
					`data:image/png;base64,${btoa(HERO.name)}`,
				),
			)
		})

		const IMAGE_FAILURE = "Couldn’t show an image of the Library"

		const announcedImageFailures = async () => {
			await noticeTitled(IMAGE_FAILURE)
			await settle()
			return screen
				.getAllByText(IMAGE_FAILURE)
				.filter((title) => !title.closest('[aria-hidden="true"]'))
		}

		it("raises one notice when several images cannot be read from the host", async () => {
			libraryHost.readImage.mockRejectedValue(refusal)
			await openJoinedLibrary()

			expect(libraryHost.readImage).toHaveBeenCalledTimes(3)
			expect(await announcedImageFailures()).toHaveLength(1)
			expect(shownNames()).toContain("hero-dunes.png")
		})

		it("shows an image read after an earlier failure, with no new notice", async () => {
			const changedHero = { ...HERO, modifiedAt: HERO.modifiedAt + A_MINUTE }
			libraryHost.list.mockResolvedValueOnce([HERO])
			libraryHost.list.mockResolvedValue([changedHero])
			libraryHost.readImage.mockRejectedValueOnce(refusal)
			await openJoinedLibrary()
			expect(await announcedImageFailures()).toHaveLength(1)

			fireEvent(window, new Event("focus"))
			await settle()

			await waitFor(() =>
				expect(itemNamed("hero-dunes.png").querySelector("img")?.src).toBe(
					`data:image/png;base64,${btoa(HERO.name)}`,
				),
			)
			expect(await announcedImageFailures()).toHaveLength(1)
		})

		it("leaves Download, Copy and More inactive, with no notice", async () => {
			await openJoinedLibrary()
			await open("hero-dunes.png")
			await press("Download")
			await press("Copy")
			await press("More")
			await press("Close")

			await open("Spring launch brief")
			await press("More")

			expect(save).not.toHaveBeenCalled()
			expect(copyToClipboard).not.toHaveBeenCalled()
			expect(reveal).not.toHaveBeenCalled()
			for (const failure of [SAVE_FAILURE, COPY_FAILURE, REVEAL_FAILURE]) {
				expect(screen.queryByText(failure)).toBeNull()
			}
		})
	})
})
