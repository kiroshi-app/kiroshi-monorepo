// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import { createElement, useState } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	HomeEmptyStage,
	type HomeEmptyStageProps,
	HomeLines,
} from "@/components/home-screen"
import { useHomeSend } from "@/components/use-home-send"
import type { LibraryItem, MissionInSpace, MissionState } from "@/lib/bindings"
import {
	type AttachmentsController,
	type AttachmentsPort,
	createAttachmentsController,
} from "@/lib/chat/attachments-controller"
import {
	createDraftsController,
	type DraftsController,
} from "@/lib/chat/drafts-controller"
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

const shelf = vi.hoisted(() => ({ items: [] as LibraryItem[] }))

vi.mock("@/lib/library/library-reads", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/library/library-reads")>()),
	readLibraryItems: () => Promise.resolve(shelf.items),
}))

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseFailureNotice: vi.fn(() => "notice"),
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
		isSending: false,
		onDraftChange: vi.fn(),
		onSubmit: vi.fn(),
		onAttach: vi.fn(),
		onStageDocument: vi.fn(),
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
	shelf.items = []
	fixture = await homeFixture()
	vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:home-preview")
	vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined)
})

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	vi.clearAllMocks()
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

it("marks the send busy and holds the submit while it is in flight, then frees it", () => {
	const { wrapper } = createQueryTestWrapper()
	const onSubmit = vi.fn()
	const { rerender } = render(
		emptyStageOf(fixture, { isSending: true, onSubmit }),
		{ wrapper },
	)
	const send = () => screen.getByRole("button", { name: "Send" })

	expect(send().getAttribute("aria-busy")).toBe("true")
	fireEvent.click(send())
	expect(onSubmit).not.toHaveBeenCalled()

	rerender(emptyStageOf(fixture, { isSending: false, onSubmit }))

	expect(send().hasAttribute("aria-busy")).toBe(false)
	fireEvent.click(send())
	expect(onSubmit).toHaveBeenCalledWith("Also the hotel")
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

it("puts the keyboard after the draft on each arrival, and leaves it alone in between", async () => {
	const { wrapper } = createQueryTestWrapper()
	const { rerender } = render(emptyStageOf(fixture, { arrivalKey: "first" }), {
		wrapper,
	})
	const field = () =>
		screen.getByPlaceholderText<HTMLTextAreaElement>("Message Atlas")

	await waitFor(() => expect(document.activeElement).toBe(field()))
	field().blur()
	rerender(emptyStageOf(fixture, { arrivalKey: "first" }))
	expect(document.activeElement).not.toBe(field())

	rerender(emptyStageOf(fixture, { arrivalKey: "second" }))

	expect(document.activeElement).toBe(field())
	expect(field().value).toBe("Also the hotel")
	expect(field().selectionStart).toBe("Also the hotel".length)
	expect(field().selectionEnd).toBe("Also the hotel".length)
})

type HomeWorkspace = {
	attachments: AttachmentsController
	drafts: DraftsController
	openConversation: (conversationId: string) => void
}

const storeEveryFile: AttachmentsPort["store"] = (_owner, files) =>
	Promise.resolve(files.map((file) => `/data/${file.name}`))

const homeWorkspaceWith = (
	send: AttachmentsPort["send"] = () => true,
): HomeWorkspace => ({
	attachments: createAttachmentsController({ store: storeEveryFile, send }),
	drafts: createDraftsController(),
	openConversation: vi.fn(),
})

type HomePageProps = {
	workspace: HomeWorkspace
	bots: Bot[]
}

const HomePage = ({ workspace, bots }: HomePageProps) => {
	const [agent, setAgent] = useState(bots[0])
	const send = useHomeSend({
		agentId: agent.id,
		spaceId: SPACE,
		attachments: workspace.attachments,
		drafts: workspace.drafts,
		runtimes: fixture.runtimes,
		startConversation: () => Promise.resolve(fixture.room),
		discardConversation: () => Promise.resolve(),
		openConversation: workspace.openConversation,
	})

	return emptyStageOf(fixture, {
		...send,
		agent,
		bots,
		arrivalKey: "arrival",
		onSelectAgent: (botId) =>
			setAgent(bots.find(({ id }) => id === botId) ?? agent),
	})
}

const mountHomePage = (
	workspace = homeWorkspaceWith(),
	bots = [fixture.atlas],
) =>
	render(createElement(HomePage, { workspace, bots }), {
		wrapper: createQueryTestWrapper().wrapper,
	})

const screenshot = () =>
	new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" })

const fileDrag = (type: string, files: File[]) => {
	const event = new Event(type, { bubbles: true, cancelable: true })
	Object.defineProperty(event, "dataTransfer", {
		value: {
			types: ["Files"],
			files,
			items: files.map(() => ({ kind: "file" })),
		},
	})
	return event
}

const greeting = () => screen.getByRole("heading", { level: 1 })

const dragOverGreeting = (type: string, files: File[]) => {
	act(() => {
		greeting().dispatchEvent(fileDrag(type, files))
	})
}

const fieldOf = (agentName: string) =>
	screen.getByPlaceholderText<HTMLTextAreaElement>(`Message ${agentName}`)

const isComposerDropTarget = () =>
	fieldOf("Atlas").closest("form")?.getAttribute("data-drop-target")

const chipOf = (name: RegExp) => screen.findByRole("button", { name })

const documentIn = (name: string): LibraryItem => ({
	name,
	kind: "document",
	path: `/library/${name}`,
	bytes: 2048,
	modifiedAt: 1,
	createdAt: 1,
})

const pickAgent = async (from: string, to: string) => {
	fireEvent.click(screen.getByRole("button", { name: new RegExp(from) }))
	fireEvent.click(
		await screen.findByRole("menuitemradio", { name: new RegExp(to) }),
	)
}

it("stages an image dropped away from the composer as a chip in it", async () => {
	mountHomePage()

	dragOverGreeting("drop", [screenshot()])

	expect(await chipOf(/shot\.png/)).toBeTruthy()
})

it("shows the composer as the drop target while a file is dragged over the page", () => {
	mountHomePage()
	expect(isComposerDropTarget()).toBe("false")

	dragOverGreeting("dragenter", [screenshot()])
	expect(isComposerDropTarget()).toBe("true")

	dragOverGreeting("dragleave", [screenshot()])
	expect(isComposerDropTarget()).toBe("false")
})

it("stages nothing dropped on a page that is read only", () => {
	const onAttach = vi.fn()
	render(emptyStageOf(fixture, { isReadOnly: true, onAttach }), {
		wrapper: createQueryTestWrapper().wrapper,
	})

	dragOverGreeting("drop", [screenshot()])

	expect(onAttach).not.toHaveBeenCalled()
})

it("lists the Library documents of the Space under the attach button, and attaches the picked one", async () => {
	shelf.items = [
		documentIn("lisbon-brief.md"),
		{ ...documentIn("venue.png"), kind: "image" },
	]
	mountHomePage()

	fireEvent.click(
		screen.getByRole("combobox", { name: i18n.t("chat:attachments.add") }),
	)
	const document = await screen.findByRole("option", { name: /lisbon-brief/ })
	expect(screen.queryByRole("option", { name: /venue/ })).toBeNull()
	fireEvent.click(document)

	expect(await chipOf(/lisbon-brief/)).toBeTruthy()
})

it("opens the commands of the selected agent on a slash, and writes the picked one", async () => {
	const [nyx] = await seatBots(fixture.store, SPACE, ["Nyx"])
	await fixture.store.recordBotCommands(fixture.atlas.id, [
		{ name: "review", description: "Review the diff" },
	])
	await fixture.store.recordBotCommands(nyx.id, [{ name: "deploy" }])
	mountHomePage(homeWorkspaceWith(), [fixture.atlas, nyx])

	fireEvent.change(fieldOf("Atlas"), { target: { value: "/" } })
	const review = await screen.findByRole("option", { name: /\/review/ })
	expect(screen.queryByRole("option", { name: /\/deploy/ })).toBeNull()
	fireEvent.click(review)
	expect(fieldOf("Atlas").value).toBe("/review ")

	await pickAgent("Atlas", "Nyx")
	fireEvent.change(fieldOf("Nyx"), { target: { value: "/" } })

	expect(await screen.findByRole("option", { name: /\/deploy/ })).toBeTruthy()
	expect(screen.queryByRole("option", { name: /\/review/ })).toBeNull()
})

it("keeps the typed text and the files in the composer when the send fails", async () => {
	mountHomePage(homeWorkspaceWith(() => false))
	fireEvent.change(fieldOf("Atlas"), { target: { value: "Look at this" } })
	dragOverGreeting("drop", [screenshot()])
	await chipOf(/shot\.png/)

	fireEvent.click(screen.getByRole("button", { name: "Send" }))

	await waitFor(() =>
		expect(vi.mocked(raiseFailureNotice)).toHaveBeenCalledWith(
			expect.objectContaining({
				title: i18n.t("chat:home.failure.send.title"),
			}),
		),
	)
	expect(fieldOf("Atlas").value).toBe("Look at this")
	expect(await chipOf(/shot\.png/)).toBeTruthy()
})

it("puts the keyboard in the composer when another agent is picked", async () => {
	const [nyx] = await seatBots(fixture.store, SPACE, ["Nyx"])
	mountHomePage(homeWorkspaceWith(), [fixture.atlas, nyx])
	await waitFor(() => expect(document.activeElement).toBe(fieldOf("Atlas")))

	await pickAgent("Atlas", "Nyx")

	await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
	expect(document.activeElement).toBe(fieldOf("Nyx"))
})
