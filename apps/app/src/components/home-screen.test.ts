// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import {
	HomeEmptyStage,
	type HomeEmptyStageProps,
	HomeLines,
} from "@/components/home-screen"
import type { MissionInSpace, MissionState } from "@/lib/bindings"
import { createConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import { createScriptedDriver } from "@/lib/conversations/scripted-driver"
import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import { seatBots } from "@/lib/conversations/transcript-fixtures"
import { homeQueryKeys } from "@/lib/home/home-query-keys"
import { createRoomLog, type RoomLog } from "@/lib/home/home-room-lines"
import type { SpaceMissionsView } from "@/lib/missions/use-space-missions"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { conversationHrefOf } from "@/lib/tabs/conversation-tab-opening"

const feed = vi.hoisted(() => ({ entries: [] as MissionInSpace[] }))

vi.mock("@/lib/missions/use-space-missions", () => ({
	useSpaceMissions: (): Partial<SpaceMissionsView> => ({
		waitingOnYou: [],
		inProgress: [],
		earlierToday: feed.entries,
	}),
}))

const SPACE = "personal"

type HomeFixture = {
	atlas: Bot
	room: Conversation
	runtimes: ReturnType<typeof createConversationRuntimes>
	driver: ReturnType<typeof createScriptedDriver>
	store: ReturnType<typeof createFakeTranscriptStore>
	roomLog: RoomLog
}

const homeFixture = async (): Promise<HomeFixture> => {
	const store = createFakeTranscriptStore()
	const [atlas] = await seatBots(store, SPACE, ["Atlas"])
	const room = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Lisbon offsite",
		botIds: [atlas.id],
	})
	const driver = createScriptedDriver()
	const runtimes = createConversationRuntimes(driver, store)
	return { atlas, room, runtimes, driver, store, roomLog: createRoomLog() }
}

const missionIn = (
	room: Conversation,
	botId: string,
	state: MissionState,
): MissionInSpace => ({
	conversationId: room.id,
	conversationTitle: room.title,
	mission: {
		id: "mission-1",
		originConversationId: room.id,
		spaceId: SPACE,
		botId,
		threadConversationId: "mission-thread-1",
		objective: "Book the trip",
		ticket: {
			platform: "linear",
			externalId: "OPE-1",
			url: "https://linear.app/OPE-1",
			title: "Book flights and venue for Lisbon",
		},
		tools: [],
		state,
		stateSeq: 1,
		isAgentRunning: false,
		openedAt: 1,
		closedAt: 2,
		reportedAt: null,
		reportedTurnId: null,
		status: null,
		lastActivityAt: 2,
		lastActivity: null,
		commitsAhead: null,
		dirtyFiles: null,
		pullRequestUrl: null,
		branch: null,
		workspacePath: null,
	},
})

const homeLinesOf = (fixture: HomeFixture, onOpenRoom = vi.fn()) =>
	createElement(HomeLines, {
		openedAt: 0,
		roomLinesOf: (workingIds) => fixture.roomLog.linesOf("atlas", workingIds),
		agent: fixture.atlas,
		conversations: [fixture.room],
		store: fixture.store,
		spaceId: SPACE,
		onOpenRoom,
	})

const emptyStageOf = (
	fixture: HomeFixture,
	stage: Partial<HomeEmptyStageProps> = {},
) =>
	createElement(HomeEmptyStage, {
		draft: "Also the hotel",
		onDraftChange: vi.fn(),
		onSubmit: vi.fn(),
		onAttach: vi.fn(),
		attachments: [],
		onRemoveAttachment: vi.fn(),
		agent: fixture.atlas,
		bots: [fixture.atlas],
		conversations: [fixture.room],
		store: fixture.store,
		runtimes: fixture.runtimes,
		spaceId: SPACE,
		readerName: "Lea",
		isBandDismissed: true,
		lines: homeLinesOf(fixture),
		notice: null,
		isReadOnly: false,
		onOpenRoom: vi.fn(),
		onSelectAgent: vi.fn(),
		onDismissBand: vi.fn(),
		...stage,
	})

const composerField = () => screen.queryByPlaceholderText("Message Atlas")

let fixture: HomeFixture

beforeEach(async () => {
	feed.entries = []
	fixture = await homeFixture()
})

afterEach(() => {
	cleanup()
})

const workingIn = (conversationIds: string[]) =>
	vi
		.spyOn(fixture.store, "agentRooms")
		.mockResolvedValue([{ botId: fixture.atlas.id, conversationIds }])

it("names the room the agent works in, links its route, and opens it in its own tab", async () => {
	workingIn([fixture.room.id])
	const onOpenRoom = vi.fn()

	render(homeLinesOf(fixture, onOpenRoom), {
		wrapper: createQueryTestWrapper().wrapper,
	})

	const link = await screen.findByRole("link", { name: "Lisbon offsite" })
	expect(link.getAttribute("href")).toBe(
		conversationHrefOf({ conversationId: fixture.room.id }),
	)
	fireEvent.click(link)
	expect(screen.getByText("Atlas is working in")).toBeTruthy()
	expect(onOpenRoom).toHaveBeenCalledWith(fixture.room.id)
})

it("turns the room line done when the agent leaves the room", async () => {
	const rooms = workingIn([fixture.room.id])
	const { queryClient, wrapper } = createQueryTestWrapper()
	render(homeLinesOf(fixture), { wrapper })
	await screen.findByText("Atlas is working in")

	rooms.mockResolvedValue([{ botId: fixture.atlas.id, conversationIds: [] }])
	await act(() =>
		queryClient.invalidateQueries({ queryKey: homeQueryKeys.all }),
	)

	expect(await screen.findByText("Atlas worked in")).toBeTruthy()
	expect(screen.queryByText("Atlas is working in")).toBeNull()
})

const askApproval = async () => {
	const room = fixture.runtimes.runtimeFor(fixture.room.id)
	await room.open(fixture.room)
	await room.send("@Atlas book the seats")
	await waitFor(() => expect(fixture.driver.submissions).toHaveLength(1))
	fixture.driver.pushTo(fixture.atlas.id, [
		{
			type: "permissionRequested",
			request: {
				id: "seats-1",
				toolName: "create_order",
				title: "Book 14 seats",
				detail: "",
			},
		},
	])
}

const askQuestion = async () => {
	const room = fixture.runtimes.runtimeFor(fixture.room.id)
	await room.open(fixture.room)
	await room.send("@Atlas pick the deposit date")
	await waitFor(() => expect(fixture.driver.submissions).toHaveLength(1))
	fixture.driver.pushTo(fixture.atlas.id, [
		{
			type: "questionRequested",
			request: {
				id: "ask-1",
				questions: [
					{
						header: "Deposit",
						question: "When should the deposit go out?",
						options: [],
						multiSelect: false,
					},
				],
			},
		},
	])
}

it("puts an approval waiting in a room in place of the composer, then gives the draft back", async () => {
	workingIn([fixture.room.id])
	await askApproval()

	render(emptyStageOf(fixture), {
		wrapper: createQueryTestWrapper().wrapper,
	})

	const allowOnce = await screen.findByRole("button", { name: /Allow once/ })
	expect(composerField()).toBeNull()
	fireEvent.click(allowOnce)
	await waitFor(() =>
		expect(fixture.driver.decided).toEqual([
			{ botId: fixture.atlas.id, id: "seats-1", decision: "allowOnce" },
		]),
	)
	expect(
		(
			(await screen.findByPlaceholderText(
				"Message Atlas",
			)) as HTMLTextAreaElement
		).value,
	).toBe("Also the hotel")
})

it("puts a question waiting in a room in place of the composer, under who asked it and where", async () => {
	workingIn([fixture.room.id])
	await askQuestion()

	render(emptyStageOf(fixture), {
		wrapper: createQueryTestWrapper().wrapper,
	})

	expect(
		await screen.findByText("When should the deposit go out?"),
	).toBeTruthy()
	expect(composerField()).toBeNull()
	expect(screen.getAllByRole("link", { name: "Lisbon offsite" })).toHaveLength(
		2,
	)
})

it("opens a runtime only for the rooms the agent works in", async () => {
	const idle = await fixture.store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Quarterly review",
		botIds: [fixture.atlas.id],
	})
	workingIn([fixture.room.id])

	render(emptyStageOf(fixture, { conversations: [fixture.room, idle] }), {
		wrapper: createQueryTestWrapper().wrapper,
	})

	await screen.findByText("Atlas is working in")
	expect(fixture.runtimes.heldFor(fixture.room.id)).not.toBeNull()
	expect(fixture.runtimes.heldFor(idle.id)).toBeNull()
})

it("no longer lists a question waiting in a room among the lines", async () => {
	workingIn([fixture.room.id])
	await askQuestion()

	render(homeLinesOf(fixture), { wrapper: createQueryTestWrapper().wrapper })

	await screen.findByText("Atlas is working in")
	expect(screen.queryByText("When should the deposit go out?")).toBeNull()
})

it("shows the staged files, unstages a removed one, and sends files alone", async () => {
	const onRemoveAttachment = vi.fn()
	const onSubmit = vi.fn()

	render(
		emptyStageOf(fixture, {
			draft: "",
			attachments: [{ id: "notes", name: "release-notes.md", size: 4212 }],
			onRemoveAttachment,
			onSubmit,
		}),
		{ wrapper: createQueryTestWrapper().wrapper },
	)

	fireEvent.click(screen.getByRole("button", { name: "Send" }))
	expect(onSubmit).toHaveBeenCalledWith("")
	fireEvent.click(screen.getByRole("button", { name: /release-notes\.md/ }))
	expect(onRemoveAttachment).toHaveBeenCalledWith("notes")
})

it("surfaces a mission of the agent once it completes, then once it blocks", async () => {
	const { wrapper } = createQueryTestWrapper()
	feed.entries = [missionIn(fixture.room, fixture.atlas.id, "working")]
	const view = render(homeLinesOf(fixture), { wrapper })
	expect(screen.queryByText("Book flights and venue for Lisbon")).toBeNull()

	feed.entries = [missionIn(fixture.room, fixture.atlas.id, "done")]
	view.rerender(homeLinesOf(fixture))
	expect(screen.getByText("Completed")).toBeTruthy()

	feed.entries = [missionIn(fixture.room, fixture.atlas.id, "waiting_human")]
	view.rerender(homeLinesOf(fixture))
	expect(screen.getByText("Blocked")).toBeTruthy()
	expect(screen.getByText("Book flights and venue for Lisbon")).toBeTruthy()
})

it("leaves out the missions of another agent", () => {
	feed.entries = [missionIn(fixture.room, "someone-else", "done")]

	render(homeLinesOf(fixture), { wrapper: createQueryTestWrapper().wrapper })

	expect(screen.queryByText("Completed")).toBeNull()
})
