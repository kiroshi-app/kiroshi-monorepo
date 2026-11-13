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
} from "@/components/home-screen"
import { useHomeSend } from "@/components/use-home-send"
import type { LibraryItem } from "@/lib/bindings"
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
import type {
	Bot,
	Conversation,
	ConversationInPage,
} from "@/lib/conversations/store-contract"
import { seatBots } from "@/lib/conversations/transcript-fixtures"
import { localDayAt, type TodayRoster } from "@/lib/home/today-conversations"
import { createHttpHost, raiseRefusalNotice } from "@/lib/host/http"
import { startOfLocalDay } from "@/lib/missions/missions-model"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

type HostHandler = (event: { payload: unknown }, hostId: string | null) => void

type HostListener = { event: string; handler: HostHandler }

const host = vi.hoisted(() => ({ listeners: new Set<HostListener>() }))

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	listen: async (event: string, handler: HostHandler) => {
		const listener = { event, handler }
		host.listeners.add(listener)
		return () => host.listeners.delete(listener)
	},
}))

const emitOnHost = (heard: string) =>
	act(async () => {
		for (const { event, handler } of host.listeners) {
			if (event === heard) {
				handler({ payload: null }, null)
			}
		}
	})

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

const HOUR_MS = 60 * 60 * 1000
const FIRST_MINTED_AT = 1
const NOON = startOfLocalDay(FIRST_MINTED_AT) + 12 * HOUR_MS
const NEXT_NOON = localDayAt(NOON).end + 12 * HOUR_MS

const spokenAtNoon = (conversations: Conversation[]): TodayRoster => ({
	conversations,
	previews: Object.fromEntries(
		conversations.map(({ id, title }) => [
			id,
			{ at: NOON, text: `Last word on ${title}` },
		]),
	),
	hostStates: {},
	now: NOON,
})

type HomeFixture = {
	atlas: Bot
	room: Conversation
	runtimes: ReturnType<typeof createConversationRuntimes>
	driver: ReturnType<typeof createScriptedDriver>
	store: ReturnType<typeof createFakeTranscriptStore>
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
	return { atlas, room, runtimes, driver, store }
}

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
		store: fixture.store,
		spaceId: SPACE,
		spaceRowId: SPACE,
		readerName: "Lea",
		isBandDismissed: true,
		notice: null,
		isReadOnly: false,
		today: spokenAtNoon([]),
		onSelectAgent: vi.fn(),
		onDismissBand: vi.fn(),
		onOpenConversation: vi.fn(),
		...stage,
	})

let fixture: HomeFixture

beforeEach(async () => {
	shelf.items = []
	fixture = await homeFixture()
	vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:home-preview")
	vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined)
})

afterEach(() => {
	cleanup()
	host.listeners.clear()
	vi.restoreAllMocks()
	vi.clearAllMocks()
})

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

it("keeps the composer typeable and sendable, with no question card and no line, while a room holds a question", async () => {
	await askQuestion()
	const onDraftChange = vi.fn()
	const onSubmit = vi.fn()

	await waitFor(() =>
		expect(
			fixture.runtimes.heldFor(fixture.room.id)?.getState().pendingPrompt,
		).toBeTruthy(),
	)

	render(emptyStageOf(fixture, { onDraftChange, onSubmit }), {
		wrapper: createQueryTestWrapper().wrapper,
	})

	fireEvent.change(screen.getByPlaceholderText("Message Atlas"), {
		target: { value: "Also the venue" },
	})
	fireEvent.click(screen.getByRole("button", { name: "Send" }))

	expect(onDraftChange).toHaveBeenCalledWith("Also the venue")
	expect(onSubmit).toHaveBeenCalledWith("Also the hotel")
	expect(screen.queryByText("When should the deposit go out?")).toBeNull()
	expect(screen.queryByRole("link", { name: "Lisbon offsite" })).toBeNull()
	expect(screen.queryByText(/working in|worked in/)).toBeNull()
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

const storeEveryFile: AttachmentsPort["store"] = (_owner, files) =>
	Promise.resolve(files.map((file) => `/data/${file.name}`))

type HomePageProps = {
	attachments: AttachmentsController
	drafts: DraftsController
	bots: Bot[]
}

const HomePage = ({ attachments, drafts, bots }: HomePageProps) => {
	const [agent, setAgent] = useState(bots[0])
	const send = useHomeSend({
		agentId: agent.id,
		spaceId: SPACE,
		attachments,
		drafts,
		runtimes: fixture.runtimes,
		startConversation: () => Promise.resolve(fixture.room),
		discardConversation: () => Promise.resolve(),
		openConversation: () => undefined,
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
	bots = [fixture.atlas],
	send: AttachmentsPort["send"] = () => true,
) =>
	render(
		createElement(HomePage, {
			attachments: createAttachmentsController({ store: storeEveryFile, send }),
			drafts: createDraftsController(),
			bots,
		}),
		{ wrapper: createQueryTestWrapper().wrapper },
	)

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
	mountHomePage([fixture.atlas, nyx])

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
	mountHomePage([fixture.atlas], () => false)
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
	mountHomePage([fixture.atlas, nyx])
	await waitFor(() => expect(document.activeElement).toBe(fieldOf("Atlas")))

	await pickAgent("Atlas", "Nyx")

	await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
	expect(document.activeElement).toBe(fieldOf("Nyx"))
})

const todayListOf = (agentName: string) =>
	screen.queryByRole("list", { name: `Today with ${agentName}` })

const todayRow = (title: string) =>
	screen.queryByRole("button", { name: title })

const findTodayRow = (title: string) =>
	screen.findByRole("button", { name: title })

const todayTitles = () =>
	screen
		.getAllByRole("listitem")
		.map((item) => item.querySelector("button")?.getAttribute("aria-label"))

const NO_ROSTER_PAGE = spokenAtNoon([])

const roomWith = (bot: Bot, title: string) =>
	fixture.store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title,
		botIds: [bot.id],
	})

const mountTodayOf = (stage: Partial<HomeEmptyStageProps> = {}) =>
	render(emptyStageOf(fixture, { today: NO_ROSTER_PAGE, ...stage }), {
		wrapper: createQueryTestWrapper().wrapper,
	})

it("lists a conversation of today with the agent that no roster page holds", async () => {
	mountTodayOf()

	expect(await findTodayRow("Lisbon offsite")).toBeTruthy()
	expect(todayListOf("Atlas")).toBeTruthy()
})

it("lists the three most recent conversations of the day, newest first", async () => {
	for (const title of ["Second", "Third", "Newest"]) {
		await roomWith(fixture.atlas, title)
	}
	mountTodayOf()

	await findTodayRow("Newest")

	expect(todayTitles()).toEqual(["Newest", "Third", "Second"])
})

it("swaps the Today list to the conversations of the agent picked in the composer", async () => {
	const [nyx] = await seatBots(fixture.store, SPACE, ["Nyx"])
	await roomWith(nyx, "Quarterly report")
	const stage = { bots: [fixture.atlas, nyx], today: NO_ROSTER_PAGE }
	const { rerender } = mountTodayOf(stage)

	expect(await findTodayRow("Lisbon offsite")).toBeTruthy()
	expect(todayListOf("Atlas")).toBeTruthy()
	expect(todayRow("Quarterly report")).toBeNull()

	rerender(emptyStageOf(fixture, { ...stage, agent: nyx }))

	expect(await findTodayRow("Quarterly report")).toBeTruthy()
	expect(todayListOf("Atlas")).toBeNull()
	expect(todayListOf("Nyx")).toBeTruthy()
	expect(todayRow("Lisbon offsite")).toBeNull()
})

it("shows the live last message of a row the roster holds", async () => {
	mountTodayOf({ today: spokenAtNoon([fixture.room]) })

	await findTodayRow("Lisbon offsite")

	expect(screen.getByText("Last word on Lisbon offsite")).toBeTruthy()
})

it("lists a conversation that becomes active while the page is open", async () => {
	mountTodayOf()
	await findTodayRow("Lisbon offsite")

	await roomWith(fixture.atlas, "Quarterly report")
	expect(todayRow("Quarterly report")).toBeNull()
	await emitOnHost("conversation://created")

	expect(await findTodayRow("Quarterly report")).toBeTruthy()
})

const roomOnHost = async (): Promise<ConversationInPage> => {
	const { start, end } = localDayAt(NOON)
	const [row] = await fixture.store.conversationTodayOfAgent(
		SPACE,
		fixture.atlas.id,
		start,
		end,
	)
	return row
}

it("shows the question of a listed row once the host says it needs you", async () => {
	const idle = await roomOnHost()
	const todayRead = vi
		.spyOn(fixture.store, "conversationTodayOfAgent")
		.mockResolvedValue([idle])
	mountTodayOf()
	await findTodayRow("Lisbon offsite")

	todayRead.mockResolvedValue([
		{
			...idle,
			state: "needs_you",
			pendingPrompt: {
				promptId: "ask-1",
				kind: "question",
				text: "When should the deposit go out?",
			},
		},
	])
	await emitOnHost("conversation://state-changed")

	expect(
		await screen.findByText("When should the deposit go out?"),
	).toBeTruthy()
})

it("reads the new day once the local day changes", async () => {
	const todayRead = vi.spyOn(fixture.store, "conversationTodayOfAgent")
	const { rerender } = mountTodayOf()
	await findTodayRow("Lisbon offsite")

	rerender(
		emptyStageOf(fixture, { today: { ...NO_ROSTER_PAGE, now: NEXT_NOON } }),
	)

	const nextDay = localDayAt(NEXT_NOON)
	await waitFor(() =>
		expect(todayRead).toHaveBeenLastCalledWith(
			SPACE,
			fixture.atlas.id,
			nextDay.start,
			nextDay.end,
			expect.anything(),
		),
	)
	await waitFor(() => expect(todayRow("Lisbon offsite")).toBeNull())
	expect(screen.queryByRole("heading", { name: /Today with/ })).toBeNull()
})

it("opens the conversation of the Today row that is clicked", async () => {
	const onOpenConversation = vi.fn()
	mountTodayOf({ onOpenConversation })

	fireEvent.click(await findTodayRow("Lisbon offsite"))

	expect(onOpenConversation).toHaveBeenCalledWith(fixture.room.id)
})

it("draws no Today list and no header when the agent has no conversation today", async () => {
	const todayRead = vi.spyOn(fixture.store, "conversationTodayOfAgent")
	mountTodayOf({ today: { ...NO_ROSTER_PAGE, now: NEXT_NOON } })

	await waitFor(() => expect(todayRead).toHaveBeenCalled())
	await act(async () => {
		await todayRead.mock.results[0].value
	})

	expect(screen.queryByRole("heading", { name: /Today with/ })).toBeNull()
	expect(screen.queryByRole("list")).toBeNull()
	expect(todayRow("Lisbon offsite")).toBeNull()
})

it("raises the failed read of today and keeps the composer usable", async () => {
	vi.spyOn(fixture.store, "conversationTodayOfAgent").mockRejectedValue({
		kind: "unavailable",
	})
	const onDraftChange = vi.fn()
	mountTodayOf({ onDraftChange })

	await waitFor(() =>
		expect(vi.mocked(raiseFailureNotice)).toHaveBeenCalledWith(
			expect.objectContaining({
				title: i18n.t("chat:home.failure.rooms.title"),
			}),
		),
	)
	fireEvent.change(fieldOf("Atlas"), { target: { value: "Still here" } })

	expect(onDraftChange).toHaveBeenCalledWith("Still here")
	expect(screen.queryByRole("list")).toBeNull()
})

const TODAY_COMMAND = "conversation_today_of_agent"

const hostKnowingNoTodayRead = () =>
	createHttpHost({
		host: "http://192.168.1.20:45367",
		token: "joined",
		fetch: async () =>
			new Response(`this host knows no command named ${TODAY_COMMAND}`, {
				status: 404,
			}),
		openSocket: () => ({
			onopen: null,
			onmessage: null,
			onclose: null,
			close: () => undefined,
		}),
		onDown: vi.fn(),
		onUp: vi.fn(),
		onReopened: vi.fn(),
		onRefused: raiseRefusalNotice,
	})

it("draws no Today list and raises the older-host notice alone when the host knows no read of today", async () => {
	const host = hostKnowingNoTodayRead()
	const todayRead = vi
		.spyOn(fixture.store, "conversationTodayOfAgent")
		.mockImplementation(() => host.invoke(TODAY_COMMAND))
	mountTodayOf()

	await waitFor(() => expect(todayRead).toHaveBeenCalled())
	await act(async () => {
		await expect(todayRead.mock.results[0].value).rejects.toMatchObject({
			refusalKind: "unknownCommand",
		})
	})
	await waitFor(() => expect(vi.mocked(raiseFailureNotice)).toHaveBeenCalled())

	expect(vi.mocked(raiseFailureNotice)).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({
			title: i18n.t("chat:screen.notice.failed"),
			description: i18n.t("chat:screen.notice.hostOutdated"),
		}),
	)
	expect(screen.queryByRole("list")).toBeNull()
})
