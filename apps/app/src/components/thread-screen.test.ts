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
	createElement,
	Fragment,
	type ReactElement,
	type ReactNode,
	useState,
	useSyncExternalStore,
} from "react"
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	type Mock,
	vi,
} from "vitest"

import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { CompanionMenuProvider } from "@workspace/ui/components/companion-menu"
import { CompanionSelectProvider } from "@workspace/ui/components/companion-select"
import {
	type ConversationIconName,
	ConversationIcons,
} from "@workspace/ui/components/icons"
import type { MissionEventModel } from "@workspace/ui/components/mission"
import {
	type NoticeMessage,
	NoticeSurface,
} from "@workspace/ui/components/notice-surface"
import "@workspace/ui/lib/i18n"

import { ThreadScreen } from "@/components/thread-screen"
import type {
	AccountReport,
	AgentEvent,
	CheckReport,
} from "@/lib/agent/contract"
import type {
	Application,
	ApplicationInstall,
} from "@/lib/applications/application-port"
import {
	createFakeApplicationPort,
	type FakeApplicationPort,
} from "@/lib/applications/fake-application-port"
import { ConversationApplicationsContext } from "@/lib/applications/use-conversation-installs"
import { SessionApplicationsContext } from "@/lib/applications/use-session-application"
import {
	type AttachmentsController,
	createAttachmentsController,
} from "@/lib/chat/attachments-controller"
import { createAttachmentsPort } from "@/lib/chat/attachments-port"
import {
	type ChatController,
	createChatController,
} from "@/lib/chat/chat-controller"
import {
	type ChatError,
	chatReducer,
	initialChatState,
} from "@/lib/chat/chat-state"
import { createDraftsController } from "@/lib/chat/drafts-controller"
import {
	type ThreadAuthorship,
	ThreadAuthorshipContext,
} from "@/lib/chat/thread-authorship"
import type {
	BotThread,
	ConversationThread,
	Thread,
} from "@/lib/chat/thread-contract"
import { createConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import { holdFirstPages } from "@/lib/conversations/fake-transcript-port"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import {
	createScriptedDriver,
	type ScriptedDriver,
} from "@/lib/conversations/scripted-driver"
import type {
	Bot,
	Conversation,
	Space,
} from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import type {
	CompanionArrival,
	TerminalCompletion,
	TranscriptRole,
} from "@/lib/conversations/transcript-contract"
import {
	botIdentity,
	message,
	seatBots,
} from "@/lib/conversations/transcript-fixtures"
import {
	type ConversationSeating,
	ConversationSeatingContext,
} from "@/lib/conversations/use-conversation-seating"
import { hasCaptionWindowControls } from "@/lib/host"
import type { Mission, MissionChanged } from "@/lib/missions/mission-contract"
import { missionSummonsFor } from "@/lib/missions/mission-summons"
import { missionsTransport } from "@/lib/missions/missions-transport"
import {
	createOpenedMissionController,
	type OpenedMissionController,
} from "@/lib/missions/opened-mission-controller"
import {
	createFakeOnboardingPort,
	type FakeOnboardingPort,
} from "@/lib/onboarding/fake-onboarding-port"
import {
	createFakeOnboardingWorld,
	type FakeOnboardingWorld,
} from "@/lib/onboarding/fake-onboarding-world"
import {
	createOnboardingController,
	type OnboardingController,
} from "@/lib/onboarding/onboarding-controller"
import { onboardingSummonsFor } from "@/lib/onboarding/onboarding-summons"
import {
	createSignInController,
	type SignInController,
	signInWorldOf,
} from "@/lib/onboarding/sign-in-controller"
import type { Onboarding } from "@/lib/onboarding/use-onboarding"
import { type FakeLayout, fakeLayout } from "@/lib/perf/fake-layout"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { createOpenedRoutineController } from "@/lib/routines/opened-routine-controller"
import type { Routine } from "@/lib/routines/routine-contract"
import { routinesTransport } from "@/lib/routines/routines-transport"
import type { ReportedRunsReader } from "@/lib/routines/run-port"
import { triggerSourcesTransport } from "@/lib/routines/trigger-sources-transport"
import {
	createMessageLandingController,
	type MessageLandingController,
} from "@/lib/search/message-landing-controller"
import { useCompanionMenuLookup } from "@/lib/sidebar/companion-menu"
import { useCompanionSelectGuard } from "@/lib/sidebar/companion-select"
import type { DepartureReason } from "@/lib/spaces/joined-spaces-controller"
import {
	type HostWait,
	type OpenJoinedHost,
	OpenJoinedHostContext,
} from "@/lib/spaces/open-joined-host"

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
			update: vi.fn(),
			runs: vi.fn(),
			runsOfSpace: vi.fn(),
		},
	}
})
vi.mock("@/lib/routines/trigger-sources-transport", () => ({
	triggerSourcesTransport: { sourcesOfSpace: vi.fn() },
}))
vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	hasCaptionWindowControls: vi.fn(() => false),
}))
vi.mock("@/lib/missions/missions-transport", () => ({
	missionsTransport: {
		list: vi.fn(),
		onChanged: vi.fn(),
	},
}))

const listRoutines = vi.mocked(routinesTransport.list)
const listRuns = vi.mocked(routinesTransport.runsOfSpace)
const updateRoutine = vi.mocked(routinesTransport.update)
const listSources = vi.mocked(triggerSourcesTransport.sourcesOfSpace)
const listMissions = vi.mocked(missionsTransport.list)
const listenToMissions = vi.mocked(missionsTransport.onChanged)
const onCaptionWindow = vi.mocked(hasCaptionWindowControls)

const CRASH: ChatError = {
	id: "crashed-0",
	error: { kind: "crashed", code: 1, detail: null },
}

const NO_ERRORS: ChatError[] = []

const CRASH_TITLE = "Nyx stopped"

const SPAWN_FAILURE: ChatError = {
	id: "spawnFailed-1",
	error: { kind: "spawnFailed", detail: "no binary" },
}

const SPAWN_TITLE = "Couldn’t reach Nyx"

const PINS_TITLE = "Couldn’t sync pinned messages"

const UNRESOLVED_MENTION_TITLE = "Couldn’t summon an agent"

const READ_TITLE = "Couldn’t load earlier messages"

const SPACE = "personal"

const REPORT_TURN = "t-report"

const REPORT_TEXT = "Two tickets closed."

const ROUTINE_TITLE = "Nightly report"

const CAUSES_TITLE = "Couldn’t load routine reports"

const CAUSES_SOLO_DESCRIPTION = "Reopen the conversation to retry."

const BOT_TITLE = "Release manager"

const A_SECOND = 1_000

const A_MINUTE = 60_000

const TURN_STARTED_AT = 5 * A_MINUTE

const REPORTED: SpokenTurn = {
	turnId: REPORT_TURN,
	text: REPORT_TEXT,
	createdAt: A_MINUTE,
}

const STOPPED_BEFORE_WRITING: SpokenTurn = {
	turnId: "t-stopped",
	text: "",
	createdAt: A_MINUTE,
	completion: "cancelled",
}

const SAID_BEFORE: SpokenTurn = {
	turnId: "t-before",
	text: "the walls hold",
	createdAt: 0,
}

const SAID_AFTER: SpokenTurn = {
	turnId: "t-after",
	text: "and the roof too",
	createdAt: 2 * A_MINUTE,
}

const reportedRunsOf =
	(turnId: string): ReportedRunsReader =>
	async () => [
		{ turnId, routineTitle: ROUTINE_TITLE, triggerSourceId: "schedule" },
	]

const REFUSED_REPORTED_RUNS: ReportedRunsReader = () =>
	Promise.reject(new Error("refused"))

const refusingOlderStore = (): TranscriptStore => {
	const base = createFakeTranscriptStore()
	return {
		...base,
		loadPage: (conversationId, cursor) =>
			cursor
				? Promise.reject(new Error("refused"))
				: Promise.resolve({
						conversationId,
						messages: [message({ conversationId, seq: 2 })],
						arrivals: [],
						hasMore: true,
					}),
	}
}

const stubController = (
	overrides: Partial<ChatController> = {},
): ChatController => ({
	getState: () => initialChatState,
	stateFor: () => initialChatState,
	subscribe: () => () => undefined,
	attach: () => () => undefined,
	check: async () => null,
	start: async () => null,
	preflight: async () => null,
	open: async () => null,
	openAside: async () => null,
	close: async () => undefined,
	enter: () => undefined,
	leave: () => undefined,
	redescribe: () => undefined,
	restart: async () => null,
	reopen: async () => null,
	loadOlder: async () => undefined,
	loadNewer: async () => undefined,
	loadLatest: async () => true,
	landOn: async () => [],
	follow: () => undefined,
	send: async () => undefined,
	sendTo: async () => undefined,
	reference: async () => null,
	pin: async () => undefined,
	unpin: async () => undefined,
	pins: async () => [],
	reportRun: async () => "",
	storeAttachments: async () => [],
	stop: async () => undefined,
	stopFor: async () => undefined,
	discard: () => undefined,
	respond: async () => undefined,
	answer: async () => undefined,
	postQuestion: () => false,
	withdrawQuestion: () => undefined,
	retry: async () => undefined,
	shutdown: async () => undefined,
	dismissError: () => undefined,
	...overrides,
})

const attachments = createAttachmentsController({
	store: async () => [],
	send: () => true,
})

const NO_BOT_CHAT = {
	storeAttachments: () => Promise.resolve<string[]>([]),
	sendTo: () => Promise.resolve(),
}

const botOf = (id: string, name: string): Bot => ({
	...botIdentity({ name }),
	id,
	createdAt: 0,
	changesNothing: false,
	memory: "",
	sectionId: null,
	pinPosition: null,
})

type ThreadFixture = {
	id: string
	name: string
	said: string
	errors?: ChatError[]
	controller?: ChatController
}

const threadOf = ({
	id,
	name,
	said,
	errors = NO_ERRORS,
	controller = stubController(),
}: ThreadFixture): BotThread => ({
	kind: "bot",
	bot: botOf(id, name),
	chat: {
		state: {
			...initialChatState,
			connection: "ready",
			conversationId: `c-${id}`,
			messages: [
				message({
					id: `m-${id}`,
					conversationId: `c-${id}`,
					role: "assistant",
					authorBotId: id,
					content: said,
				}),
			],
			errors,
			errorCount: errors.length,
		},
		controller,
	},
	isOverlayOpen: false,
	onToggleSettings: () => undefined,
})

const NO_BOT_RECORDS: Bot[] = []

const BOT_THREAD_RUNTIMES = createConversationRuntimes(
	createScriptedDriver(),
	createFakeTranscriptStore(),
)

const runtimesOf = (thread: Thread) =>
	thread.kind === "conversation" ? thread.runtimes : BOT_THREAD_RUNTIMES

type ThreadScreenHarnessProps = {
	thread: Thread
	bots: Bot[]
	landings: MessageLandingController
	onboarding?: OnboardingController
	signIn?: SignInController
	onOpenMission: (missionId: string) => void
	onOpenMissionInNewTab?: (missionId: string) => void
	staging?: AttachmentsController
}

const ThreadScreenHarness = ({
	thread,
	bots,
	landings,
	onboarding,
	signIn,
	onOpenMission,
	onOpenMissionInNewTab = () => undefined,
	staging = attachments,
}: ThreadScreenHarnessProps) => {
	const [isOpen, setOpen] = useState(false)
	const onboardingState = useSyncExternalStore(
		onboarding ? onboarding.subscribe : NEVER_CHANGES,
		onboarding ? onboarding.getState : NO_ONBOARDING_STATE,
	)
	const signInState = useSyncExternalStore(
		signIn ? signIn.subscribe : NEVER_CHANGES,
		signIn ? signIn.getState : NO_SIGN_IN_STATE,
	)

	return createElement(ThreadScreen, {
		activityPanel: {
			isOpen,
			onOpenChange: setOpen,
			openedRoutine: createOpenedRoutineController(),
		},
		attachments: staging,
		bots,
		drafts: createDraftsController(),
		landings,
		onboarding:
			onboarding && onboardingState
				? ({
						state: onboardingState,
						controller: onboarding,
					} satisfies Onboarding)
				: undefined,
		onOpenMission,
		onOpenMissionInNewTab,
		readerName: "Reader",
		runtimes: runtimesOf(thread),
		signIn:
			signIn && signInState
				? { state: signInState, controller: signIn }
				: undefined,
		spaceId: THREAD_SPACE,
		thread,
	})
}

const NEVER_CHANGES = () => () => undefined

const NO_ONBOARDING_STATE = () => null

const NO_SIGN_IN_STATE = () => null

const screenOf = (
	thread: Thread,
	bots: Bot[] = NO_BOT_RECORDS,
	onOpenMission: (missionId: string) => void = () => undefined,
	landings: MessageLandingController = createMessageLandingController(),
	onboarding?: OnboardingController,
	signIn?: SignInController,
) =>
	createElement(ThreadScreenHarness, {
		bots,
		landings,
		onboarding,
		onOpenMission,
		signIn,
		thread,
	})

const settle = () =>
	act(async () => {
		for (let round = 0; round < 20; round += 1) {
			await Promise.resolve()
		}
		await new Promise((notified) => setTimeout(notified, 0))
	})

const raisedNotices = (title: string) =>
	[
		...document.querySelectorAll<HTMLElement>(
			'[data-slot="toast"]:not([data-ending-style])',
		),
	].filter(
		(notice) =>
			notice.querySelector('[data-slot="toast-title"]')?.textContent === title,
	)

const raisedNotice = (title: string) => {
	const [notice] = raisedNotices(title)
	if (!notice) throw new Error(`no notice titled ${title} was raised`)
	return notice
}

const pressInNotice = (title: string, name: string) =>
	act(() => {
		fireEvent.click(
			within(raisedNotice(title)).getByRole("button", { name, hidden: true }),
		)
	})

const closeNotice = (title: string) =>
	act(() => {
		fireEvent.click(within(raisedNotice(title)).getByLabelText("Close notice"))
	})

const WRITING_STARTED: AgentEvent = {
	type: "messageStarted",
	message: {
		id: "msg-writing",
		role: "assistant",
		text: "",
		completion: "streaming",
		timestamp: 1,
	},
}

const WRITING: AgentEvent[] = [
	WRITING_STARTED,
	{
		type: "messageDelta",
		id: "msg-writing",
		seq: 1,
		text: "the walls hold\n\nand",
	},
]

const FIRST_TOKEN: AgentEvent[] = [
	WRITING_STARTED,
	{ type: "messageDelta", id: "msg-writing", seq: 1, text: "the walls hold" },
]

const BLOCK_CLOSED: AgentEvent[] = [
	{ type: "messageDelta", id: "msg-writing", seq: 2, text: "\n\nand" },
]

const WRITING_LANDED: AgentEvent[] = [
	{
		type: "messageCompleted",
		message: {
			id: "msg-writing",
			role: "assistant",
			text: "the walls hold",
			completion: "complete",
			timestamp: 1,
		},
	},
	{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
]

const ASKED: AgentEvent[] = [
	{
		type: "questionRequested",
		request: {
			id: "ask-1",
			questions: [
				{
					header: "Which wall",
					question: "Which wall holds?",
					options: [],
					multiSelect: false,
				},
			],
		},
	},
]

const SEARCHING: AgentEvent[] = [
	{
		type: "activity",
		activity: {
			id: "act-1",
			title: "Grep · walls",
			kind: "tool",
			status: "running",
		},
	},
]

const HANDED_TO_NOBODY: AgentEvent[] = [
	{
		type: "messageStarted",
		message: {
			id: "msg-to-nobody",
			role: "assistant",
			text: "",
			completion: "streaming",
			timestamp: 1,
		},
	},
	{
		type: "messageDelta",
		id: "msg-to-nobody",
		seq: 1,
		text: "over to <@ghost>",
	},
	{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
]

const HANDED_TO_ZOE: AgentEvent[] = [
	{
		type: "messageStarted",
		message: {
			id: "msg-to-zoe",
			role: "assistant",
			text: "",
			completion: "streaming",
			timestamp: 1,
		},
	},
	{ type: "messageDelta", id: "msg-to-zoe", seq: 1, text: "@Zoe keep going" },
	{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
]

const HANDED_TO_ADA: AgentEvent[] = [
	{
		type: "messageStarted",
		message: {
			id: "msg-handover",
			role: "assistant",
			text: "",
			completion: "streaming",
			timestamp: 1,
		},
	},
	{ type: "messageDelta", id: "msg-handover", seq: 1, text: "@Ada keep going" },
	{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
]

const SAID_AND_LANDED: AgentEvent[] = [
	{
		type: "messageStarted",
		message: {
			id: "msg-said",
			role: "assistant",
			text: "",
			completion: "streaming",
			timestamp: 1,
		},
	},
	{ type: "messageDelta", id: "msg-said", seq: 1, text: "the walls hold" },
	{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
]

type Room = {
	driver: ScriptedDriver
	bots: Bot[]
	thread: ConversationThread
	idOf: (name: string) => string
	send: (text: string) => Promise<void>
}

type SpokenTurn = {
	turnId: string
	text: string
	createdAt: number
	role?: TranscriptRole
	author?: string
	completion?: TerminalCompletion
}

type RoomFixture = {
	names: string[]
	readReportedRuns?: ReportedRunsReader
	spoken?: SpokenTurn[]
}

const writeUserTurn = async (
	store: TranscriptStore,
	conversationId: string,
	{ turnId, text, createdAt }: SpokenTurn,
) => {
	await store.appendUserMessage({
		id: `m-${turnId}`,
		conversationId,
		turnId,
		authorBotId: null,
		repliedToMessageId: null,
		content: text,
		createdAt,
	})
}

const writeBotTurn = async (
	store: TranscriptStore,
	conversationId: string,
	botId: string,
	{ turnId, text, createdAt, completion = "complete" }: SpokenTurn,
) => {
	await store.openAssistantMessage({
		id: `m-${turnId}`,
		conversationId,
		turnId,
		authorBotId: botId,
		repliedToMessageId: null,
		createdAt,
	})
	await store.appendText(`m-${turnId}`, text)
	await store.finalizeMessage(`m-${turnId}`, completion)
}

const writeTurn = async (
	store: TranscriptStore,
	conversationId: string,
	botId: string,
	turn: SpokenTurn,
) => {
	const { turnId, createdAt } = turn
	await store.startTurn({ id: turnId, conversationId, startedAt: createdAt })
	await (turn.role === "user"
		? writeUserTurn(store, conversationId, turn)
		: writeBotTurn(store, conversationId, botId, turn))
	await store.completeTurn(turnId, createdAt)
}

const speakerOf = (bots: Bot[], author?: string) =>
	bots.find((bot) => bot.name === author) ?? bots[0]

const roomOf = async ({
	names,
	readReportedRuns,
	spoken = [],
}: RoomFixture): Promise<Room> => {
	const store = createFakeTranscriptStore()
	const bots = await seatBots(store, SPACE, names)
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: bots.map((bot) => bot.id),
	})
	for (const turn of spoken) {
		await writeTurn(
			store,
			conversation.id,
			speakerOf(bots, turn.author).id,
			turn,
		)
	}
	const driver = createScriptedDriver()
	const runtimes = createConversationRuntimes(driver, store, {
		readReportedRuns,
	})
	const controller = runtimes.runtimeFor(conversation.id)

	return {
		driver,
		bots,
		thread: {
			kind: "conversation",
			conversation,
			runtimes,
			onOpenSettings: () => undefined,
		},
		idOf: (name) => bots.find((bot) => bot.name === name)?.id ?? name,
		send: async (text) => {
			await act(async () => {
				await controller.send(text)
			})
			await settle()
		},
	}
}

const LONG_ROOM_TURNS = 400

const LANDED_SEQ = 80

const LANDED_MESSAGE_ID = `m-t-${LANDED_SEQ}`

const UNREACHABLE_TITLE = "Couldn’t open that message"

const textOfTurn = (index: number) => `Message ${index} of the long room`

const LONG_ROOM_SPOKEN: SpokenTurn[] = Array.from(
	{ length: LONG_ROOM_TURNS },
	(_, index) => ({
		turnId: `t-${index + 1}`,
		text: textOfTurn(index + 1),
		createdAt: index + 1,
	}),
)

const longRoomOf = () => roomOf({ names: ["Ada"], spoken: LONG_ROOM_SPOKEN })

const anchorOf = (messageId: string) =>
	document.querySelector(`[data-message-id="${messageId}"]`)

const shownTurnNumbers = () =>
	[...document.querySelectorAll("[data-message-id]")]
		.map((anchor) =>
			/^m-t-(\d+)$/.exec(anchor.getAttribute("data-message-id") ?? ""),
		)
		.flatMap((found) => (found ? [Number(found[1])] : []))

const SOLO_ROUTINE: Routine = {
	id: "r-1",
	conversationId: "c-bot-1",
	botId: "bot-1",
	title: "Shift log digest",
	instruction: "Read the shift log and report what changed.",
	triggerSourceId: "schedule",
	filter: { matchMode: "all", rows: [] },
	triggerConfig: { every: "1h" },
	isEnabled: true,
	consecutiveFailures: 0,
	createdAt: 0,
}

const SOLO_MISSION: Mission = {
	id: "m-1",
	originConversationId: "c-bot-1",
	spaceId: null,
	botId: "bot-1",
	threadConversationId: "c-mission-1",
	objective: "Rewrite the changelog parser",
	ticket: {
		platform: "linear",
		externalId: "OPE-42",
		url: "https://linear.app/ope-42",
		title: "Changelog parser",
	},
	tools: ["Read", "Write"],
	state: "working",
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
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000

const CLOSED_SOLO_MISSION: Mission = {
	...SOLO_MISSION,
	id: "m-2",
	state: "done",
	closedAt: 1,
}

const SCHEDULE_SOURCE = {
	id: "schedule",
	title: "Schedule",
	payload: [],
	dedupeKey: "occurrenceId",
}

const THREAD_SPACE = "personal"

const SCHEDULE_DECLARED = [
	{ botId: "bot-1", triggerSources: [SCHEDULE_SOURCE], failure: null },
]

const ROUTINES_TOGGLE = "Toggle activity"

const READ_ROUTINES_TITLE = "Couldn’t load routines"

const READ_MISSIONS_TITLE = "Couldn’t load missions"

const withoutMainConversation = (thread: BotThread): BotThread => ({
	...thread,
	chat: {
		...thread.chat,
		state: { ...thread.chat.state, conversationId: null },
	},
})

const withoutRuns = (thread: BotThread): BotThread => ({
	...thread,
	chat: {
		...thread.chat,
		state: { ...thread.chat.state, messages: [] },
	},
})

const turnGroups = () =>
	document.querySelectorAll('[data-slot="chat-turn-group"]')

const missionCards = () =>
	screen.queryAllByRole("article", { name: "mission opened" })

const missionCard = () =>
	screen.getByRole("article", { name: "mission opened" })

const missionsSection = () =>
	screen.getByRole("region", { name: "In progress" })

const NEW_TAB_CLICK = { detail: 1, metaKey: true }

const middleClick = (target: HTMLElement) =>
	fireEvent(
		target,
		new MouseEvent("auxclick", { bubbles: true, button: 1, detail: 1 }),
	)

const missionTabsScreenOf = (
	openMission: (missionId: string) => void,
	openMissionInNewTab: (missionId: string) => void,
) =>
	createElement(ThreadScreenHarness, {
		bots: NO_BOT_RECORDS,
		landings: createMessageLandingController(),
		onOpenMission: openMission,
		onOpenMissionInNewTab: openMissionInNewTab,
		thread: threadOf({ id: "bot-1", name: "Nyx", said: "held" }),
	})

const openRoutinesPanel = async () => {
	fireEvent.click(screen.getByRole("button", { name: ROUTINES_TOGGLE }))
	await settle()
}

const openRoutinesScreen = async () => {
	const entry = document.querySelector<HTMLElement>(
		'[data-slot="routines-entry"]',
	)
	if (!entry) throw new Error("the activity panel holds no routines entry")
	fireEvent.click(entry)
	await settle()
}

type SoloFixture = {
	readReportedRuns?: ReportedRunsReader
	senderAccountId?: () => string | null
	spoken?: SpokenTurn[]
}

type Solo = {
	thread: () => BotThread
	report: (text: string) => Promise<void>
	send: (text: string) => Promise<void>
	push: (events: AgentEvent[]) => Promise<void>
}

const soloOf = async ({
	readReportedRuns,
	senderAccountId,
	spoken = [],
}: SoloFixture): Promise<Solo> => {
	const store = createFakeTranscriptStore()
	const [bot] = await seatBots(store, SPACE, ["Ada"])
	const chat = await store.mainChat(bot.id)
	for (const turn of spoken) {
		await writeTurn(store, chat.id, bot.id, turn)
	}
	const driver = createScriptedDriver()
	const controller = createChatController(driver, store, {
		readReportedRuns,
		senderAccountId,
	})
	controller.attach()
	await act(async () => {
		await controller.open(bot.id, null)
	})

	return {
		send: async (text) => {
			await act(async () => {
				await controller.send(text)
			})
			await settle()
		},
		push: async (events) => {
			await act(async () => {
				driver.pushTo(bot.id, events)
			})
			await settle()
		},
		thread: () => ({
			kind: "bot",
			bot,
			chat: { state: controller.stateFor(bot.id), controller },
			isOverlayOpen: false,
			onToggleSettings: () => undefined,
		}),
		report: async (text) => {
			await act(async () => {
				await controller.reportRun({
					conversationId: chat.id,
					botId: bot.id,
					runtimeSessionId: "rs-1",
					text,
					routineTitle: ROUTINE_TITLE,
					triggerSourceId: "schedule",
				})
			})
			await settle()
		},
	}
}

const MISSION_SUMMONS: SpokenTurn = {
	turnId: "t-summons",
	text: missionSummonsFor("working"),
	createdAt: A_MINUTE,
	role: "user",
}

const SUMMONS_CAUSE = "Opened by the mission"

const SUMMONS_ANNOUNCEMENT = "Mission summons"

const SUMMONS_AGAIN_CAUSE = "Opened by the coding session’s question"

const MISSION_ASKED: SpokenTurn = {
	turnId: "t-asked",
	text: "and the tests?",
	createdAt: 90 * A_SECOND,
	role: "user",
}

const SUMMONS_AGAIN: SpokenTurn = {
	turnId: "t-summons-2",
	text: missionSummonsFor("waiting_bot"),
	createdAt: 3 * A_MINUTE,
	role: "user",
}

const MISSION_SAID_AGAIN: SpokenTurn = {
	turnId: "t-mission-2",
	text: "the agent is unblocked",
	createdAt: 4 * A_MINUTE,
}

const causeTitles = () =>
	[...document.querySelectorAll('[data-slot="turn-cause-title"]')].map(
		(cause) => cause.textContent,
	)

const MISSION_SAID: SpokenTurn = {
	turnId: "t-mission",
	text: "the parser is rewritten",
	createdAt: 2 * A_MINUTE,
}

const MISSION_OPENED: MissionEventModel = {
	id: "e-opened",
	kind: "opened",
	source: "bot",
	createdAt: A_MINUTE,
}

const MISSION_ESCALATED: MissionEventModel = {
	id: "e-escalated",
	kind: "escalated",
	source: "bot",
	createdAt: 3 * A_MINUTE,
	text: "The parser needs a decision.",
}

type MissionRoomFixture = {
	events: MissionEventModel[]
	spoken?: SpokenTurn[]
	closedAt?: number | null
}

const missionRoomOf = async ({
	events,
	spoken = [],
	closedAt = null,
}: MissionRoomFixture): Promise<Room> => {
	const room = await roomOf({ names: ["Ada"], spoken })
	const mission: Mission = {
		...SOLO_MISSION,
		botId: room.idOf("Ada"),
		closedAt,
	}

	return {
		...room,
		thread: {
			...room.thread,
			mission: {
				mission,
				events,
				now: 4 * A_MINUTE,
				opening: { missionId: mission.id, rowId: room.thread.conversation.id },
				onLeave: () => undefined,
			},
		},
	}
}

const ADA_OPENS: SpokenTurn = {
	turnId: "t-ada-1",
	text: "the walls hold",
	createdAt: 0,
	author: "Ada",
}

const ADA_CLOSES: SpokenTurn = {
	turnId: "t-ada-2",
	text: "and the gate too",
	createdAt: A_MINUTE,
	author: "Ada",
}

const NYX_ANSWERS: SpokenTurn = {
	turnId: "t-nyx-1",
	text: "the roof is next",
	createdAt: 2 * A_MINUTE,
	author: "Nyx",
}

const ASKED_FIRST: SpokenTurn = {
	turnId: "t-asked-1",
	text: "does the wall hold",
	createdAt: 0,
	role: "user",
}

const ASKED_AGAIN: SpokenTurn = {
	turnId: "t-asked-2",
	text: "and the gate",
	createdAt: A_MINUTE,
	role: "user",
}

const SENT_FIRST = "does the wall hold"

const QUEUED_FIRST = "and the gate"

const QUEUED_LAST = "and the roof"

const WAITING_TO_BE_SENT = "Waiting to be sent"

const queuedSoloOf = async (queued: string[]) => {
	const solo = await soloOf({})
	await solo.send(SENT_FIRST)
	for (const text of queued) {
		await solo.send(text)
	}
	return solo
}

const runRoomOf = () =>
	roomOf({
		names: ["Ada", "Nyx"],
		spoken: [ADA_OPENS, ADA_CLOSES, NYX_ANSWERS],
	})

const turnOf = (text: string) =>
	screen.getByText(text).closest('[data-slot="message"]')

const nameLineOf = (text: string) =>
	turnOf(text)?.querySelector('[data-slot="message-author"]')?.textContent ??
	null

const gutterAvatarOf = (text: string) =>
	turnOf(text)?.querySelector(
		'[data-slot="message-gutter"] :is([data-slot="bot-identity-avatar"], [data-slot="user-avatar"])',
	) ?? null

const gutterOf = (text: string) =>
	turnOf(text)?.querySelector('[data-slot="message-gutter"]') ?? null

const NO_COMPANION_ACTIONS = {
	onAddBotToSpace: () => undefined,
	onDeleteBot: () => undefined,
	onDuplicateBot: () => undefined,
	onEditBot: () => undefined,
	onPinRoster: () => undefined,
	onRemoveBotFromSpace: () => undefined,
}

type CompanionMenuHarnessProps = {
	companionIds: string[]
	children: ReactNode
}

const CompanionMenuHarness = ({
	companionIds,
	children,
}: CompanionMenuHarnessProps) =>
	createElement(
		CompanionMenuProvider,
		{
			menuFor: useCompanionMenuLookup({
				actions: NO_COMPANION_ACTIONS,
				conversationRosters: {},
				openSpaceId: SPACE,
				rosters: {
					[SPACE]: companionIds.map((id) => ({
						id,
						name: id,
						pinPosition: null,
						sectionId: null,
					})),
				},
				sectionsBySpaceId: {},
				spaces: [
					{ id: SPACE, name: "Personal", colour: 257, avatarSeed: SPACE },
				],
			}),
		},
		children,
	)

const underCompanionMenu = (children: ReactNode, companionIds: string[]) =>
	createElement(CompanionMenuHarness, { children, companionIds })

type CompanionSelectTarget = {
	select: Mock<(companionId: string) => void>
	missions: OpenedMissionController
}

const selectTargetInMissionOf = (botId: string): CompanionSelectTarget => {
	const missions = createOpenedMissionController({
		getState: () => ({ selectedBotId: botId, selectedConversationId: null }),
		subscribe: () => () => undefined,
	})
	missions.open({ missionId: SOLO_MISSION.id, rowId: botId })

	return { select: vi.fn(), missions }
}

type CompanionSelectHarnessProps = {
	companionIds: string[]
	target: CompanionSelectTarget
	children: ReactNode
}

const CompanionSelectHarness = ({
	companionIds,
	target,
	children,
}: CompanionSelectHarnessProps) =>
	createElement(
		CompanionSelectProvider,
		{
			onSelect: useCompanionSelectGuard({
				openSpaceId: SPACE,
				rosters: { [SPACE]: companionIds.map((id) => ({ id })) },
				select: target.select,
				leaveMission: target.missions.leave,
				openThreadInNewTab: vi.fn(),
			}),
		},
		children,
	)

const underCompanionSelect = (
	children: ReactNode,
	companionIds: string[],
	target: CompanionSelectTarget,
) => createElement(CompanionSelectHarness, { children, companionIds, target })

const clickGutterOf = (text: string) => {
	const avatar = gutterOf(text)?.querySelector("button")
	if (!avatar) throw new Error(`no gutter avatar for ${text}`)
	fireEvent.click(avatar)
}

const clickMentionOf = (text: string) => {
	const pill = turnOf(text)?.querySelector('button[data-slot="bot-mention"]')
	if (!pill) throw new Error(`no mention pill in ${text}`)
	fireEvent.click(pill)
}

const rightClickGutterOf = async (text: string) => {
	const gutter = gutterOf(text)
	if (!gutter) throw new Error(`no gutter for ${text}`)
	fireEvent.contextMenu(gutter, { clientX: 20, clientY: 20 })
	return screen.findByRole("menu")
}

const markOf = (text: string) =>
	turnOf(text)?.querySelector('[data-slot="shared-mark"][data-state="marked"]')

const bubbleShapeOf = (text: string) =>
	screen.getByText(text).closest('[data-slot="message-bubble-content"]')
		?.className ?? null

const transcriptRows = () =>
	[...document.querySelectorAll('[data-slot="message-scroller-item"]')].map(
		(row) => row.textContent ?? "",
	)

const rowIndexOf = (text: string) =>
	transcriptRows().findIndex((row) => row.includes(text))

const askedForm = () => screen.getByRole("form", { name: "Which wall holds?" })

const ASKED_WITH_OPTIONS: AgentEvent[] = [
	{
		type: "questionRequested",
		request: {
			id: "ask-2",
			questions: [
				{
					header: "Which wall",
					question: "Which wall holds?",
					options: [
						{ label: "North", description: "Faces the sun", preview: null },
						{ label: "South", description: null, preview: null },
					],
					multiSelect: false,
				},
			],
		},
	},
]

const composerField = () => screen.queryByRole("textbox", { name: "Message" })

const answeredCardFrom = () =>
	document
		.querySelector('[data-slot="answered-question-card"]')
		?.closest("[data-from]")
		?.getAttribute("data-from") ?? null

const answeredCardText = () =>
	document.querySelector('[data-slot="answered-question-card"]')?.textContent ??
	null

const pickNorth = async () => {
	await act(async () => {
		fireEvent.click(screen.getByRole("radio", { name: "North" }))
	})
	await settle()
}

const askedSolo = async () => {
	const solo = await soloOf({})
	const shown = render(screenOf(solo.thread()), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
	await solo.send("hold the wall")
	await solo.push([...FIRST_TOKEN, ...ASKED_WITH_OPTIONS])
	const rerender = async () => {
		shown.rerender(screenOf(solo.thread()))
		await settle()
	}
	await rerender()
	return { solo, rerender }
}

const elapsedText = () =>
	document.querySelector('[data-slot="bot-working-elapsed"]')?.textContent ??
	null

const stopsFor = (name: string) =>
	screen.queryAllByRole("button", { name: `Stop ${name}` })

const stopFor = (name: string) => stopsFor(name)[0] ?? null

describe("ThreadScreen", () => {
	let layout: FakeLayout

	beforeEach(() => {
		layout = fakeLayout()
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([SOLO_ROUTINE])
		listRuns.mockResolvedValue([])
		listSources.mockResolvedValue(SCHEDULE_DECLARED)
		listMissions.mockResolvedValue({ open: [], done: [] })
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		layout.restore()
		onCaptionWindow.mockReturnValue(false)
	})

	it("opens the routines of a solo companion thread on its main conversation", async () => {
		updateRoutine.mockResolvedValue({ ...SOLO_ROUTINE, isEnabled: false })
		render(screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await openRoutinesPanel()
		await openRoutinesScreen()

		expect(listRoutines).toHaveBeenCalledWith("c-bot-1")
		expect(listSources).toHaveBeenCalledOnce()
		expect(listSources).toHaveBeenCalledWith(THREAD_SPACE)
		expect(screen.getByText(SOLO_ROUTINE.title)).toBeTruthy()

		fireEvent.click(screen.getByRole("switch", { name: SOLO_ROUTINE.title }))
		await settle()

		expect(updateRoutine).toHaveBeenCalledWith(
			SOLO_ROUTINE.id,
			expect.objectContaining({ isEnabled: false }),
		)
	})

	it("keeps the caption buttons out of the conversation header on Windows", async () => {
		onCaptionWindow.mockReturnValue(true)
		render(screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		const header = within(screen.getByRole("banner"))
		expect(header.queryByRole("button", { name: "Minimize" })).toBeNull()
		expect(header.queryByRole("button", { name: "Close" })).toBeNull()
		expect(header.getByRole("button", { name: /Pinned messages/ })).toBeTruthy()
		expect(header.getByRole("button", { name: ROUTINES_TOGGLE })).toBeTruthy()
	})

	it("leaves a solo companion thread with no main conversation without routines", async () => {
		const thread = threadOf({ id: "bot-1", name: "Nyx", said: "held" })
		render(screenOf(withoutMainConversation(thread)), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(screen.queryByRole("button", { name: ROUTINES_TOGGLE })).toBeNull()
		expect(listRoutines).not.toHaveBeenCalled()
		expect(listSources).not.toHaveBeenCalled()
	})

	it("keeps the transcript a solo companion thread mounted when its main conversation arrives", async () => {
		const thread = threadOf({ id: "bot-1", name: "Nyx", said: "held" })
		const { rerender } = render(screenOf(withoutMainConversation(thread)), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		const painted = turnGroups()[0]
		fireEvent.click(screen.getAllByRole("button", { name: "Reply" })[0])
		expect(screen.getByRole("button", { name: "Cancel reply" })).toBeTruthy()

		rerender(screenOf(thread))
		await settle()

		expect(turnGroups()[0]).toBe(painted)
		expect(screen.getByRole("button", { name: "Cancel reply" })).toBeTruthy()
		expect(listRoutines).toHaveBeenCalledWith("c-bot-1")
	})

	it("tells the reader when the routines of a solo companion thread could not be read", async () => {
		listRoutines.mockRejectedValue(new Error("refused"))
		render(screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await openRoutinesPanel()
		expect(screen.getByText(READ_ROUTINES_TITLE)).toBeTruthy()

		listRoutines.mockResolvedValue([SOLO_ROUTINE])
		fireEvent.click(screen.getByRole("button", { name: "Retry" }))
		await settle()
		await openRoutinesScreen()

		expect(screen.getByText(SOLO_ROUTINE.title)).toBeTruthy()
	})

	it("reads the missions of a solo companion thread again when one of them changes", async () => {
		const announce: { toPanel: ((changed: MissionChanged) => void) | null } = {
			toPanel: null,
		}
		listenToMissions.mockImplementation((listener) => {
			announce.toPanel = listener
			return Promise.resolve(() => undefined)
		})
		listMissions.mockResolvedValue({ open: [SOLO_MISSION], done: [] })
		render(screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await openRoutinesPanel()
		expect(listMissions).toHaveBeenCalledWith("c-bot-1")
		expect(
			within(missionsSection()).getByText(SOLO_MISSION.objective),
		).toBeTruthy()

		announce.toPanel?.({
			missionId: SOLO_MISSION.id,
			spaceId: null,
			state: "waiting_human",
			stateSeq: 2,
			isAgentRunning: false,
			lastActivityAt: null,
		})
		await settle()

		expect(listMissions).toHaveBeenCalledTimes(2)
	})

	it("shows a mission of the conversation under the run that opened it", async () => {
		listMissions.mockResolvedValue({ open: [SOLO_MISSION], done: [] })
		render(screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		const card = missionCard()
		expect(within(card).getByText(SOLO_MISSION.objective)).toBeTruthy()
		expect(within(card).getByText(SOLO_MISSION.ticket.externalId)).toBeTruthy()
		expect(
			turnGroups()[0].compareDocumentPosition(card) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
	})

	it("shows a mission of a thread holding no run at all", async () => {
		listMissions.mockResolvedValue({ open: [SOLO_MISSION], done: [] })
		render(
			screenOf(
				withoutRuns(threadOf({ id: "bot-1", name: "Nyx", said: "held" })),
			),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		expect(within(missionCard()).getByText(SOLO_MISSION.objective)).toBeTruthy()
		expect(turnGroups()).toHaveLength(0)
	})

	it("opens the mission thread the reader activates in the transcript", async () => {
		const openMission = vi.fn()
		listMissions.mockResolvedValue({ open: [SOLO_MISSION], done: [] })
		render(
			screenOf(
				threadOf({ id: "bot-1", name: "Nyx", said: "held" }),
				NO_BOT_RECORDS,
				openMission,
			),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		fireEvent.click(
			within(missionCard()).getByRole("button", {
				name: `Open the mission: ${SOLO_MISSION.objective}`,
			}),
		)

		expect(openMission).toHaveBeenCalledWith(SOLO_MISSION.id)
	})

	it.each([
		{
			place: "transcript",
			openButtonOf: async () =>
				within(missionCard()).getByRole("button", {
					name: `Open the mission: ${SOLO_MISSION.objective}`,
				}),
		},
		{
			place: "Routines panel",
			openButtonOf: async () => {
				await openRoutinesPanel()
				return within(missionsSection()).getByRole("button", {
					name: new RegExp(SOLO_MISSION.objective),
				})
			},
		},
	])(
		"opens the $place mission card in a new tab on a new-tab click, in place otherwise",
		async ({ openButtonOf }) => {
			const openMission = vi.fn()
			const openMissionInNewTab = vi.fn()
			listMissions.mockResolvedValue({ open: [SOLO_MISSION], done: [] })
			render(missionTabsScreenOf(openMission, openMissionInNewTab), {
				wrapper: createQueryTestWrapper().wrapper,
			})
			await settle()
			const openButton = await openButtonOf()

			fireEvent.click(openButton, NEW_TAB_CLICK)
			middleClick(openButton)

			expect(openMissionInNewTab.mock.calls).toEqual([
				[SOLO_MISSION.id],
				[SOLO_MISSION.id],
			])
			expect(openMission).not.toHaveBeenCalled()

			fireEvent.click(openButton)

			expect(openMission).toHaveBeenCalledWith(SOLO_MISSION.id)
			expect(openMissionInNewTab).toHaveBeenCalledTimes(2)
		},
	)

	it("carries the new state of a mission on its card", async () => {
		const announce: { toPanel: ((changed: MissionChanged) => void) | null } = {
			toPanel: null,
		}
		listenToMissions.mockImplementation((listener) => {
			announce.toPanel = listener
			return Promise.resolve(() => undefined)
		})
		listMissions.mockResolvedValue({ open: [SOLO_MISSION], done: [] })
		render(screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(
			missionCard().querySelector('[data-slot="mission-state-pill"]'),
		).toBeNull()

		listMissions.mockResolvedValue({
			open: [{ ...SOLO_MISSION, state: "waiting_human" }],
			done: [],
		})
		announce.toPanel?.({
			missionId: SOLO_MISSION.id,
			spaceId: null,
			state: "waiting_human",
			stateSeq: 2,
			isAgentRunning: false,
			lastActivityAt: null,
		})
		await settle()

		expect(within(missionCard()).getByText("Blocked on you")).toBeTruthy()
	})

	it("keeps a closed mission in the transcript with the state it ended on", async () => {
		listMissions.mockResolvedValue({ open: [], done: [CLOSED_SOLO_MISSION] })
		render(screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		const card = missionCard().querySelector('[data-slot="mission-card"]')
		expect(card?.getAttribute("data-closed")).toBe("true")
		expect(within(missionCard()).getByText("Completed")).toBeTruthy()
	})

	it("dates the missions of the Activity panel by the roster clock", async () => {
		listMissions.mockResolvedValue({
			open: [{ ...SOLO_MISSION, openedAt: Date.now() - TWO_HOURS_MS }],
			done: [],
		})
		render(screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await openRoutinesPanel()

		expect(within(missionsSection()).getByText("2h")).toBeTruthy()
	})

	it("leaves the transcript without a mission card when the missions could not be read", async () => {
		listMissions.mockRejectedValue(new Error("refused"))
		render(screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(missionCards()).toHaveLength(0)
		expect(screen.getByText("held")).toBeTruthy()
	})

	it("names the missions when they are the read that failed", async () => {
		listMissions.mockRejectedValue(new Error("refused"))
		render(screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await openRoutinesPanel()
		expect(screen.getByText(READ_MISSIONS_TITLE)).toBeTruthy()
		expect(screen.queryByText(READ_ROUTINES_TITLE)).toBeNull()

		listMissions.mockResolvedValue({ open: [], done: [] })
		fireEvent.click(screen.getByRole("button", { name: "Retry" }))
		await settle()

		expect(screen.queryByText(READ_MISSIONS_TITLE)).toBeNull()
		await openRoutinesScreen()
		expect(screen.getByText(SOLO_ROUTINE.title)).toBeTruthy()
	})

	it("covers both reads with one notice when neither came back", async () => {
		listRoutines.mockRejectedValue(new Error("refused"))
		listMissions.mockRejectedValue(new Error("refused"))
		render(screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await openRoutinesPanel()
		expect(screen.getByText("Couldn’t load the activity")).toBeTruthy()
		expect(screen.queryByText(READ_MISSIONS_TITLE)).toBeNull()
		expect(screen.queryByText(READ_ROUTINES_TITLE)).toBeNull()

		listRoutines.mockResolvedValue([SOLO_ROUTINE])
		listMissions.mockResolvedValue({ open: [], done: [] })
		fireEvent.click(screen.getByRole("button", { name: "Retry" }))
		await settle()

		expect(listRoutines).toHaveBeenCalledTimes(2)
		expect(listMissions).toHaveBeenCalledTimes(2)
		await openRoutinesScreen()
		expect(screen.getByText(SOLO_ROUTINE.title)).toBeTruthy()
	})

	it("forgets the reply target of the thread left behind", async () => {
		const first = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
		})
		const second = threadOf({
			id: "bot-2",
			name: "Vex",
			said: "the second answer",
		})
		const { rerender } = render(screenOf(first), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		fireEvent.click(screen.getAllByRole("button", { name: "Reply" })[0])
		expect(screen.getByRole("button", { name: "Cancel reply" })).toBeTruthy()

		rerender(screenOf(second))
		await settle()

		expect(screen.queryByRole("button", { name: "Cancel reply" })).toBeNull()
	})

	it("drops the pages of the solo thread left behind for a conversation", async () => {
		const left: string[] = []
		const thread = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			controller: stubController({
				leave: (botId) => {
					left.push(botId)
				},
			}),
		})
		const room = await roomOf({ names: ["Ada"] })
		const { rerender } = render(screenOf(thread), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()
		expect(left).toEqual([])

		rerender(screenOf(room.thread))
		await settle()

		expect(left).toEqual(["bot-1"])
	})

	it("reads back the reason a session died, and the bare exit code when it left none", async () => {
		const refusal = "refusing to start: the credentials file is unreadable"
		const reported: ChatError = {
			id: "crashed-1",
			error: { kind: "crashed", code: 1, detail: refusal },
		}
		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})

		const { unmount } = render(
			screenOf(
				threadOf({ id: "bot-1", name: "Nyx", said: "hi", errors: [reported] }),
			),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		expect(
			within(raisedNotice(CRASH_TITLE)).getByText(
				`Nyx exited (code 1): ${refusal}. Restart the session.`,
			),
		).toBeTruthy()

		unmount()
		const withoutCode: ChatError = {
			id: "crashed-2",
			error: { kind: "crashed", code: null, detail: refusal },
		}
		const { unmount: unmountUnknown } = render(
			screenOf(
				threadOf({
					id: "bot-1",
					name: "Nyx",
					said: "hi",
					errors: [withoutCode],
				}),
			),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		expect(
			within(raisedNotice(CRASH_TITLE)).getByText(
				`Nyx exited (code unknown): ${refusal}. Restart the session.`,
			),
		).toBeTruthy()

		unmountUnknown()
		render(
			screenOf(
				threadOf({ id: "bot-1", name: "Nyx", said: "hi", errors: [CRASH] }),
			),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		expect(
			within(raisedNotice(CRASH_TITLE)).getByText(
				"Nyx exited (code 1). Restart the session.",
			),
		).toBeTruthy()
	})

	it("leaves a dismissed companion failure dismissed when the reader returns", async () => {
		const opened = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			errors: [CRASH],
		})
		let state = opened.chat.state
		const controller = stubController({
			dismissError: (id) => {
				state = chatReducer(state, { type: "errorDismissed", id }, 0)
			},
		})
		const shown = (): BotThread => ({ ...opened, chat: { state, controller } })
		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		const { unmount } = render(screenOf(shown()), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(raisedNotices(CRASH_TITLE)).toHaveLength(1)

		await closeNotice(CRASH_TITLE)
		unmount()
		render(screenOf(shown()), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(raisedNotices(CRASH_TITLE)).toHaveLength(0)
	})

	it("raises one notice for one failure however often the thread renders, and none above the composer", async () => {
		const thread = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			errors: [CRASH],
		})
		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		const { rerender } = render(screenOf(thread), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()
		rerender(screenOf({ ...thread }))
		await settle()

		expect(raisedNotices(CRASH_TITLE)).toHaveLength(1)
		expect(screen.queryByRole("button", { name: "Dismiss notice" })).toBeNull()
	})

	it("dismisses the failure whose notice the reader closes", async () => {
		const dismissed: string[] = []
		const thread = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			errors: [CRASH],
			controller: stubController({
				dismissError: (id) => {
					dismissed.push(id)
				},
			}),
		})
		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		render(screenOf(thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await closeNotice(CRASH_TITLE)

		expect(dismissed).toEqual([CRASH.id])
		expect(raisedNotices(CRASH_TITLE)).toHaveLength(0)
	})

	it("restarts the companion and closes the notice of the failure it answers", async () => {
		const opened = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			errors: [CRASH],
		})
		let state = opened.chat.state
		const restart = vi.fn(async () => null)
		const controller = stubController({
			restart,
			dismissError: (id) => {
				state = chatReducer(state, { type: "errorDismissed", id }, 0)
			},
		})
		const shown = (): BotThread => ({ ...opened, chat: { state, controller } })
		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		const { rerender } = render(screenOf(shown()), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await pressInNotice(CRASH_TITLE, "Restart session")
		rerender(screenOf(shown()))
		await settle()

		expect(restart).toHaveBeenCalledOnce()
		expect(state.errors).toEqual([])
		expect(raisedNotices(CRASH_TITLE)).toHaveLength(0)
	})

	it("closes the notice once its failure leaves the thread, and when the thread closes", async () => {
		const failing = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			errors: [CRASH],
		})
		const recovered = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
		})
		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		const { rerender, unmount } = render(screenOf(failing), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()
		rerender(screenOf(recovered))
		await settle()

		expect(raisedNotices(CRASH_TITLE)).toHaveLength(0)

		rerender(screenOf(failing))
		await settle()
		expect(raisedNotices(CRASH_TITLE)).toHaveLength(1)
		unmount()
		await settle()

		expect(raisedNotices(CRASH_TITLE)).toHaveLength(0)
	})

	it("shows the failure that came after the one the reader dismissed", async () => {
		const dismissed = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			errors: [CRASH],
		})
		const later = chatReducer(
			dismissed.chat.state,
			{ type: "errorDismissed", id: CRASH.id },
			0,
		)

		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		render(
			screenOf({
				...dismissed,
				chat: {
					...dismissed.chat,
					state: { ...later, errors: [SPAWN_FAILURE] },
				},
			}),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		expect(raisedNotices(SPAWN_TITLE)).toHaveLength(1)
	})

	it("leaves a dismissed conversation failure dismissed when the reader returns", async () => {
		const store = refusingOlderStore()
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: [],
		})
		const runtimes = createConversationRuntimes(createScriptedDriver(), store)
		const thread: Thread = {
			kind: "conversation",
			conversation,
			runtimes,
			onOpenSettings: () => undefined,
		}
		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		const { unmount } = render(screenOf(thread), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		fireEvent.click(screen.getByRole("button", { name: "Load older messages" }))
		await settle()
		expect(raisedNotices(READ_TITLE)).toHaveLength(1)

		await closeNotice(READ_TITLE)
		expect(raisedNotices(READ_TITLE)).toHaveLength(0)

		unmount()
		render(screenOf(thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(raisedNotices(READ_TITLE)).toHaveLength(0)
	})

	it("names another person's pinned message after that person", async () => {
		const pinned = message({
			id: "m-tom",
			conversationId: "c-bot-1",
			role: "user",
			content: "ship it",
			authorAccountId: "account-tom",
			authorName: "Tom",
			writtenFrom: "relay",
		})
		const thread = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			controller: stubController({
				pins: async () => [{ message: pinned, blockIndex: 0, pinnedAt: 1 }],
			}),
		})
		render(screenOf(thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()
		await press("Pinned messages, 1 pinned")

		expect(
			screen.getByRole("button", { name: "Jump to the message from Tom" }),
		).toBeTruthy()
		expect(
			screen.queryByRole("button", { name: "Jump to the message from Reader" }),
		).toBeNull()
	})

	it("tells the reader when the pinned messages could not be read", async () => {
		const thread = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			controller: stubController({
				pins: () => Promise.reject(new Error("refused")),
			}),
		})
		render(screenOf(thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(screen.getByText(PINS_TITLE)).toBeTruthy()

		fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }))

		expect(screen.queryByText(PINS_TITLE)).toBeNull()
	})

	it("shows no notice for a token a finished turn wrote and nobody answered", async () => {
		const room = await roomOf({ names: ["Ada"] })
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), HANDED_TO_NOBODY)
		})
		await settle()

		expect(screen.queryByText(UNRESOLVED_MENTION_TITLE)).toBeNull()
		expect(screen.queryByText(/didn’t start/)).toBeNull()
	})

	it("writes the title of the companion record next to the author of that companion id", async () => {
		const room = await roomOf({ names: ["Ada"], spoken: [SAID_BEFORE] })
		render(
			screenOf(
				room.thread,
				room.bots.map((bot) => ({ ...bot, title: BOT_TITLE })),
			),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		expect(screen.getByText(SAID_BEFORE.text)).toBeTruthy()
		expect(screen.getByText(BOT_TITLE)).toBeTruthy()
	})

	it("leaves the author of a participant no companion record matches with no title", async () => {
		const room = await roomOf({ names: ["Ada"], spoken: [SAID_BEFORE] })
		render(
			screenOf(room.thread, [
				{ ...room.bots[0], id: "bot-elsewhere", title: BOT_TITLE },
			]),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		expect(screen.getByText(SAID_BEFORE.text)).toBeTruthy()
		expect(screen.queryByText(BOT_TITLE)).toBeNull()
	})

	it("names a run of consecutive messages once and marks its gutter once", async () => {
		const room = await runRoomOf()
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(nameLineOf(ADA_OPENS.text)).toContain("Ada")
		expect(nameLineOf(ADA_CLOSES.text)).toBeNull()
		expect(gutterAvatarOf(ADA_OPENS.text)).toBeNull()
		expect(gutterAvatarOf(ADA_CLOSES.text)).not.toBeNull()
	})

	it("opens a second run with its own name line and gutter avatar when the author changes", async () => {
		const room = await runRoomOf()
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(
			document.querySelectorAll('[data-slot="chat-turn-group"]'),
		).toHaveLength(2)
		expect(nameLineOf(NYX_ANSWERS.text)).toContain("Nyx")
		expect(gutterAvatarOf(NYX_ANSWERS.text)).not.toBeNull()
	})

	it("carries the mark of a run on the message that closes it", async () => {
		const room = await runRoomOf()
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(markOf(ADA_OPENS.text)).toBeNull()
		expect(markOf(ADA_CLOSES.text)).not.toBeNull()
		expect(markOf(NYX_ANSWERS.text)).not.toBeNull()
	})

	it("shapes the bubble that opens a run of user messages apart from the one that closes it", async () => {
		const room = await roomOf({
			names: ["Ada"],
			spoken: [ASKED_FIRST, ASKED_AGAIN],
		})
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(bubbleShapeOf(ASKED_FIRST.text)).not.toEqual(
			bubbleShapeOf(ASKED_AGAIN.text),
		)
	})

	it("shapes the bubble that opens a queued run apart from the one that closes it", async () => {
		const solo = await queuedSoloOf([QUEUED_FIRST, QUEUED_LAST])
		render(screenOf(solo.thread()), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(screen.getAllByText(WAITING_TO_BE_SENT)).toHaveLength(2)
		expect(bubbleShapeOf(QUEUED_FIRST)).not.toEqual(bubbleShapeOf(QUEUED_LAST))
	})

	it("shapes a lone queued bubble apart from both ends of a queued run", async () => {
		const grouped = await queuedSoloOf([QUEUED_FIRST, QUEUED_LAST])
		const run = render(screenOf(grouped.thread()), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()
		const ends = [bubbleShapeOf(QUEUED_FIRST), bubbleShapeOf(QUEUED_LAST)]

		run.unmount()
		const lone = await queuedSoloOf([QUEUED_FIRST])
		render(screenOf(lone.thread()), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(screen.getAllByText(WAITING_TO_BE_SENT)).toHaveLength(1)
		expect(ends).not.toContain(bubbleShapeOf(QUEUED_FIRST))
	})

	it("names the routine on the turn its report opened", async () => {
		const room = await roomOf({
			names: ["Ada"],
			spoken: [REPORTED],
			readReportedRuns: reportedRunsOf(REPORT_TURN),
		})
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(screen.getByText(REPORT_TEXT)).toBeTruthy()
		expect(screen.getByText(ROUTINE_TITLE)).toBeTruthy()
	})

	it("leaves a turn outside the reported runs with no routine line", async () => {
		const room = await roomOf({
			names: ["Ada"],
			spoken: [REPORTED],
			readReportedRuns: reportedRunsOf("t-elsewhere"),
		})
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(screen.getByText(REPORT_TEXT)).toBeTruthy()
		expect(screen.queryByText(ROUTINE_TITLE)).toBeNull()
	})

	it("holds no routine line on a turn stopped before its first word", async () => {
		const room = await roomOf({
			names: ["Ada"],
			spoken: [STOPPED_BEFORE_WRITING],
			readReportedRuns: reportedRunsOf("t-stopped"),
		})
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(causeTitles()).toEqual([])
		expect(screen.queryByText(ROUTINE_TITLE)).toBeNull()
	})

	it("keeps the transcript and reports a failed read of the reported runs", async () => {
		const room = await roomOf({
			names: ["Ada"],
			spoken: [REPORTED],
			readReportedRuns: REFUSED_REPORTED_RUNS,
		})
		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(screen.getByText(REPORT_TEXT)).toBeTruthy()
		expect(screen.queryByText(ROUTINE_TITLE)).toBeNull()
		expect(screen.getAllByText(CAUSES_TITLE).length).toBeGreaterThan(0)
	})

	it("names the routine on a report a minute after a message of the same companion", async () => {
		const room = await roomOf({
			names: ["Ada"],
			spoken: [SAID_BEFORE, REPORTED, SAID_AFTER],
			readReportedRuns: reportedRunsOf(REPORT_TURN),
		})
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		const opened = screen
			.getByText(ROUTINE_TITLE)
			.closest('[data-slot="chat-turn-group"]')

		expect(opened?.textContent).toContain(REPORT_TEXT)
		expect(opened?.textContent).not.toContain(SAID_BEFORE.text)
		expect(opened?.textContent).not.toContain(SAID_AFTER.text)
		expect(screen.getByText(SAID_AFTER.text)).toBeTruthy()
	})

	it("raises one notice however many times the reader enters on a failing read", async () => {
		const room = await roomOf({
			names: ["Ada"],
			spoken: [REPORTED],
			readReportedRuns: REFUSED_REPORTED_RUNS,
		})
		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		const { unmount } = render(screenOf(room.thread), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()
		const raised = screen.getAllByText(CAUSES_TITLE).length

		unmount()
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(screen.getAllByText(CAUSES_TITLE)).toHaveLength(raised)
	})

	it("names the routine on the report turn of a solo thread", async () => {
		const solo = await soloOf({
			spoken: [REPORTED],
			readReportedRuns: reportedRunsOf(REPORT_TURN),
		})
		render(screenOf(solo.thread()), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(screen.getByText(REPORT_TEXT)).toBeTruthy()
		expect(screen.getByText(ROUTINE_TITLE)).toBeTruthy()
	})

	it("shows a report written while the solo thread is open", async () => {
		const solo = await soloOf({ spoken: [SAID_BEFORE] })
		const { rerender } = render(screenOf(solo.thread()), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(screen.queryByText(REPORT_TEXT)).toBeNull()

		await solo.report(REPORT_TEXT)
		rerender(screenOf(solo.thread()))
		await settle()

		expect(screen.getByText(REPORT_TEXT)).toBeTruthy()
		expect(screen.getByText(ROUTINE_TITLE)).toBeTruthy()
	})

	it("keeps the solo transcript and reports a failed read of the runs", async () => {
		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		const solo = await soloOf({
			spoken: [REPORTED],
			readReportedRuns: REFUSED_REPORTED_RUNS,
		})
		render(screenOf(solo.thread()), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(screen.getByText(REPORT_TEXT)).toBeTruthy()
		expect(screen.queryByText(ROUTINE_TITLE)).toBeNull()
		expect(screen.getAllByText(CAUSES_TITLE).length).toBeGreaterThan(0)
		expect(screen.getAllByText(CAUSES_SOLO_DESCRIPTION).length).toBeGreaterThan(
			0,
		)
	})

	it("keeps what a solo companion wrote above the question it asks", async () => {
		const solo = await soloOf({})
		const { rerender } = render(screenOf(solo.thread()), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await solo.send("hold the wall")
		await solo.push([...FIRST_TOKEN, ...ASKED])
		rerender(screenOf(solo.thread()))

		expect(screen.getByText("the walls hold")).toBeTruthy()
		expect(rowIndexOf("Which wall holds?")).toBe(-1)
		expect(askedForm()).toBeTruthy()

		await solo.push(WRITING_LANDED)
		rerender(screenOf(solo.thread()))

		expect(screen.getByText("the walls hold")).toBeTruthy()
	})

	it("asks in the composer slot instead of a bubble", async () => {
		await askedSolo()

		expect(askedForm()).toBeTruthy()
		expect(composerField()).toBeNull()
		expect(rowIndexOf("Which wall holds?")).toBe(-1)
	})

	it("picks an option from a digit key and leaves the transcript and the chords alone", async () => {
		await askedSolo()
		const viewport = document.querySelector<HTMLElement>(
			'[data-slot="message-scroller-viewport"]',
		)
		const scrolledTo = viewport?.scrollTop

		const digit = new KeyboardEvent("keydown", {
			key: "2",
			code: "Digit2",
			bubbles: true,
			cancelable: true,
		})
		const chord = new KeyboardEvent("keydown", {
			key: "1",
			code: "Digit1",
			metaKey: true,
			bubbles: true,
			cancelable: true,
		})
		await act(async () => {
			document.body.dispatchEvent(digit)
			document.body.dispatchEvent(chord)
		})

		expect(screen.queryAllByRole("radio", { checked: true })).toEqual([
			screen.getByRole("radio", { name: "South" }),
		])
		expect(chord.defaultPrevented).toBe(false)
		expect(viewport?.scrollTop).toBe(scrolledTo)
	})

	it("folds into the waiting bar and unfolds with the pick still held", async () => {
		await askedSolo()

		await pickNorth()
		await press("Minimize")

		expect(screen.queryByRole("form", { name: "Which wall holds?" })).toBeNull()
		expect(screen.getByText("Ada is waiting on your answer")).toBeTruthy()
		expect(composerField()).toBeNull()

		await press("Answer Ada is waiting on your answer")

		expect(askedForm()).toBeTruthy()
		expect(
			screen.getByRole("radio", { name: "North" }).getAttribute("aria-checked"),
		).toBe("true")
	})

	it("brings the composer back and records the answer as a card of the companion", async () => {
		const { solo, rerender } = await askedSolo()

		await pickNorth()
		await press("Send answers")
		await solo.push([
			{ type: "permissionResolved", id: "ask-2", decision: "allowOnce" },
		])
		await rerender()

		expect(composerField()).toBeTruthy()
		expect(screen.queryByRole("form", { name: "Which wall holds?" })).toBeNull()
		expect(answeredCardText()).toContain("You answered")
		expect(answeredCardText()).toContain("Faces the sun")
		expect(
			transcriptRows().filter((row) => row.includes("North")),
		).toHaveLength(1)
		expect(answeredCardFrom()).toBe("assistant")
	})

	it("counts the solo working row from the instant the turn began", async () => {
		const clock = vi.spyOn(Date, "now").mockReturnValue(TURN_STARTED_AT)
		const solo = await soloOf({})
		const { rerender, unmount } = render(screenOf(solo.thread()), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await solo.send("hold the wall")
		rerender(screenOf(solo.thread()))
		await settle()

		expect(screen.getByText("Ada is thinking…")).toBeTruthy()
		expect(elapsedText()).toBe("0s")

		clock.mockReturnValue(TURN_STARTED_AT + 3 * A_SECOND)
		await solo.push(SEARCHING)
		rerender(screenOf(solo.thread()))
		await settle()

		expect(screen.getByText("Ada · Grep · walls")).toBeTruthy()

		unmount()
		render(screenOf(solo.thread()), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(elapsedText()).toBe("3s")
		clock.mockRestore()
	})

	it("tells a queued seat from a speaker blocked on a question", async () => {
		const room = await roomOf({ names: ["Ada", "Nyx", "Zoe"] })
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await room.send("@Ada @Nyx now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), HANDED_TO_ZOE)
			room.driver.pushTo(room.idOf("Nyx"), ASKED)
		})
		await settle()

		expect(screen.getByText("Zoe is up next…")).toBeTruthy()
		expect(
			screen.getByText("Nyx is waiting for you… · Which wall holds?"),
		).toBeTruthy()
	})

	it("stops the companion whose working row carries the stop, and no other", async () => {
		const room = await roomOf({ names: ["Ada", "Nyx"] })
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await room.send("@Ada @Nyx now")

		expect(stopFor("Nyx")).toBeTruthy()
		fireEvent.click(screen.getByRole("button", { name: "Stop Ada" }))
		await settle()

		expect(room.driver.cancelled).toEqual([room.idOf("Ada")])
		expect(stopFor("Nyx")).toBeTruthy()
	})

	it("leaves no stop on the waiting row of a companion holding no seat", async () => {
		const room = await roomOf({ names: ["Ada", "Nyx"] })
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await room.send("@Ada now")
		await room.send("@Nyx after")

		expect(stopFor("Ada")).toBeTruthy()
		expect(stopFor("Nyx")).toBeNull()
	})

	it("clocks the working row of a seated companion from the start of its turn", async () => {
		const room = await roomOf({ names: ["Ada"] })
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await room.send("@Ada now")

		expect(elapsedText()).toMatch(/^\d+s$/)
	})

	it("stops a writing companion from its working row alone", async () => {
		const room = await roomOf({ names: ["Ada"] })
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), WRITING)
		})
		await settle()

		expect(screen.getByText("the walls hold")).toBeTruthy()
		expect(stopsFor("Ada")).toHaveLength(1)
		fireEvent.click(stopsFor("Ada")[0])
		await settle()

		expect(room.driver.cancelled).toEqual([room.idOf("Ada")])
	})

	it("holds a seated companion on its waiting row until it publishes a block", async () => {
		const room = await roomOf({ names: ["Ada"] })
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), FIRST_TOKEN)
		})
		await settle()

		expect(screen.queryByText("the walls hold")).toBeNull()
		expect(screen.getByText("Ada is thinking…")).toBeTruthy()
		expect(stopFor("Ada")).toBeTruthy()
	})

	it("keeps the working row of a seated companion that has published a block", async () => {
		const room = await roomOf({ names: ["Ada"] })
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), FIRST_TOKEN)
			room.driver.pushTo(room.idOf("Ada"), BLOCK_CLOSED)
		})
		await settle()

		expect(screen.getByText("the walls hold")).toBeTruthy()
		expect(screen.getByText("Ada is writing…")).toBeTruthy()

		expect(stopsFor("Ada")).toHaveLength(1)
		fireEvent.click(stopsFor("Ada")[0])
		await settle()

		expect(room.driver.cancelled).toEqual([room.idOf("Ada")])
	})

	it("keeps what a speaker wrote above the question it asks", async () => {
		const room = await roomOf({ names: ["Ada"] })
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), FIRST_TOKEN)
			room.driver.pushTo(room.idOf("Ada"), ASKED)
		})
		await settle()

		expect(screen.getByText("the walls hold")).toBeTruthy()
		expect(rowIndexOf("Which wall holds?")).toBe(-1)
		expect(askedForm()).toBeTruthy()

		act(() => {
			room.driver.pushTo(room.idOf("Ada"), WRITING_LANDED)
		})
		await settle()

		expect(screen.getByText("the walls hold")).toBeTruthy()
	})

	it("keeps the working row of a companion asking after it published a block", async () => {
		const room = await roomOf({ names: ["Ada"] })
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), FIRST_TOKEN)
			room.driver.pushTo(room.idOf("Ada"), BLOCK_CLOSED)
			room.driver.pushTo(room.idOf("Ada"), ASKED)
		})
		await settle()

		expect(
			screen.getByText("Ada is waiting for you… · Which wall holds?"),
		).toBeTruthy()
	})

	it("draws one row for a speaking companion another speaker hands over to", async () => {
		const room = await roomOf({ names: ["Ada", "Nyx"] })
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await room.send("@Ada @Nyx now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), FIRST_TOKEN)
			room.driver.pushTo(room.idOf("Ada"), BLOCK_CLOSED)
			room.driver.pushTo(room.idOf("Nyx"), HANDED_TO_ADA)
		})
		await settle()

		expect(screen.getAllByText(/^Ada is /)).toHaveLength(1)
		expect(screen.getByText("Ada is writing…")).toBeTruthy()
	})

	it("leaves no stop on the turn a companion has landed", async () => {
		const room = await roomOf({ names: ["Ada"] })
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), SAID_AND_LANDED)
		})
		await settle()

		expect(screen.getByText("the walls hold")).toBeTruthy()
		expect(screen.queryByText("Ada is writing…")).toBeNull()
		expect(stopFor("Ada")).toBeNull()
	})

	it("places the events of a mission thread among its messages by date", async () => {
		const room = await missionRoomOf({
			events: [MISSION_ESCALATED, MISSION_OPENED],
			spoken: [MISSION_SAID],
		})
		render(screenOf(room.thread, room.bots), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		const rows = transcriptRows()

		expect(rows).toHaveLength(3)
		expect(rows[0]).toContain("Mission opened by")
		expect(rows[1]).toContain(MISSION_SAID.text)
		expect(rows[2]).toContain(MISSION_ESCALATED.text)
	})

	it("renders the events of a mission thread holding no message alone", async () => {
		const room = await missionRoomOf({ events: [MISSION_OPENED] })
		render(screenOf(room.thread, room.bots), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(screen.getByText(/Mission opened by/)).toBeTruthy()
		expect(
			document.querySelector('[data-slot="conversation-empty-state"]'),
		).toBeNull()
	})

	it("shows a working row for the companion a mission thread summons", async () => {
		const room = await missionRoomOf({ events: [] })
		render(screenOf(room.thread, room.bots), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await room.send("@Ada now")

		expect(stopFor("Ada")).toBeTruthy()
	})

	it("opens a mission thread on a cause line instead of the summons", async () => {
		const room = await missionRoomOf({
			events: [],
			spoken: [MISSION_SUMMONS, MISSION_SAID],
		})
		render(screenOf(room.thread, room.bots), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await room.send("and the tests?")

		expect(screen.queryByText(MISSION_SUMMONS.text)).toBeNull()

		const said = screen
			.getByText(MISSION_SAID.text)
			.closest('[data-slot="message"]')

		const cause = said?.querySelector('[data-slot="turn-cause"]')

		expect(cause?.textContent).toContain(SUMMONS_ANNOUNCEMENT)
		expect(
			cause?.querySelector('[data-slot="turn-cause-title"]')?.textContent,
		).toBe(SUMMONS_CAUSE)

		const asked = screen.getAllByLabelText("user message")

		expect(asked).toHaveLength(1)
		expect(asked[0].textContent).toContain("and the tests?")
	})

	it("holds no cause line when the reader speaks before the summoned companion", async () => {
		const room = await missionRoomOf({
			events: [],
			spoken: [MISSION_SUMMONS, MISSION_ASKED, MISSION_SAID],
		})
		render(screenOf(room.thread, room.bots), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(screen.queryByText(MISSION_SUMMONS.text)).toBeNull()
		expect(screen.getByText(MISSION_ASKED.text)).toBeTruthy()
		expect(causeTitles()).toEqual([])
	})

	it("marks every summoned run of a mission thread with its own cause line", async () => {
		const room = await missionRoomOf({
			events: [],
			spoken: [
				MISSION_SUMMONS,
				MISSION_SAID,
				SUMMONS_AGAIN,
				MISSION_SAID_AGAIN,
			],
		})
		render(screenOf(room.thread, room.bots), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(causeTitles()).toEqual([SUMMONS_CAUSE, SUMMONS_AGAIN_CAUSE])
	})

	it("disables the composer of a closed mission thread", async () => {
		const room = await missionRoomOf({ events: [], closedAt: A_MINUTE })
		render(screenOf(room.thread, room.bots), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(screen.getByRole("textbox").hasAttribute("disabled")).toBe(true)
	})

	it("stops the solo companion from the row it works on", async () => {
		const thread = threadOf({ id: "bot-1", name: "Nyx", said: "the answer" })
		const cancelled: string[] = []
		render(
			screenOf({
				...thread,
				chat: {
					state: { ...thread.chat.state, turn: "running" },
					controller: stubController({
						stop: async () => {
							cancelled.push("Nyx")
						},
					}),
				},
			}),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		fireEvent.click(screen.getByRole("button", { name: "Stop Nyx" }))
		await settle()

		expect(cancelled).toEqual(["Nyx"])
	})

	it("stops the turn the solo companion runs in another conversation", async () => {
		const thread = threadOf({ id: "bot-1", name: "Nyx", said: "the answer" })
		const cancelled: string[] = []
		render(
			screenOf({
				...thread,
				chat: {
					state: {
						...thread.chat.state,
						foreignTurn: {
							scope: {
								conversationId: "elsewhere",
								botId: "bot-1",
								runtimeSessionId: "run-of-another-window",
								epoch: 1,
							},
							activities: [],
							startedAt: 1,
							hasWritten: false,
							permission: null,
							question: null,
						},
					},
					controller: stubController({
						stop: async () => {
							cancelled.push("Nyx")
						},
					}),
				},
			}),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		fireEvent.click(screen.getByRole("button", { name: "Stop Nyx" }))
		await settle()

		expect(cancelled).toEqual(["Nyx"])
	})

	it("opens a searched message centred, highlighted and paged both ways", async () => {
		const room = await longRoomOf()
		const landings = createMessageLandingController()
		landings.record({
			conversationId: room.thread.conversation.id,
			messageId: LANDED_MESSAGE_ID,
			seq: LANDED_SEQ,
		})

		render(
			screenOf(room.thread, room.bots, () => undefined, landings),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		expect(screen.getByText(textOfTurn(LANDED_SEQ))).toBeTruthy()
		expect(anchorOf(LANDED_MESSAGE_ID)?.getAttribute("data-highlighted")).toBe(
			"true",
		)
		expect(landings.getState()).toBeNull()

		const landed = shownTurnNumbers()
		const oldestLanded = Math.min(...landed)
		const newestLanded = Math.max(...landed)

		fireEvent.click(screen.getByRole("button", { name: "Load older messages" }))
		await settle()

		expect(Math.min(...shownTurnNumbers())).toBeLessThan(oldestLanded)

		fireEvent.click(screen.getByRole("button", { name: "Load newer messages" }))
		await settle()

		expect(Math.max(...shownTurnNumbers())).toBeGreaterThan(newestLanded)
	})
	it("returns a left landing to the newest page with nothing newer to load", async () => {
		const room = await longRoomOf()
		const landings = createMessageLandingController()
		landings.record({
			conversationId: room.thread.conversation.id,
			messageId: LANDED_MESSAGE_ID,
			seq: LANDED_SEQ,
		})

		const { unmount } = render(
			screenOf(room.thread, room.bots, () => undefined, landings),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()
		expect(shownTurnNumbers()).toContain(LANDED_SEQ)

		unmount()
		render(screenOf(room.thread, room.bots), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(Math.max(...shownTurnNumbers())).toBe(LONG_ROOM_TURNS)
		expect(
			screen.queryByRole("button", { name: "Load newer messages" }),
		).toBeNull()
	})
	it("shows a prompt sent from a landed thread and the reply to it", async () => {
		const room = await longRoomOf()
		const landings = createMessageLandingController()
		landings.record({
			conversationId: room.thread.conversation.id,
			messageId: LANDED_MESSAGE_ID,
			seq: LANDED_SEQ,
		})

		render(
			screenOf(room.thread, room.bots, () => undefined, landings),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()
		expect(shownTurnNumbers()).toContain(LANDED_SEQ)

		await room.send("hold the line")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), WRITING)
		})
		await settle()

		expect(screen.getByText("hold the line")).toBeTruthy()
		expect(screen.getByText("the walls hold")).toBeTruthy()
	})
	it("gives up on a landing the window it read does not hold", async () => {
		const room = await longRoomOf()
		const landings = createMessageLandingController()
		landings.record({
			conversationId: room.thread.conversation.id,
			messageId: "m-t-nowhere",
			seq: LANDED_SEQ,
		})

		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		render(
			screenOf(room.thread, room.bots, () => undefined, landings),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		expect(landings.getState()).toBeNull()
		expect(screen.getAllByText(UNREACHABLE_TITLE).length).toBeGreaterThan(0)
	})
	describe("on a joined Space that went away", () => {
		const departedHostOf = (
			departure: DepartureReason | undefined,
		): OpenJoinedHost => ({
			spaceName: "Studio Nord",
			hostName: "Lea",
			isOnline: false,
			isDown: false,
			departure,
		})

		const renderDeparted = async (departure?: DepartureReason) => {
			render(createElement(NoticeSurface), {
				wrapper: createQueryTestWrapper().wrapper,
			})
			render(
				createElement(
					OpenJoinedHostContext.Provider,
					{ value: departedHostOf(departure) },
					screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })),
				),
				{ wrapper: createQueryTestWrapper().wrapper },
			)
			await settle()
		}

		const accessBanner = () =>
			document.querySelector<HTMLElement>('[data-slot="space-access-banner"]')

		it.each(["removed", "deleted", "unknown"] as const)(
			"keeps the transcript and shows the %s banner where the composer was",
			async (reason) => {
				await renderDeparted(reason)

				expect(screen.getByText("held")).toBeTruthy()
				expect(accessBanner()?.dataset.reason).toBe(reason)
				expect(screen.queryByRole("textbox")).toBeNull()
				expect(document.querySelector('[data-slot="toast"]')).toBeNull()
			},
		)

		it("names the Space and its host in the banner", async () => {
			await renderDeparted("deleted")

			expect(
				within(accessBanner() as HTMLElement).getByText(
					"Lea deleted Studio Nord",
				),
			).toBeTruthy()
		})

		it("keeps the composer and shows no banner once the Space is not departed", async () => {
			await renderDeparted()

			expect(accessBanner()).toBeNull()
			expect(screen.getByRole("textbox")).toBeTruthy()
			expect(document.querySelector('[data-slot="toast"]')).toBeNull()
		})
	})

	const STUDIO_HOST: OpenJoinedHost = {
		spaceName: "Studio Nord",
		hostName: "Lea",
		isOnline: false,
		isDown: true,
	}

	describe("on a joined Space waiting for its host", () => {
		const renderWaiting = async (hostWait: HostWait) => {
			render(
				createElement(
					OpenJoinedHostContext.Provider,
					{ value: { ...STUDIO_HOST, hostWait } },
					screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })),
				),
				{ wrapper: createQueryTestWrapper().wrapper },
			)
			await settle()
		}

		const offlineBanner = () =>
			document.querySelector<HTMLElement>(
				'[data-slot="space-access-banner"][data-reason="offline"]',
			)

		it("keeps the transcript and the composer, and shows the offline banner naming why", async () => {
			await renderWaiting({ reason: "hostSilent" })

			expect(screen.getByText("held")).toBeTruthy()
			expect(
				within(offlineBanner() as HTMLElement).getByText(
					"You can read what’s here. Lea hasn’t answered yet, ask them to open Kiroshi on their computer.",
				),
			).toBeTruthy()
			expect(document.querySelector('[data-slot="prompt-input"]')).toBeTruthy()
		})

		it("keeps the generic offline body when the wait names no reason", async () => {
			await renderWaiting({})

			expect(
				within(offlineBanner() as HTMLElement).getByText(
					"You can read what’s here. You can send again once Kiroshi is open on Lea’s computer.",
				),
			).toBeTruthy()
		})
	})

	describe("the pending slot on a joined Space", () => {
		const PERMISSION_ASKED: AgentEvent[] = [
			{
				type: "permissionRequested",
				request: {
					id: "perm-1",
					toolName: "Bash",
					title: "Run the walls check",
					detail: null,
				},
			},
		]

		const askPermissionUnder = async (host: OpenJoinedHost) => {
			const room = await roomOf({ names: ["Ada"] })
			render(
				createElement(
					OpenJoinedHostContext.Provider,
					{ value: host },
					screenOf(room.thread),
				),
				{ wrapper: createQueryTestWrapper().wrapper },
			)
			await settle()
			await room.send("@Ada now")
			act(() => {
				room.driver.pushTo(room.idOf("Ada"), FIRST_TOKEN)
				room.driver.pushTo(room.idOf("Ada"), PERMISSION_ASKED)
			})
			await settle()
		}

		const isApprovalAsked = () =>
			screen.queryAllByText("Run the walls check").length > 0

		it("keeps the approval asked while the host is awaited", async () => {
			await askPermissionUnder({
				...STUDIO_HOST,
				hostWait: { reason: "hostSilent" },
			})

			expect(isApprovalAsked()).toBe(true)
			expect(
				document.querySelector('[data-slot="space-access-banner"]'),
			).toBeTruthy()
		})

		it("drops the approval once the Space departed", async () => {
			await askPermissionUnder({ ...STUDIO_HOST, departure: "removed" })

			expect(isApprovalAsked()).toBe(false)
			expect(document.querySelector('[data-slot="prompt-input"]')).toBeNull()
		})
	})
})

const HEADER_OF_WALLS = "Walls · conversation settings"

const subjectIconIn = (surface: HTMLElement | null) =>
	surface?.querySelector<HTMLElement>('[data-slot="conversation-subject-icon"]')

const pictogramIn = (surface: HTMLElement | null) =>
	subjectIconIn(surface)?.querySelector(
		'[data-slot="conversation-subject-icon-pictogram"]',
	)?.innerHTML

const subjectColourIn = (surface: HTMLElement | null) => {
	const icon = subjectIconIn(surface)
	return {
		hue: icon?.getAttribute("data-hue") ?? null,
		color: icon?.style.color,
		hueProperties: Array.from(icon?.style ?? []).filter((property) =>
			property.startsWith("--hue-"),
		),
	}
}

const FREE_HUE = 210

const NEUTRAL_SUBJECT = {
	hue: null,
	color: "var(--conversation-icon-foreground)",
	hueProperties: [],
}

const drawnPictogramOf = (icon: ConversationIconName) => {
	const { container, unmount } = renderWithoutQueries(
		createElement(ConversationIcons[icon]),
	)
	const markup = container.querySelector("svg")?.innerHTML
	unmount()
	return markup
}

const wearing = (
	thread: ConversationThread,
	look: Pick<Conversation, "icon" | "color">,
): ConversationThread => ({
	...thread,
	conversation: { ...thread.conversation, ...look },
})

describe("ThreadScreen wearing the look of a group conversation", () => {
	let layout: FakeLayout

	beforeEach(() => {
		layout = fakeLayout()
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([])
		listRuns.mockResolvedValue([])
		listSources.mockResolvedValue(SCHEDULE_DECLARED)
		listMissions.mockResolvedValue({ open: [], done: [] })
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		layout.restore()
	})

	it("redraws the header with the icon of a conversation updated while open, neutral whatever its colour", async () => {
		const room = await roomOf({ names: ["Ada", "Zoe"] })
		const { rerender } = render(
			screenOf(wearing(room.thread, { icon: null, color: null }), room.bots),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()
		const header = screen.getByRole("button", { name: HEADER_OF_WALLS })
		expect(pictogramIn(header)).toBe(drawnPictogramOf("MessageSquare"))
		expect(subjectColourIn(header)).toEqual(NEUTRAL_SUBJECT)

		for (const color of [BLOT_HUES.cyan, FREE_HUE]) {
			rerender(
				screenOf(wearing(room.thread, { icon: "Rocket", color }), room.bots),
			)
			await settle()

			const redrawn = screen.getByRole("button", { name: HEADER_OF_WALLS })
			expect(pictogramIn(redrawn)).toBe(drawnPictogramOf("Rocket"))
			expect(subjectColourIn(redrawn)).toEqual(NEUTRAL_SUBJECT)
		}
	})

	it.each([BLOT_HUES.cyan, FREE_HUE, null])(
		"draws the icon of a conversation coloured %s with no message, neutral, in its empty state",
		async (color) => {
			const room = await roomOf({ names: ["Ada", "Zoe"] })
			const { container } = render(
				screenOf(wearing(room.thread, { icon: "Rocket", color }), room.bots),
				{ wrapper: createQueryTestWrapper().wrapper },
			)
			await settle()

			const emptyState = container.querySelector<HTMLElement>(
				'[data-slot="conversation-empty-state"]',
			)
			expect(emptyState?.hasAttribute("color")).toBe(false)
			expect(pictogramIn(emptyState)).toBe(drawnPictogramOf("Rocket"))
			expect(subjectColourIn(emptyState)).toEqual(NEUTRAL_SUBJECT)
		},
	)
})

const leftOutError = (detail: string): ChatError => ({
	id: "serverEnvRejected-0",
	error: { kind: "serverEnvRejected", detail },
})

const APPLICATION_REFUSED = leftOutError(
	'the server "atlas" was left out: it is waiting for you to authorize it',
)

const APPLICATION_REFUSED_TITLE = "Couldn’t start an application"

const LEFT_OUT_TITLE = "atlas was left out"

const REFUSED_APPLICATION: AgentEvent[] = [
	{ type: "failed", error: APPLICATION_REFUSED.error },
]

const CRASHED_SESSION: AgentEvent[] = [{ type: "failed", error: CRASH.error }]

const conversationFailingWith = async (events: AgentEvent[]) => {
	const room = await roomOf({ names: ["Ada"] })
	render(createElement(NoticeSurface), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	render(screenOf(room.thread, room.bots), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await room.send("hold the line")
	act(() => {
		room.driver.pushTo(room.idOf("Ada"), events)
	})
	await settle()
}

const expectNoFailureNotice = () => {
	expect(raisedNotices(LEFT_OUT_TITLE)).toHaveLength(0)
	expect(raisedNotices(APPLICATION_REFUSED_TITLE)).toHaveLength(0)
}

describe("ThreadScreen application left out of a session", () => {
	afterEach(cleanup)

	it("raises no notice on a solo thread", async () => {
		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		render(
			createElement(
				SessionApplicationsContext.Provider,
				{ value: { spaceId: SPACE } },
				screenOf(
					threadOf({
						id: "bot-1",
						name: "Nyx",
						said: "the first answer",
						errors: [APPLICATION_REFUSED],
					}),
				),
			),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		expectNoFailureNotice()
	})

	it("raises no notice on a conversation", async () => {
		await conversationFailingWith(REFUSED_APPLICATION)

		expectNoFailureNotice()
	})

	it("keeps the notice of a session a conversation lost", async () => {
		await conversationFailingWith(CRASHED_SESSION)

		expect(raisedNotices("Ada stopped")).toHaveLength(1)
	})
})

const SIGN_IN_LINK = "https://claude.ai/oauth/authorize?code=true"

const WELCOME_QUESTION = "Ready to start?"

const ACCOUNT_QUESTION = "Use the account already on this machine?"

const CODE_QUESTION = "Paste the code Claude gave you"

const KEY_QUESTION = "Paste your Anthropic API key"

const SIGN_IN_FAILED_QUESTION = "Try again, or use a key instead?"

const FIRST_REPLY_QUESTION = "That’s it working. Ready for the last one?"

const EMPTY_STATE_TITLE = "Start with the agent"

const ONBOARDING_EMAIL = "reader@example.com"

const ONBOARDING_KEY = "sk-ant-kept-out"

const AUTHENTICATED_ANONYMOUSLY = {
	connection: "ready",
	binaryVersion: null,
	authenticated: true,
	error: null,
	account: { email: null, plan: null },
} satisfies AccountReport

type OnboardingFixture = {
	port: FakeOnboardingPort
	world: FakeOnboardingWorld
	controller: OnboardingController
	reportFailure: Mock<(notice: NoticeMessage) => void>
	solo: Solo
}

const onboardingOf = async (): Promise<OnboardingFixture> => {
	const solo = await soloOf({})
	const port = createFakeOnboardingPort()
	const world = createFakeOnboardingWorld()
	world.homeBot = solo.thread().bot.id
	world.send = (text) => solo.thread().chat.controller.send(text)
	const reportFailure = vi.fn<(notice: NoticeMessage) => void>()
	const controller = createOnboardingController(port, world, { reportFailure })

	return { port, world, controller, reportFailure, solo }
}

const press = async (name: string) => {
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name }))
	})
	await settle()
}

const type = async (label: string, text: string) => {
	const field = screen.getByLabelText(label)
	await act(async () => {
		fireEvent.change(field, { target: { value: text } })
	})
	await act(async () => {
		fireEvent.keyDown(field, { key: "Enter" })
	})
	await settle()
}

const isAsking = (question: string) =>
	screen.queryByRole("form", { name: question }) !== null

type OnboardingScreen = {
	refresh: () => Promise<void>
	choose: (label: string) => Promise<void>
	press: (name: string) => Promise<void>
	type: (label: string, text: string) => Promise<void>
}

const onboardingScreen = ({ controller, solo }: OnboardingFixture) =>
	screenOf(
		solo.thread(),
		NO_BOT_RECORDS,
		() => undefined,
		createMessageLandingController(),
		controller,
	)

const renderAsking = async (
	view: () => ReturnType<typeof screenOf>,
): Promise<OnboardingScreen> => {
	const { rerender } = render(view(), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	const refresh = async () => {
		await settle()
		rerender(view())
		await settle()
		rerender(view())
		await settle()
	}
	await refresh()

	return {
		refresh,
		choose: async (label) => {
			await act(async () => {
				fireEvent.click(
					screen.getByRole("radio", {
						name: (name) => name.startsWith(label),
					}),
				)
			})
			await press("Send answers")
			await refresh()
		},
		press: async (name) => {
			await press(name)
			await refresh()
		},
		type: async (label, text) => {
			await type(label, text)
			await refresh()
		},
	}
}

const renderOnboarding = (fixture: OnboardingFixture) =>
	renderAsking(() => onboardingScreen(fixture))

const TYPED_MESSAGE = "Hello, what can you do?"

const GUEST_ACCOUNT = "account-guest"

const GUEST_IN_JOINED_SPACE: ThreadAuthorship = {
	accountId: GUEST_ACCOUNT,
	host: {
		kind: "joined",
		members: [
			{
				userId: "account-lea",
				name: "Lea",
				role: "host",
				deviceId: "device-of-lea",
				fingerprint: ["abandon", "ability", "able", "about", "above", "absent"],
				isPresent: true,
			},
		],
	},
}

const isAnchored = (content: Element) =>
	content
		.closest("[data-scroll-anchor]")
		?.getAttribute("data-scroll-anchor") === "true"

const isBefore = (earlier: Element, later: Element) =>
	(earlier.compareDocumentPosition(later) &
		Node.DOCUMENT_POSITION_FOLLOWING) !==
	0

describe("the first run in a solo thread", () => {
	let layout: FakeLayout

	beforeEach(() => {
		layout = fakeLayout()
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([])
		listRuns.mockResolvedValue([])
		listSources.mockResolvedValue(SCHEDULE_DECLARED)
		listMissions.mockResolvedValue({ open: [], done: [] })
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		layout.restore()
	})

	it("asks the welcome step instead of the chat empty state", async () => {
		const fixture = await onboardingOf()
		await renderOnboarding(fixture)

		expect(isAsking(WELCOME_QUESTION)).toBe(true)
		expect(screen.queryByText(EMPTY_STATE_TITLE)).toBeNull()
		expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull()
	})

	it("keeps the answered welcome step above the account step", async () => {
		const fixture = await onboardingOf()
		fixture.port.report = {
			...AUTHENTICATED_ANONYMOUSLY,
			account: { email: ONBOARDING_EMAIL, plan: "Max" },
		}
		const shown = await renderOnboarding(fixture)

		await shown.choose("Start")

		const [welcome] = screen.getAllByText(WELCOME_QUESTION)
		const account = screen.getByRole("form", { name: ACCOUNT_QUESTION })
		expect(isAsking(WELCOME_QUESTION)).toBe(false)
		expect(screen.getByText("Start")).toBeTruthy()
		expect(welcome && isBefore(welcome, account)).toBe(true)
	})

	it("leaves the answer of a posted step unanchored so it rests at the end", async () => {
		const fixture = await onboardingOf()
		const shown = await renderOnboarding(fixture)

		await shown.choose("Start")

		expect(isAnchored(screen.getByText("Start"))).toBe(false)
	})

	it("leaves a message typed before the thread mounted unanchored", async () => {
		const solo = await soloOf({})
		await solo.send(TYPED_MESSAGE)
		render(screenOf(solo.thread()), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
		expect(isAnchored(screen.getByText(TYPED_MESSAGE))).toBe(false)
		expect(document.querySelector('[data-scroll-anchor="true"]')).toBeNull()
	})

	it("anchors the message the reader sends from the mounted thread", async () => {
		const solo = await soloOf({})
		const soloScreen = () =>
			createElement(ThreadScreenHarness, {
				bots: NO_BOT_RECORDS,
				landings: createMessageLandingController(),
				onOpenMission: () => undefined,
				staging: createAttachmentsController({
					store: async () => [],
					send: (_owner, text) => {
						void solo.thread().chat.controller.send(text)
						return true
					},
				}),
				thread: solo.thread(),
			})
		const shown = render(soloScreen(), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await act(async () => {
			fireEvent.change(screen.getByRole("textbox"), {
				target: { value: TYPED_MESSAGE },
			})
		})
		await press("Send")
		shown.rerender(soloScreen())
		await settle()

		expect(isAnchored(screen.getByText(TYPED_MESSAGE))).toBe(true)
	})

	it("draws the reader's message in a joined space as theirs, sent and stamped", async () => {
		const solo = await soloOf({ senderAccountId: () => GUEST_ACCOUNT })
		const stamped = (thread: BotThread): BotThread => ({
			...thread,
			chat: {
				...thread.chat,
				state: {
					...thread.chat.state,
					messages: thread.chat.state.messages.map((row) =>
						row.role === "user"
							? { ...row, authorAccountId: GUEST_ACCOUNT, authorName: "Sam" }
							: row,
					),
				},
			},
		})
		const joinedScreen = (thread: BotThread) =>
			createElement(
				ThreadAuthorshipContext.Provider,
				{ value: GUEST_IN_JOINED_SPACE },
				createElement(ThreadScreenHarness, {
					bots: NO_BOT_RECORDS,
					landings: createMessageLandingController(),
					onOpenMission: () => undefined,
					staging: createAttachmentsController({
						store: async () => [],
						send: (_owner, text) => {
							void solo.thread().chat.controller.send(text)
							return true
						},
					}),
					thread,
				}),
			)
		const sentBubble = () =>
			screen
				.getByText(TYPED_MESSAGE)
				.closest("article")
				?.getAttribute("aria-label")
		const shown = render(joinedScreen(solo.thread()), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await act(async () => {
			fireEvent.change(screen.getByRole("textbox"), {
				target: { value: TYPED_MESSAGE },
			})
		})
		await press("Send")
		shown.rerender(joinedScreen(solo.thread()))
		await settle()

		expect(sentBubble()).toBe("user message")
		expect(isAnchored(screen.getByText(TYPED_MESSAGE))).toBe(true)

		shown.rerender(joinedScreen(stamped(solo.thread())))
		await settle()

		expect(sentBubble()).toBe("user message")
		expect(screen.queryByText("Lea")).toBeNull()
	})

	it("offers the sign-in when nobody is authenticated", async () => {
		const fixture = await onboardingOf()
		const shown = await renderOnboarding(fixture)

		await shown.choose("Start")

		expect(
			screen.getByRole("radio", {
				name: (name) => name.startsWith("Sign in with Claude"),
			}),
		).toBeTruthy()
	})

	const waitingOnCode = async () => {
		const fixture = await onboardingOf()
		const shown = await renderOnboarding(fixture)
		await shown.choose("Start")
		await shown.choose("Sign in with Claude")
		await act(async () => {
			fixture.port.announceStarted(SIGN_IN_LINK)
		})
		await shown.refresh()

		return { ...fixture, shown }
	}

	it("asks for the code on the url the sign-in announced", async () => {
		const fixture = await waitingOnCode()

		expect(isAsking(CODE_QUESTION)).toBe(true)
		expect(fixture.port.calls).toContainEqual({
			command: "openSignInUrl",
			value: SIGN_IN_LINK,
		})
	})

	it("withdraws the code step the reader leaves for a key", async () => {
		const { shown } = await waitingOnCode()

		await shown.press("Paste a key instead")

		expect(screen.queryByText(CODE_QUESTION)).toBeNull()
		expect(isAsking(KEY_QUESTION)).toBe(true)
	})

	it("keeps the key the reader typed out of the thread", async () => {
		const fixture = await onboardingOf()
		const shown = await renderOnboarding(fixture)
		await shown.choose("Start")
		await shown.choose("Paste an API key")

		await shown.type("Key", ONBOARDING_KEY)

		expect(fixture.port.calls).toContainEqual({
			command: "holdApiKey",
			value: ONBOARDING_KEY,
		})
		expect(screen.queryByText(ONBOARDING_KEY)).toBeNull()
		expect(screen.queryByDisplayValue(ONBOARDING_KEY)).toBeNull()
	})

	it("names the refusal in the step asked after a refused sign-in", async () => {
		const fixture = await onboardingOf()
		const shown = await renderOnboarding(fixture)
		await shown.choose("Start")
		await shown.choose("Sign in with Claude")

		await act(async () => {
			fixture.port.refuseSignIn({
				kind: "failed",
				detail: "auth login exited with 1",
			})
		})
		await shown.refresh()

		expect(isAsking(SIGN_IN_FAILED_QUESTION)).toBe(true)
		expect(screen.getByText("Couldn’t sign you in")).toBeTruthy()
		expect(screen.getByText("auth login exited with 1")).toBeTruthy()
	})

	it("keeps the summons out of the rows and asks the first reply step under the answer", async () => {
		const fixture = await onboardingOf()
		fixture.port.report = AUTHENTICATED_ANONYMOUSLY
		const shown = await renderOnboarding(fixture)
		await shown.choose("Start")

		await fixture.solo.push(SAID_AND_LANDED)
		await shown.refresh()

		expect(screen.queryByText(onboardingSummonsFor("greeting"))).toBeNull()
		expect(screen.getByText("the walls hold")).toBeTruthy()
		expect(isAsking(FIRST_REPLY_QUESTION)).toBe(true)
	})

	it("summons Shoto out of sight and asks nothing more when the reader picks a companion", async () => {
		const fixture = await onboardingOf()
		fixture.port.report = AUTHENTICATED_ANONYMOUSLY
		const shown = await renderOnboarding(fixture)
		await shown.choose("Start")
		await fixture.solo.push(SAID_AND_LANDED)
		await shown.refresh()

		await shown.choose("Pick my first agent")

		expect(
			screen.queryByText(onboardingSummonsFor("firstCompanion")),
		).toBeNull()
		expect(isAsking(FIRST_REPLY_QUESTION)).toBe(false)
		expect(fixture.world.firstRunDone).toBe(1)
	})

	it("leaves the answered first reply step in the thread once the reader keeps talking", async () => {
		const fixture = await onboardingOf()
		fixture.port.report = AUTHENTICATED_ANONYMOUSLY
		const shown = await renderOnboarding(fixture)
		await shown.choose("Start")
		await fixture.solo.push(SAID_AND_LANDED)
		await shown.refresh()

		await shown.choose("Keep talking first")

		expect(fixture.world.firstRunDone).toBe(1)
		expect(isAsking(FIRST_REPLY_QUESTION)).toBe(false)
		expect(screen.getAllByText(FIRST_REPLY_QUESTION).length).toBeGreaterThan(0)
		expect(screen.getByText("Keep talking first")).toBeTruthy()
	})
})

const SIGNED_OUT = {
	connection: "unavailable",
	binaryVersion: null,
	authenticated: false,
	error: { kind: "notAuthenticated" },
} satisfies CheckReport

const AGENT_MISSING = {
	connection: "unavailable",
	binaryVersion: null,
	authenticated: false,
	error: { kind: "binaryNotFound", searched: [] },
} satisfies CheckReport

const SIGNED_IN = {
	connection: "ready",
	binaryVersion: "1",
	authenticated: true,
	error: null,
} satisfies CheckReport

const ACCESS_QUESTION = "How do you want to connect?"

const NOT_CONNECTED_TITLE = "You’re not signed in"

const UNAVAILABLE_TITLE = "Couldn’t reach Ada"

const SIGN_IN = "Sign in"

const EMPTY_STATE_SLOT = '[data-slot="chat-empty-state"]'

type SignedOutAgent = {
	checked: CheckReport
	sessionsOpened: number
}

type SignedOutFixture = {
	agent: SignedOutAgent
	port: FakeOnboardingPort
	signIn: SignInController
	driver: ScriptedDriver
	thread: () => BotThread
}

const signedOutOf = async (
	checked: CheckReport = SIGNED_OUT,
): Promise<SignedOutFixture> => {
	const store = createFakeTranscriptStore()
	const [bot] = await seatBots(store, SPACE, ["Ada"])
	const driver = createScriptedDriver()
	const agent: SignedOutAgent = { checked, sessionsOpened: 0 }
	const chat = createChatController(
		{
			...driver,
			check: () => Promise.resolve(agent.checked),
			startOrResumeSession: (...opened) => {
				agent.sessionsOpened += 1
				return driver.startOrResumeSession(...opened)
			},
		},
		store,
	)
	chat.attach()
	await act(async () => {
		await chat.open(bot.id, null)
	})
	const port = createFakeOnboardingPort()
	const signIn = createSignInController(
		port,
		signInWorldOf({ chat, selectedBotId: () => bot.id }),
	)

	return {
		agent,
		port,
		signIn,
		driver,
		thread: () => ({
			kind: "bot",
			bot,
			chat: { state: chat.stateFor(bot.id), controller: chat },
			isOverlayOpen: false,
			onToggleSettings: () => undefined,
		}),
	}
}

const renderSignIn = (
	fixture: SignedOutFixture,
	onboarding?: OnboardingController,
) =>
	renderAsking(() =>
		screenOf(
			fixture.thread(),
			NO_BOT_RECORDS,
			() => undefined,
			createMessageLandingController(),
			onboarding,
			fixture.signIn,
		),
	)

const emptyState = () => {
	const drawn = document.querySelector<HTMLElement>(EMPTY_STATE_SLOT)
	if (!drawn) throw new Error("the thread draws no empty state")
	return drawn
}

const pressWithin = async (
	shown: OnboardingScreen,
	region: HTMLElement,
	name: string,
) => {
	await act(async () => {
		fireEvent.click(within(region).getByRole("button", { name }))
	})
	await shown.refresh()
}

const askedToConnect = async (fixture: SignedOutFixture) => {
	const shown = await renderSignIn(fixture)
	await pressWithin(shown, emptyState(), SIGN_IN)
	return shown
}

const choice = (label: string) =>
	screen.getByRole("radio", { name: (name) => name.startsWith(label) })

const firstRunElsewhere = async () => {
	const world = createFakeOnboardingWorld()
	const onboarding = createOnboardingController(
		createFakeOnboardingPort(),
		world,
	)
	await act(async () => {
		await onboarding.start()
	})
	return { world, onboarding }
}

describe("signing in from a companion's solo thread", () => {
	let layout: FakeLayout

	beforeEach(() => {
		layout = fakeLayout()
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([])
		listRuns.mockResolvedValue([])
		listSources.mockResolvedValue(SCHEDULE_DECLARED)
		listMissions.mockResolvedValue({ open: [], done: [] })
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		layout.restore()
	})

	it("draws the not-connected empty state when nobody is signed in", async () => {
		const fixture = await signedOutOf()
		await renderSignIn(fixture)

		const drawn = within(emptyState())
		expect(
			drawn.getByRole("heading", { name: NOT_CONNECTED_TITLE }),
		).toBeTruthy()
		expect(drawn.getByRole("button", { name: SIGN_IN })).toBeTruthy()
		expect(drawn.queryByText(UNAVAILABLE_TITLE)).toBeNull()
	})

	it("keeps the empty state it draws today when the agent fails for another reason", async () => {
		const fixture = await signedOutOf(AGENT_MISSING)
		await renderSignIn(fixture)

		expect(
			within(emptyState()).getByRole("heading", { name: UNAVAILABLE_TITLE }),
		).toBeTruthy()
		expect(screen.queryByText(NOT_CONNECTED_TITLE)).toBeNull()
	})

	it("draws the not-connected empty state while the first run goes on in another companion", async () => {
		const fixture = await signedOutOf()
		const { onboarding } = await firstRunElsewhere()
		await renderSignIn(fixture, onboarding)

		expect(
			within(emptyState()).getByRole("heading", { name: NOT_CONNECTED_TITLE }),
		).toBeTruthy()
	})

	it("asks the question the onboarding asks when nobody is authenticated", async () => {
		const fixture = await signedOutOf()
		await askedToConnect(fixture)

		expect(isAsking(ACCESS_QUESTION)).toBe(true)
		expect(choice("Sign in with Claude")).toBeTruthy()
		expect(choice("Paste an API key")).toBeTruthy()
		expect(document.querySelector(EMPTY_STATE_SLOT)).toBeNull()
	})

	it("asks for the code on the url the sign-in announced, with a key as the way out", async () => {
		const fixture = await signedOutOf()
		const shown = await askedToConnect(fixture)
		await shown.choose("Sign in with Claude")

		await act(async () => {
			fixture.port.announceStarted(SIGN_IN_LINK)
		})
		await shown.refresh()

		expect(isAsking(CODE_QUESTION)).toBe(true)
		expect(screen.getByDisplayValue(SIGN_IN_LINK)).toBeTruthy()
		await shown.press("Paste a key instead")
		expect(isAsking(KEY_QUESTION)).toBe(true)
	})

	it("offers the retry and the key after a refused sign-in", async () => {
		const fixture = await signedOutOf()
		const shown = await askedToConnect(fixture)
		await shown.choose("Sign in with Claude")

		await act(async () => {
			fixture.port.refuseSignIn({
				kind: "failed",
				detail: "auth login exited with 1",
			})
		})
		await shown.refresh()

		expect(isAsking(SIGN_IN_FAILED_QUESTION)).toBe(true)
		expect(screen.getByText("Couldn’t sign you in")).toBeTruthy()
		expect(choice("Try again")).toBeTruthy()
		expect(choice("Paste an API key")).toBeTruthy()
	})

	it("withdraws the code step and opens the session once the account is connected", async () => {
		const fixture = await signedOutOf()
		const shown = await askedToConnect(fixture)
		await shown.choose("Sign in with Claude")
		await act(async () => {
			fixture.port.announceStarted(SIGN_IN_LINK)
		})
		await shown.refresh()

		fixture.agent.checked = SIGNED_IN
		await act(async () => {
			fixture.port.completeSignIn()
		})
		await shown.refresh()

		expect(screen.queryByText(CODE_QUESTION)).toBeNull()
		expect(screen.queryByRole("alert")).toBeNull()
		expect(fixture.agent.sessionsOpened).toBe(1)
	})

	it("offers the sign-in in place of the restart on a signed-out notice", async () => {
		const fixture = await signedOutOf()
		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		const shown = await renderSignIn(fixture)
		const notice = raisedNotice(NOT_CONNECTED_TITLE)

		expect(
			within(notice).queryByRole("button", {
				name: "Restart session",
				hidden: true,
			}),
		).toBeNull()
		expect(
			within(notice).getByText(
				"Your Claude account isn’t connected. Sign in to keep talking.",
			),
		).toBeTruthy()
		expect(within(notice).queryByText(/restart/i)).toBeNull()
		await pressInNotice(NOT_CONNECTED_TITLE, SIGN_IN)
		await shown.refresh()
		expect(isAsking(ACCESS_QUESTION)).toBe(true)
	})

	it("leaves the first run alone and summons nobody while connecting", async () => {
		const fixture = await signedOutOf()
		const { world, onboarding } = await firstRunElsewhere()
		const shown = await renderSignIn(fixture, onboarding)
		await pressWithin(shown, emptyState(), SIGN_IN)
		await shown.choose("Paste an API key")

		fixture.port.report = AUTHENTICATED_ANONYMOUSLY
		fixture.agent.checked = SIGNED_IN
		await shown.type("Key", ONBOARDING_KEY)

		expect(isAsking(KEY_QUESTION)).toBe(false)
		expect(fixture.agent.sessionsOpened).toBe(1)
		expect(world.firstRunDone).toBe(0)
		expect(world.sent).toEqual([])
		expect(world.greetings).toEqual([])
		expect(fixture.driver.submissions).toEqual([])
	})
})

const seatingOf = (
	bots: Bot[],
	seat: ConversationSeating["seat"],
): ConversationSeating => ({
	seat,
	botsByPresence: () => Promise.resolve(bots),
})

const seatlessRoomWith = async (
	bots: Bot[],
	seat: ConversationSeating["seat"],
) => {
	const room = await roomOf({ names: [] })
	render(
		createElement(
			ConversationSeatingContext.Provider,
			{ value: seatingOf(bots, seat) },
			screenOf(room.thread, bots),
		),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
	await settle()
	return room
}

const composerValue = () =>
	(screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement)
		.value

describe("ThreadScreen on a conversation nobody is in", () => {
	let layout: FakeLayout

	beforeEach(() => {
		layout = fakeLayout()
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([])
		listRuns.mockResolvedValue([])
		listSources.mockResolvedValue(SCHEDULE_DECLARED)
		listMissions.mockResolvedValue({ open: [], done: [] })
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		layout.restore()
	})

	it("offers the first five companions the presence ranking answers", async () => {
		const seat = vi.fn(() => Promise.resolve(null))
		const ranked = ["Vela", "Orb", "Nyx", "Ada", "Sol", "Wren"]
		await seatlessRoomWith(
			ranked.map((name) => botOf(name.toLowerCase(), name)),
			seat,
		)

		for (const name of ranked.slice(0, 5)) {
			expect(screen.getByRole("button", { name })).toBeTruthy()
		}
		expect(screen.queryByRole("button", { name: "Wren" })).toBeNull()
	})

	it("writes the mention of the pressed companion and seats nobody", async () => {
		const seat = vi.fn(() => Promise.resolve(null))
		await seatlessRoomWith([botOf("vela", "Vela")], seat)

		fireEvent.click(screen.getByRole("button", { name: "Vela" }))
		await settle()

		expect(seat).not.toHaveBeenCalled()
		expect(composerValue()).toBe("@Vela ")
	})
})

type SendingRoom = {
	store: TranscriptStore
	driver: ScriptedDriver
	conversationId: string
	idOf: (name: string) => string
	seat: ReturnType<typeof vi.fn>
}

type SendingRoomFixture = {
	seatedNames?: string[]
	absentNames?: string[]
	refuse?: ConversationSeating["seat"]
}

const sendingRoomWith = async ({
	seatedNames = ["Ada"],
	absentNames = ["Vela", "Orb"],
	refuse,
}: SendingRoomFixture = {}): Promise<SendingRoom> => {
	const store = createFakeTranscriptStore()
	const bots = await seatBots(store, SPACE, [...seatedNames, ...absentNames])
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: bots.slice(0, seatedNames.length).map((bot) => bot.id),
	})
	const driver = createScriptedDriver()
	const runtimes = createConversationRuntimes(driver, store, {})
	const seat = vi.fn(
		refuse ??
			((conversationId: string, botId: string) =>
				store.addConversationParticipant(conversationId, botId)),
	)

	render(
		createElement(
			ConversationSeatingContext.Provider,
			{ value: seatingOf(bots, seat) },
			createElement(ThreadScreenHarness, {
				bots,
				landings: createMessageLandingController(),
				onOpenMission: () => undefined,
				staging: createAttachmentsController(
					createAttachmentsPort({ chat: NO_BOT_CHAT, driver, runtimes }),
				),
				thread: {
					kind: "conversation",
					conversation,
					runtimes,
					onOpenSettings: () => undefined,
				},
			}),
		),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
	await settle()

	return {
		store,
		driver,
		conversationId: conversation.id,
		idOf: (name) => bots.find((bot) => bot.name === name)?.id ?? name,
		seat,
	}
}

const sendInComposer = async (text: string) => {
	const field = screen.getByRole("textbox", { name: "Message" })
	await act(async () => {
		fireEvent.change(field, { target: { value: text } })
	})
	await act(async () => {
		fireEvent.keyDown(field, { key: "Enter" })
	})
	await settle()
}

const storedTexts = async (room: SendingRoom) => {
	const page = await room.store.loadPage(room.conversationId, null)
	return page.messages
		.filter((held) => held.role === "user")
		.map((held) => held.content)
}

const seatedBotIds = (room: SendingRoom) =>
	room.seat.mock.calls.map(([, botId]) => botId)

const summonedBotIds = (room: SendingRoom) =>
	room.driver.submissions.map((submission) => submission.scope.botId)

describe("ThreadScreen sending a message that mentions absent companions", () => {
	let layout: FakeLayout

	beforeEach(() => {
		layout = fakeLayout()
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([])
		listRuns.mockResolvedValue([])
		listSources.mockResolvedValue(SCHEDULE_DECLARED)
		listMissions.mockResolvedValue({ open: [], done: [] })
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		layout.restore()
	})

	it("seats a mentioned companion and stores its mention token", async () => {
		const room = await sendingRoomWith()

		await sendInComposer("@Vela hold the north wall")

		expect(seatedBotIds(room)).toEqual([room.idOf("Vela")])
		expect(await storedTexts(room)).toEqual([
			`<@${room.idOf("Vela")}> hold the north wall`,
		])
	})

	it("dispatches the turn to the companion that send seated", async () => {
		const room = await sendingRoomWith()

		await sendInComposer("@Vela hold the north wall")

		expect(summonedBotIds(room)).toEqual([room.idOf("Vela")])
	})

	it("seats the mentioned companions in the order their names appear", async () => {
		const room = await sendingRoomWith()

		await sendInComposer("@Orb then @Vela, hold the wall")

		expect(seatedBotIds(room)).toEqual([room.idOf("Orb"), room.idOf("Vela")])
	})

	it("seats nobody when every mentioned companion already holds a seat", async () => {
		const room = await sendingRoomWith()

		await sendInComposer("@Ada hold the north wall")

		expect(seatedBotIds(room)).toEqual([])
		expect(await storedTexts(room)).toEqual([
			`<@${room.idOf("Ada")}> hold the north wall`,
		])
	})

	it("resolves a longer seated name over the unseated companion it starts with", async () => {
		const room = await sendingRoomWith({
			seatedNames: ["Rei v"],
			absentNames: ["Rei"],
		})

		await sendInComposer("@Rei v hold the wall")

		expect(seatedBotIds(room)).toEqual([])
		expect(await storedTexts(room)).toEqual([
			`<@${room.idOf("Rei v")}> hold the wall`,
		])
		expect(summonedBotIds(room)).toEqual([room.idOf("Rei v")])
	})

	it("keeps the text, stores nothing and starts no turn when seating is refused", async () => {
		const room = await sendingRoomWith({ refuse: () => Promise.resolve(null) })

		await sendInComposer("@Vela hold the north wall")

		expect(composerValue()).toBe("@Vela hold the north wall")
		expect(await storedTexts(room)).toEqual([])
		expect(summonedBotIds(room)).toEqual([])
	})
})

type ArrivalRoom = {
	bots: Bot[]
	thread: ConversationThread
}

type ArrivalFixture = {
	id: string
	arriving: string
	invitedBy: string | null
	afterText: string | null
}

const ARRIVAL_SPOKEN: SpokenTurn[] = [
	{ turnId: "t-ask", text: "which wall holds?", createdAt: 0, role: "user" },
	{ turnId: "t-answer", text: "the north one", createdAt: A_MINUTE },
	{
		turnId: "t-again",
		text: "and the south?",
		createdAt: 2 * A_MINUTE,
		role: "user",
	},
]

const arrivalRoomOf = async (
	fixtures: ArrivalFixture[],
	absent: string[] = [],
): Promise<ArrivalRoom> => {
	const base = createFakeTranscriptStore()
	const bots = await seatBots(base, SPACE, ["Ada", "Vela", "Orb"])
	const idOf = (name: string) =>
		bots.find((bot) => bot.name === name)?.id ?? name
	const conversation = await base.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: [idOf("Ada")],
	})
	for (const turn of ARRIVAL_SPOKEN) {
		await writeTurn(base, conversation.id, idOf("Ada"), turn)
	}
	const { messages } = await base.loadPage(conversation.id, null)
	const seqAfter = (text: string | null) =>
		messages.find((said) => said.content === text)?.seq ?? 0
	const arrivals: CompanionArrival[] = fixtures.map((fixture) => ({
		id: fixture.id,
		conversationId: conversation.id,
		botId: idOf(fixture.arriving),
		invitedByBotId: fixture.invitedBy ? idOf(fixture.invitedBy) : null,
		lastMessageSeq: seqAfter(fixture.afterText),
		createdAt: 0,
	}))
	const store: TranscriptStore = {
		...base,
		loadPage: async (conversationId, cursor) => ({
			...(await base.loadPage(conversationId, cursor)),
			arrivals,
		}),
	}

	return {
		bots: bots.filter((bot) => !absent.includes(bot.name)),
		thread: {
			kind: "conversation",
			conversation,
			runtimes: createConversationRuntimes(createScriptedDriver(), store),
			onOpenSettings: () => undefined,
		},
	}
}

const renderArrivalRoom = async (room: ArrivalRoom) => {
	render(screenOf(room.thread, room.bots), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
}

describe("ThreadScreen showing the companions that arrived", () => {
	let layout: FakeLayout

	beforeEach(() => {
		layout = fakeLayout()
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([])
		listRuns.mockResolvedValue([])
		listSources.mockResolvedValue(SCHEDULE_DECLARED)
		listMissions.mockResolvedValue({ open: [], done: [] })
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		layout.restore()
	})

	it("names the reader as the inviter right after the run the arrival follows", async () => {
		await renderArrivalRoom(
			await arrivalRoomOf([
				{
					id: "a-1",
					arriving: "Vela",
					invitedBy: null,
					afterText: "the north one",
				},
			]),
		)

		const arrival = rowIndexOf("Vela joined this conversation, invited by you")
		expect(arrival).toBe(rowIndexOf("the north one") + 1)
		expect(arrival).toBeLessThan(rowIndexOf("and the south?"))
	})

	it("names an inviting companion from the space roster even when it is not seated", async () => {
		await renderArrivalRoom(
			await arrivalRoomOf([
				{ id: "a-1", arriving: "Orb", invitedBy: "Vela", afterText: null },
			]),
		)

		expect(rowIndexOf("Orb joined this conversation, invited by Vela")).toBe(
			rowIndexOf("which wall holds?") - 1,
		)
	})

	it("renders the arrivals after the same run in the order the conversation holds them", async () => {
		await renderArrivalRoom(
			await arrivalRoomOf([
				{
					id: "b",
					arriving: "Orb",
					invitedBy: null,
					afterText: "the north one",
				},
				{
					id: "a",
					arriving: "Vela",
					invitedBy: null,
					afterText: "the north one",
				},
			]),
		)

		expect(rowIndexOf("Vela joined")).toBe(rowIndexOf("the north one") + 1)
		expect(rowIndexOf("Orb joined")).toBe(rowIndexOf("Vela joined") + 1)
	})

	it("leaves out the arrival of a companion absent from the space roster", async () => {
		await renderArrivalRoom(
			await arrivalRoomOf(
				[
					{
						id: "a-1",
						arriving: "Vela",
						invitedBy: null,
						afterText: "the north one",
					},
				],
				["Vela"],
			),
		)

		expect(rowIndexOf("which wall holds?")).not.toBe(-1)
		expect(rowIndexOf("joined this conversation")).toBe(-1)
	})
})

const SENTRY_APPLICATION: Application = {
	name: "sentry",
	title: "Sentry",
	description: "Pulls the errors behind a release.",
	config: {},
	tools: [],
	install: {
		kind: "key",
		fields: [{ name: "token", secret: "SENTRY_AUTH_TOKEN", concealed: true }],
	},
}

const INSTALLED_THREAD_ID = "bot-1"

const installOf = (
	overrides: Partial<ApplicationInstall> = {},
): ApplicationInstall => ({
	id: "install-1",
	conversationId: `c-${INSTALLED_THREAD_ID}`,
	application: "sentry",
	title: "Sentry",
	scope: "companion",
	destinationId: INSTALLED_THREAD_ID,
	install: { kind: "nothing" },
	lastMessageSeq: 1,
	createdAt: 0,
	...overrides,
})

const OPEN_SETTINGS = "Open Settings"

const UNREADABLE_INSTALLS_TITLE =
	"Couldn’t read the applications added to this conversation."

type InstallRoom = {
	port: FakeApplicationPort
	onOpen: Mock
	view: () => ReturnType<typeof createElement>
}

const installRoomOf = (
	installs: ApplicationInstall[],
	errors: ChatError[] = [],
): InstallRoom => {
	const port = createFakeApplicationPort()
	port.curated = [SENTRY_APPLICATION]
	port.recorded = installs
	const onOpen = vi.fn()
	const view = () =>
		createElement(
			Fragment,
			null,
			createElement(NoticeSurface),
			createElement(
				SessionApplicationsContext.Provider,
				{ value: { spaceId: SPACE } },
				createElement(
					ConversationApplicationsContext.Provider,
					{
						value: {
							port,
							curated: port.curated,
							spaces: [INSTALLED_SPACE],
							onOpen,
						},
					},
					screenOf(
						threadOf({
							id: INSTALLED_THREAD_ID,
							name: "Nyx",
							said: "held",
							errors,
						}),
						[botOf(INSTALLED_THREAD_ID, "Nyx"), botOf("bot-2", "Vela")],
					),
				),
			),
		)
	return { port, onOpen, view }
}

const INSTALLED_SPACE: Space = {
	id: SPACE,
	name: "Personal",
	colour: null,
	position: 0,
	createdAt: 0,
	shared: false,
	instanceId: null,
}

const receiptIn = (row: HTMLElement) =>
	row.querySelector<HTMLElement>('[data-slot="application-receipt"]')

const rowHolding = (text: string) => {
	const row = [
		...document.querySelectorAll<HTMLElement>(
			'[data-slot="message-scroller-item"]',
		),
	].find((candidate) => candidate.textContent?.includes(text))
	if (!row) throw new Error(`no transcript row holds ${text}`)
	return row
}

const NYX_SENTRY_RECEIPT = "Nyx has Sentry in every conversation."

describe("ThreadScreen showing the applications installed", () => {
	let layout: FakeLayout

	beforeEach(() => {
		layout = fakeLayout()
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([])
		listRuns.mockResolvedValue([])
		listSources.mockResolvedValue(SCHEDULE_DECLARED)
		listMissions.mockResolvedValue({ open: [], done: [] })
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		layout.restore()
	})

	it("shows an install needing nothing as a receipt outside every bubble after the run it follows", async () => {
		const room = installRoomOf([installOf()])
		render(room.view(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		const row = rowHolding(NYX_SENTRY_RECEIPT)
		const receipt = receiptIn(row)
		expect(receipt).not.toBeNull()
		expect(receipt?.closest('[data-slot="message-bubble"]')).toBeNull()
		expect(receipt?.textContent).not.toContain("Connected")
		expect(rowIndexOf(NYX_SENTRY_RECEIPT)).toBeGreaterThan(rowIndexOf("held"))
	})

	it("places an install no run precedes before the first run", async () => {
		const room = installRoomOf([installOf({ lastMessageSeq: 0 })])
		render(room.view(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(rowIndexOf(NYX_SENTRY_RECEIPT)).toBeLessThan(rowIndexOf("held"))
	})

	it("asks for the key of an install in the settings of its companion", async () => {
		const room = installRoomOf([
			installOf({ install: { kind: "key", secrets: ["SENTRY_AUTH_TOKEN"] } }),
		])
		render(room.view(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		const row = rowHolding(NYX_SENTRY_RECEIPT)
		expect(receiptIn(row)).not.toBeNull()
		expect(receiptIn(row)?.textContent).not.toContain("Needs an API key")
		fireEvent.click(within(row).getByRole("button", { name: OPEN_SETTINGS }))

		expect(room.onOpen).toHaveBeenCalledWith(
			{ kind: "companion", id: INSTALLED_THREAD_ID },
			"sentry",
		)
	})

	it("opens the settings of the space or of the person a sign-in install landed in", async () => {
		const room = installRoomOf([
			installOf({
				id: "install-space",
				application: "linear",
				title: "Linear",
				scope: "space",
				destinationId: SPACE,
				install: { kind: "oauth" },
			}),
			installOf({
				id: "install-user",
				application: "notion",
				title: "Notion",
				scope: "user",
				destinationId: undefined,
				install: { kind: "oauth" },
			}),
		])
		render(room.view(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		const spaceRow = rowHolding("Every agent in Personal has Linear.")
		const userRow = rowHolding("You have Notion in every conversation.")
		expect(within(spaceRow).queryByText("Signs you in")).toBeNull()
		fireEvent.click(
			within(spaceRow).getByRole("button", { name: OPEN_SETTINGS }),
		)
		fireEvent.click(
			within(userRow).getByRole("button", { name: OPEN_SETTINGS }),
		)

		expect(room.onOpen.mock.calls).toEqual([
			[{ kind: "space", id: SPACE }, undefined],
			[{ kind: "user" }, undefined],
		])
	})

	it("shows in its row that a key install was left out of a session of its companion", async () => {
		const room = installRoomOf(
			[installOf({ install: { kind: "key", secrets: ["SENTRY_AUTH_TOKEN"] } })],
			[
				leftOutError(
					'the server "sentry" was left out: SENTRY_AUTH_TOKEN is defined by no scope',
				),
			],
		)
		render(room.view(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		const row = rowHolding("Sentry was left out")
		const bubble = row.querySelector('[data-slot="message-bubble"]')
		const receipt = receiptIn(row)
		if (!bubble || !receipt) {
			throw new Error("the refused install row holds no notice and no receipt")
		}
		expect(
			bubble.compareDocumentPosition(receipt) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		expect(
			within(row).getAllByRole("button", { name: OPEN_SETTINGS }),
		).toHaveLength(2)
	})

	it("names every variable an install needs in the line telling a session left it out", async () => {
		const room = installRoomOf(
			[
				installOf({
					install: {
						kind: "key",
						secrets: ["SENTRY_AUTH_TOKEN", "SENTRY_ORG"],
					},
				}),
			],
			[
				leftOutError(
					'the server "sentry" was left out: SENTRY_AUTH_TOKEN is defined by no scope',
				),
			],
		)
		render(room.view(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		const row = rowHolding("Sentry was left out")
		expect(
			within(row).getByText("Its keys go in SENTRY_AUTH_TOKEN, SENTRY_ORG."),
		).toBeTruthy()
	})

	it("leaves the row of a key install of another companion as it was when a session leaves it out", async () => {
		const room = installRoomOf(
			[
				installOf({
					destinationId: "bot-2",
					install: { kind: "key", secrets: ["SENTRY_AUTH_TOKEN"] },
				}),
			],
			[
				leftOutError(
					'the server "sentry" was left out: SENTRY_AUTH_TOKEN is defined by no scope',
				),
			],
		)
		render(room.view(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(rowIndexOf("Sentry was left out")).toBe(-1)
		expect(rowIndexOf("Vela has Sentry in every conversation.")).not.toBe(-1)
	})

	it("shows an install announced for the open conversation without a reload", async () => {
		const room = installRoomOf([])
		render(room.view(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()
		expect(rowIndexOf(NYX_SENTRY_RECEIPT)).toBe(-1)

		room.port.recorded = [installOf()]
		act(() =>
			room.port.announce({
				conversationId: `c-${INSTALLED_THREAD_ID}`,
				application: "sentry",
				title: "Sentry",
				scope: "companion",
				destinationId: INSTALLED_THREAD_ID,
				install: { kind: "nothing" },
			}),
		)

		await waitFor(() =>
			expect(rowIndexOf(NYX_SENTRY_RECEIPT)).toBeGreaterThan(
				rowIndexOf("held"),
			),
		)
	})

	it("shows the same rows at the same anchors when the conversation is opened again", async () => {
		const room = installRoomOf([
			installOf({ id: "install-before", lastMessageSeq: 0 }),
		])
		const opened = render(room.view(), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()
		opened.unmount()

		render(room.view(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(rowIndexOf(NYX_SENTRY_RECEIPT)).toBeLessThan(rowIndexOf("held"))
	})

	it("renders the thread without install rows and raises a notice when the installs cannot be read", async () => {
		const room = installRoomOf([installOf()])
		room.port.refusals.installs = {
			kind: "catalogueUnreadable",
			detail: "refused",
		}
		render(room.view(), { wrapper: createQueryTestWrapper().wrapper })
		await settle()

		expect(rowIndexOf(NYX_SENTRY_RECEIPT)).toBe(-1)
		expect(rowIndexOf("held")).not.toBe(-1)
		expect(raisedNotices(UNREADABLE_INSTALLS_TITLE)).toHaveLength(1)
	})
})

describe("ThreadScreen opening the companion menu of a gutter avatar", () => {
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

	it("opens it in the solo thread", async () => {
		const solo = await soloOf({ spoken: [ADA_CLOSES] })
		const thread = solo.thread()
		render(underCompanionMenu(screenOf(thread), [thread.bot.id]), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(await rightClickGutterOf(ADA_CLOSES.text)).toBeTruthy()
	})

	it("opens it in the mission thread", async () => {
		const room = await missionRoomOf({
			events: [MISSION_OPENED],
			spoken: [MISSION_SAID],
		})
		render(
			underCompanionMenu(screenOf(room.thread, room.bots), [room.idOf("Ada")]),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		expect(await rightClickGutterOf(MISSION_SAID.text)).toBeTruthy()
	})

	it("opens none for a companion absent from the open space roster", async () => {
		const room = await missionRoomOf({
			events: [MISSION_OPENED],
			spoken: [MISSION_SAID],
		})
		render(underCompanionMenu(screenOf(room.thread, room.bots), []), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		await expect(rightClickGutterOf(MISSION_SAID.text)).rejects.toThrow()
	})
})

describe("ThreadScreen selecting a companion from the transcript", () => {
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

	it("selects the companion of a gutter avatar and leaves its open mission", async () => {
		const room = await missionRoomOf({
			events: [MISSION_OPENED],
			spoken: [MISSION_SAID],
		})
		const target = selectTargetInMissionOf(room.idOf("Ada"))
		render(
			underCompanionSelect(
				screenOf(room.thread, room.bots),
				[room.idOf("Ada")],
				target,
			),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		clickGutterOf(MISSION_SAID.text)

		expect(target.select).toHaveBeenCalledWith(room.idOf("Ada"))
		expect(target.missions.getState()).toBeNull()
	})

	it("selects the companion of a mention pill", async () => {
		const room = await roomOf({ names: ["Ada", "Nyx"] })
		const target = selectTargetInMissionOf(room.idOf("Ada"))
		render(
			underCompanionSelect(
				screenOf(room.thread, room.bots),
				[room.idOf("Ada"), room.idOf("Nyx")],
				target,
			),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		await room.send(`<@${room.idOf("Nyx")}> hold the gate`)
		clickMentionOf("hold the gate")

		expect(target.select).toHaveBeenCalledWith(room.idOf("Nyx"))
	})

	it("selects nothing and keeps the mission open for a companion absent from the open space roster", async () => {
		const room = await missionRoomOf({
			events: [MISSION_OPENED],
			spoken: [MISSION_SAID],
		})
		const target = selectTargetInMissionOf(room.idOf("Ada"))
		render(underCompanionSelect(screenOf(room.thread, room.bots), [], target), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		clickGutterOf(MISSION_SAID.text)

		expect(target.select).not.toHaveBeenCalled()
		expect(target.missions.getState()).not.toBeNull()
	})
})

describe("ThreadScreen dating its messages in Tokyo", () => {
	const TOKYO_MIDNIGHT = Date.UTC(2026, 9, 9, 15)
	let layout: FakeLayout

	const spokenAt = (createdAt: number, index: number): SpokenTurn => ({
		turnId: `t-ada-${index}`,
		text: `said at ${createdAt}`,
		createdAt,
		author: "Ada",
	})

	const renderAdaSaying = async (...createdAts: number[]) => {
		const room = await roomOf({
			names: ["Ada"],
			spoken: createdAts.map(spokenAt),
		})
		render(screenOf(room.thread), { wrapper: createQueryTestWrapper().wrapper })
		await settle()
	}

	const daySeparators = () =>
		document.querySelectorAll('[data-slot="day-separator"]')

	beforeAll(() => {
		vi.stubEnv("TZ", "Asia/Tokyo")
	})

	afterAll(() => {
		vi.unstubAllEnvs()
	})

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

	it("shows the send time on the header line of every run, never under a bubble", async () => {
		await renderAdaSaying(TOKYO_MIDNIGHT - A_MINUTE, TOKYO_MIDNIGHT)

		const headerTimes = [
			...document.querySelectorAll(
				'[data-slot="message-author"] [data-slot="message-time"]',
			),
		].map((time) => time.getAttribute("datetime"))

		expect(headerTimes).toEqual([
			new Date(TOKYO_MIDNIGHT - A_MINUTE).toISOString(),
			new Date(TOKYO_MIDNIGHT).toISOString(),
		])
		expect(
			document.querySelectorAll('[data-slot="message-time-line"]'),
		).toHaveLength(0)
	})

	it("parts two messages across local midnight with one day separator between two runs", async () => {
		await renderAdaSaying(TOKYO_MIDNIGHT - A_MINUTE, TOKYO_MIDNIGHT + A_MINUTE)

		expect(daySeparators()).toHaveLength(1)
		expect(
			document.querySelectorAll('[data-slot="chat-turn-group"]'),
		).toHaveLength(2)
	})

	it("shows no day separator between two messages of the same local day", async () => {
		await renderAdaSaying(
			TOKYO_MIDNIGHT + A_MINUTE,
			TOKYO_MIDNIGHT + 2 * A_MINUTE,
		)

		expect(daySeparators()).toHaveLength(0)
	})
})

const CONVERSATION_EMPTY_STATE_SLOT = '[data-slot="conversation-empty-state"]'

const drawsEmptyState = () =>
	document.querySelector(
		`${CONVERSATION_EMPTY_STATE_SLOT}, ${EMPTY_STATE_SLOT}`,
	) !== null

const HELD_SAID: SpokenTurn = {
	turnId: "t-held",
	text: "the walls hold",
	createdAt: A_MINUTE,
}

const heldRoomOf = async (spoken: SpokenTurn[] = []) => {
	const store = createFakeTranscriptStore()
	const bots = await seatBots(store, SPACE, ["Ada"])
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: bots.map((bot) => bot.id),
	})
	for (const turn of spoken) {
		await writeTurn(store, conversation.id, bots[0].id, turn)
	}
	const held = holdFirstPages(store)
	const runtimes = createConversationRuntimes(createScriptedDriver(), held.port)
	const thread: ConversationThread = {
		kind: "conversation",
		conversation,
		runtimes,
		onOpenSettings: () => undefined,
	}
	render(screenOf(thread, bots), { wrapper: createQueryTestWrapper().wrapper })
	await settle()

	return {
		answer: async () => {
			await act(async () => held.answer(conversation.id))
			await settle()
		},
		fail: async () => {
			await act(async () =>
				held.fail(conversation.id, new Error("unreachable")),
			)
			await settle()
		},
	}
}

const heldRoomOnFakeTimers = async () => {
	const store = createFakeTranscriptStore()
	const bots = await seatBots(store, SPACE, ["Ada"])
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: bots.map((bot) => bot.id),
	})
	const held = holdFirstPages(store)
	const runtimes = createConversationRuntimes(createScriptedDriver(), held.port)
	const thread: ConversationThread = {
		kind: "conversation",
		conversation,
		runtimes,
		onOpenSettings: () => undefined,
	}
	render(screenOf(thread, bots), { wrapper: createQueryTestWrapper().wrapper })
	await passing(0)

	return () => held.fail(conversation.id, new Error("unreachable"))
}

const TRANSCRIPT_SKELETON_SLOT =
	'[data-slot="thread-skeleton"] [data-slot="list-skeleton"]'

const SKELETON_DELAY_MS = 300

const SKELETON_SETTLED_MS = SKELETON_DELAY_MS + 500 + 150

const drawsTranscriptSkeleton = () =>
	document.querySelector(TRANSCRIPT_SKELETON_SLOT) !== null

const SKELETON_STEP_MS = 50

const passing = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

const passingInSteps = async (ms: number) => {
	for (let elapsed = 0; elapsed < ms; elapsed += SKELETON_STEP_MS) {
		await passing(SKELETON_STEP_MS)
	}
}

const soloThreadWaitingOf = (isFirstLoadPending: boolean): BotThread => {
	const sent = threadOf({ id: "bot-1", name: "Nyx", said: "" })
	return {
		...sent,
		chat: {
			...sent.chat,
			state: { ...sent.chat.state, messages: [], isFirstLoadPending },
		},
	}
}

describe("the first load of a thread transcript", () => {
	let layout: FakeLayout

	beforeEach(() => {
		layout = fakeLayout()
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([])
		listRuns.mockResolvedValue([])
		listSources.mockResolvedValue(SCHEDULE_DECLARED)
		listMissions.mockResolvedValue({ open: [], done: [] })
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		layout.restore()
	})

	it("draws no empty state in a group thread while its first page is pending", async () => {
		const room = await heldRoomOf()

		expect(drawsEmptyState()).toBe(false)

		await room.answer()

		expect(document.querySelector(CONVERSATION_EMPTY_STATE_SLOT)).not.toBeNull()
	})

	it("draws the messages of a group thread and never the empty state before them", async () => {
		const room = await heldRoomOf([HELD_SAID])

		expect(drawsEmptyState()).toBe(false)
		expect(screen.queryByText(HELD_SAID.text)).toBeNull()

		await room.answer()

		expect(screen.getByText(HELD_SAID.text)).toBeTruthy()
		expect(drawsEmptyState()).toBe(false)
	})

	it("draws the empty state and the failure once the first page of a group thread fails", async () => {
		render(createElement(NoticeSurface), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		const room = await heldRoomOf()

		await room.fail()

		expect(document.querySelector(CONVERSATION_EMPTY_STATE_SLOT)).not.toBeNull()
		expect(raisedNotices(READ_TITLE)).toHaveLength(1)
	})

	it("draws a message appended while the first page is pending, and no empty state", async () => {
		const sent = threadOf({ id: "bot-1", name: "Nyx", said: "anyone here?" })
		render(
			screenOf({
				...sent,
				chat: {
					...sent.chat,
					state: { ...sent.chat.state, isFirstLoadPending: true },
				},
			}),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settle()

		expect(screen.getByText("anyone here?")).toBeTruthy()
		expect(drawsEmptyState()).toBe(false)
	})

	describe("its skeleton", () => {
		beforeEach(() => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		})

		afterEach(() => {
			vi.useRealTimers()
		})

		it("draws the transcript skeleton once the delay passes while the first page is pending and nothing is held", async () => {
			render(screenOf(soloThreadWaitingOf(true)), {
				wrapper: createQueryTestWrapper().wrapper,
			})
			await passing(0)

			await passing(SKELETON_DELAY_MS - 1)
			expect(drawsTranscriptSkeleton()).toBe(false)
			await passing(1)

			expect(drawsTranscriptSkeleton()).toBe(true)
			expect(drawsEmptyState()).toBe(false)
		})

		it("draws the messages it holds at once, and no skeleton, while the first page is pending", async () => {
			const sent = threadOf({ id: "bot-1", name: "Nyx", said: "anyone here?" })
			render(
				screenOf({
					...sent,
					chat: {
						...sent.chat,
						state: { ...sent.chat.state, isFirstLoadPending: true },
					},
				}),
				{ wrapper: createQueryTestWrapper().wrapper },
			)
			await passingInSteps(SKELETON_SETTLED_MS)

			expect(screen.getByText("anyone here?")).toBeTruthy()
			expect(drawsTranscriptSkeleton()).toBe(false)
		})

		it("draws the empty state and no skeleton once the first page fails", async () => {
			const failFirstPage = await heldRoomOnFakeTimers()

			failFirstPage()
			await passingInSteps(SKELETON_SETTLED_MS)

			expect(drawsTranscriptSkeleton()).toBe(false)
			expect(
				document.querySelector(CONVERSATION_EMPTY_STATE_SLOT),
			).not.toBeNull()
		})
	})

	it("draws no empty state in a solo bot thread while its first page is pending", async () => {
		const { rerender } = render(screenOf(soloThreadWaitingOf(true)), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await settle()

		expect(drawsEmptyState()).toBe(false)

		rerender(screenOf(soloThreadWaitingOf(false)))
		await settle()

		expect(document.querySelector(EMPTY_STATE_SLOT)).not.toBeNull()
	})
})
