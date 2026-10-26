// @vitest-environment happy-dom

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
	type ReactElement,
	useState,
} from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import "@workspace/ui/lib/i18n"

import type { ActivityPanel } from "@/components/thread-routines"
import { WorkspaceBody } from "@/components/workspace-body"
import type { Json } from "@/lib/bindings"
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
vi.mock("@/lib/routines/trigger-sources-transport", () => ({
	triggerSourcesTransport: { sourcesOfSpace: vi.fn() },
}))
vi.mock("@/lib/missions/missions-transport", () => ({
	missionsTransport: {
		list: vi.fn(),
		detail: vi.fn(),
		close: vi.fn(),
		reopen: vi.fn(),
		onChanged: vi.fn(),
	},
}))

const listRoutines = vi.mocked(routinesTransport.list)
const listRuns = vi.mocked(routinesTransport.runsOfSpace)
const listSources = vi.mocked(triggerSourcesTransport.sourcesOfSpace)
const listMissions = vi.mocked(missionsTransport.list)
const readMission = vi.mocked(missionsTransport.detail)
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
			isConversationSettingsOpen: false,
			isMissionsPanelOpen: false,
			isOverlayOpen: false,
			landings: createMessageLandingController(),
			missions,
			onOpenConversationSettings: () => undefined,
			onRetrySpaces: () => undefined,
			onToggleSettings: () => undefined,
			readerName: "Reader",
			signIn: { state: signIn.getState(), controller: signIn },
			spaceId: SPACE,
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
		}: BodyOptions = {}) =>
			createElement(WorkspaceBodyHarness, {
				...bodyProps(selected),
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

		expect(readMission).toHaveBeenCalledWith("m-1")
		expect(missionHeader()?.textContent).toContain("OPE-42")
		expect(missionHeader()?.textContent).toContain("Blocked on you")
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

		expect(readMission).toHaveBeenCalledWith("m-1")
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
		{ entry: "Message the agent", state: "working", place: "Activity panel" },
		{ entry: "Message the agent", state: "working", place: "thread" },
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

	it("cancels the running turn of the mission thread from Stop the agent", async () => {
		const { workspace } = await seed({ state: "working" })
		const thread = workspace.runtimes.runtimeFor(THREAD_CONVERSATION)
		const stopped = vi.spyOn(thread, "stop").mockResolvedValue(undefined)

		await choose(panelCardIn("In progress"), "Stop the agent")

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
