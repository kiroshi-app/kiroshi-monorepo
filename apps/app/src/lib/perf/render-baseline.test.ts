// @vitest-environment happy-dom

import type { QueryClient } from "@tanstack/react-query"
import { defaultStringifySearch } from "@tanstack/react-router"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement, Profiler, type ProfilerOnRenderCallback } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { setRenderProbe } from "@workspace/ui/lib/render-probe"

import "@workspace/ui/lib/i18n"

import { newBotIdentity } from "@/lib/bots/bot-settings"
import { ROSTER_PAGE_SIZE } from "@/lib/bots/roster-pages"
import type { FakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { type FakeLayout, fakeLayout } from "@/lib/perf/fake-layout"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { writeSpaceTabs } from "@/lib/tabs/tabs-mirror"
import { spaceTabsOn } from "@/lib/tabs/tabs-model"
import { readMirror, writeMirror } from "@/lib/user/preferences-mirror"

const harness = vi.hoisted(
	(): { store: TranscriptStore | null; driver: FakeChatDriver | null } => ({
		store: null,
		driver: null,
	}),
)

const builds = vi.hoisted(() => ({ markdownRenders: 0 }))

vi.mock("@/lib/conversations/create-store", () => ({
	createTranscriptStore: () => harness.store,
}))

vi.mock("@workspace/ui/components/markdown", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@workspace/ui/components/markdown")>()
	const { createElement: element } = await import("react")
	return {
		...actual,
		Markdown: (props: Parameters<typeof actual.Markdown>[0]) => {
			builds.markdownRenders += 1
			return element(actual.Markdown, props)
		},
	}
})

vi.mock(
	"@workspace/ui/components/app-sidebar-bot-row",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@workspace/ui/components/app-sidebar-bot-row")
			>()
		const { createElement: element } = await import("react")
		const { probeRender: probe } = await import(
			"@workspace/ui/lib/render-probe"
		)
		return {
			...actual,
			BotRosterRow: (props: Parameters<typeof actual.BotRosterRow>[0]) => {
				probe("RosterRow", props.bot.id)
				return element(actual.BotRosterRow, props)
			},
		}
	},
)

vi.mock(
	"@workspace/ui/components/app-sidebar-conversation-row",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@workspace/ui/components/app-sidebar-conversation-row")
			>()
		const { createElement: element } = await import("react")
		const { probeRender: probe } = await import(
			"@workspace/ui/lib/render-probe"
		)
		return {
			...actual,
			ConversationRosterRow: (
				props: Parameters<typeof actual.ConversationRosterRow>[0],
			) => {
				probe("RosterRow", props.conversation.id)
				return element(actual.ConversationRosterRow, props)
			},
		}
	},
)

vi.mock("@/lib/chat/create-driver", async () => {
	const { withFakeHostWrites } = await import(
		"@/lib/conversations/fake-host-writes"
	)
	return {
		createChatDriver: (store: TranscriptStore) =>
			harness.driver && withFakeHostWrites(harness.driver, store),
	}
})

vi.mock("@/lib/applications/application-transport", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/lib/applications/application-transport")
		>()
	return {
		...actual,
		applicationTransport: {
			...actual.applicationTransport,
			installs: async () => [],
		},
	}
})

type HostHandler = (event: { payload: unknown }, hostId: string | null) => void

const hostEvents = vi.hoisted(() => new Map<string, Set<HostHandler>>())

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	listen: async (event: string, handler: HostHandler) => {
		const handlers = hostEvents.get(event) ?? new Set()
		handlers.add(handler)
		hostEvents.set(event, handlers)
		return () => handlers.delete(handler)
	},
}))

const { App } = await import("@/App")

const STEP_MS = 1

const STEP_LIMIT = 200

const STEPS_INTO_TURN = 6

const MOUNT_MS = 200

const MOUNT_TASKS = 200

const SPACE_COUNT = 3

const BOTS_PER_SPACE = 2

const FRAME_COUNT = 60

const FRAME_MS = 1000 / 60

const WORDS_PER_CHUNK = 3

const SHORT_TURN_CHUNKS = 11

const LONG_TURN_CHUNKS = 22

const OPEN_STEP_LIMIT = 400

const LONG_TRANSCRIPT_MESSAGES = 500

const LONG_TRANSCRIPT_TIMEOUT_MS = 30_000

const THREAD_REOPEN_TIMEOUT_MS = 30_000

const LONG_THREAD_RUNS = 200

const OPEN_FRAME_LIMIT = 4_000

const OLDER_PAGES = 3

const SETTLE_TASKS = 20

const OLDER_LABEL = "Load older messages"

const replyOf = (chunks: number) =>
	"word ".repeat(chunks * WORDS_PER_CHUNK).trim()

const maxOf = (counts: number[]) =>
	counts.length === 0 ? 0 : Math.max(...counts)

const seedRoster = async (store: TranscriptStore) => {
	const spaceIds = (await store.spaces()).map((space) => space.id)
	while (spaceIds.length < SPACE_COUNT) {
		const born = await store.createSpace(`Space ${spaceIds.length}`)
		spaceIds.push(born.id)
	}
	for (const spaceId of spaceIds) {
		const held = await store.bots(spaceId)
		for (let index = held.length; index < BOTS_PER_SPACE; index += 1) {
			await store.createBot(newBotIdentity(held), spaceId)
		}
	}
}

type FrameClock = { advance: (now: number) => void }

const seedTranscript = async (
	store: TranscriptStore,
	botId: string,
	messages: number,
) => {
	const { id: conversationId } = await store.mainChat(botId)
	for (let index = 0; index < messages; index += 1) {
		const turnId = `${botId}-turn-${index}`
		const id = `${botId}-m${index}`
		await store.startTurn({ conversationId, id: turnId, startedAt: index })
		if (index % 2 === 0) {
			await store.appendUserMessage({
				authorBotId: null,
				content: `Question ${index} for the transcript`,
				conversationId,
				createdAt: index,
				id,
				repliedToMessageId: null,
				turnId,
			})
		} else {
			await store.openAssistantMessage({
				authorBotId: botId,
				conversationId,
				createdAt: index,
				id,
				repliedToMessageId: null,
				turnId,
			})
			await store.appendText(id, `Answer ${index} in prose`)
			await store.finalizeMessage(id, "complete")
		}
		await store.completeTurn(turnId, index)
	}
}

type CommitCounter = { count: number; onRender: ProfilerOnRenderCallback }

const countCommits = (): CommitCounter => {
	const counter: CommitCounter = {
		count: 0,
		onRender: () => {
			counter.count += 1
		},
	}
	return counter
}

const rowFor = (name: string) => {
	const labels = [...document.querySelectorAll('[data-slot="roster-row-name"]')]
	const row = labels.find((label) => label.textContent === name)
	const button = row?.closest("button")
	if (!button) {
		throw new Error(`no roster row for ${name}`)
	}
	return button
}

const takeFrameClock = (): FrameClock => {
	const pending = new Map<number, FrameRequestCallback>()
	let nextId = 1
	globalThis.requestAnimationFrame = (callback) => {
		const id = nextId
		nextId += 1
		pending.set(id, callback)
		return id
	}
	globalThis.cancelAnimationFrame = (id: number) => {
		pending.delete(id)
	}
	return {
		advance: (now) => {
			const due = [...pending.values()]
			pending.clear()
			for (const callback of due) {
				callback(now)
			}
		},
	}
}

type CanvasPaint = { canvas: HTMLCanvasElement; calls: string[] }

type PaintRecorder = {
	take: () => CanvasPaint[]
	restore: () => void
}

const AVATAR_CANVAS = '[data-slot="companion-field"] canvas'

const recordAvatarCanvasPaints = (): PaintRecorder => {
	const original = HTMLCanvasElement.prototype.getContext
	let paints: CanvasPaint[] = []
	const open = new Map<HTMLCanvasElement, CanvasPaint>()
	const contextFor = (canvas: HTMLCanvasElement) => {
		const call =
			(name: string) =>
			(...args: unknown[]) => {
				let paint = open.get(canvas)
				if (name === "clearRect" || !paint) {
					paint = { canvas, calls: [] }
					open.set(canvas, paint)
					paints.push(paint)
				}
				paint.calls.push(`${name}(${args.join(",")})`)
			}
		return {
			clearRect: call("clearRect"),
			fillRect: call("fillRect"),
			beginPath: call("beginPath"),
			arc: call("arc"),
			moveTo: call("moveTo"),
			lineTo: call("lineTo"),
			fill: call("fill"),
			stroke: call("stroke"),
		}
	}
	HTMLCanvasElement.prototype.getContext = function patched(
		this: HTMLCanvasElement,
	) {
		return this.matches(AVATAR_CANVAS) ? contextFor(this) : null
	} as unknown as typeof original
	return {
		take: () => {
			const taken = paints
			paints = []
			open.clear()
			return taken
		},
		restore: () => {
			HTMLCanvasElement.prototype.getContext = original
		},
	}
}

type FrameTally = {
	paints: number
	draws: number
	repeatedPaints: number
	movingAvatars: number
}

const tallyFrames = (frames: FrameClock): FrameTally => {
	const recorder = recordAvatarCanvasPaints()
	const lastPaint = new Map<HTMLCanvasElement, string>()
	let paints = 0
	let draws = 0
	let repeatedPaints = 0
	for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
		frames.advance(frame * FRAME_MS)
		for (const { canvas, calls } of recorder.take()) {
			const drawn = calls.join(";")
			if (lastPaint.get(canvas) === drawn) repeatedPaints += 1
			lastPaint.set(canvas, drawn)
			paints += 1
			draws += calls.length - 1
		}
	}
	recorder.restore()
	return { paints, draws, repeatedPaints, movingAvatars: lastPaint.size }
}

type RenderTally = {
	countOf: (name: string) => number
	entriesOf: (name: string) => [string, number][]
	reset: () => void
}

const tallyRenders = (): RenderTally => {
	let counts = new Map<string, number>()
	setRenderProbe((name, key) => {
		const id = key === undefined ? name : `${name} ${key}`
		counts.set(id, (counts.get(id) ?? 0) + 1)
	})
	return {
		countOf: (name) => counts.get(name) ?? 0,
		entriesOf: (name) =>
			[...counts.entries()]
				.filter(([id]) => id.startsWith(`${name} `))
				.map(([id, count]): [string, number] => [
					id.slice(name.length + 1),
					count,
				]),
		reset: () => {
			counts = new Map()
		},
	}
}

const settle = async (ms: number) => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms)
	})
}

const submitPrompt = async (text: string) => {
	const input = screen.getByRole("textbox", { name: "Message" })
	fireEvent.change(input, { target: { value: text } })
	await act(async () => {
		fireEvent.keyDown(input, { key: "Enter" })
	})
}

type TurnWatch = { chunks: number; isEnded: boolean }

const watchTurn = (driver: FakeChatDriver): TurnWatch => {
	const watch = { chunks: 0, isEnded: false }
	void driver.subscribe(({ event }) => {
		if (event.type === "messageDelta") {
			watch.chunks += 1
		}
		if (event.type === "turnEnded") {
			watch.isEnded = true
		}
	})
	return watch
}

const streamOneTurn = async (
	text: string,
	watch: TurnWatch,
	store: TranscriptStore,
) => {
	watch.isEnded = false
	watch.chunks = 0
	await submitPrompt(text)
	await emitHostWorking(store)
	for (let step = 0; step < STEP_LIMIT && !watch.isEnded; step += 1) {
		await settle(STEP_MS)
	}
	await settle(STEP_MS)
}

const openOnFirstCompanion = async (store: TranscriptStore) => {
	const [space] = await store.spaces()
	const [bot] = space ? await store.bots(space.id) : []
	if (!space || !bot) {
		throw new Error("no companion to open on")
	}
	writeSpaceTabs(
		space.id,
		spaceTabsOn(`/${defaultStringifySearch({ bot: bot.id })}`),
	)
}

const seedFirstRunDone = () => {
	writeMirror({ ...readMirror(), firstRunDone: true })
}

const mountApp = async (replyFor?: (prompt: string) => string) => {
	const frames = takeFrameClock()
	layout = fakeLayout()
	seedFirstRunDone()
	const store = createFakeTranscriptStore()
	harness.store = store
	harness.driver = createFakeChatDriver({ stepMs: STEP_MS, replyFor })
	const watch = watchTurn(harness.driver)
	await seedRoster(store)
	await openOnFirstCompanion(store)
	const { queryClient, wrapper } = createQueryTestWrapper()
	render(createElement(App), { wrapper })
	await settle(MOUNT_MS)
	return { watch, frames, store, queryClient }
}

const emitOnHost = (event: string, payload: unknown) =>
	act(async () => {
		for (const handler of [...(hostEvents.get(event) ?? [])]) {
			handler({ payload }, null)
		}
	})

const emitHostWorking = async (store: TranscriptStore) => {
	const { spaceId, conversation } = await soloThreadRowOf(store)
	await emitOnHost("conversation://state-changed", {
		conversationId: conversation.id,
		spaceId,
		state: "working",
	})
}

const RECEIVED_TEXT = "A message received"

const soloThreadRowOf = async (store: TranscriptStore) => {
	const [space] = await store.spaces()
	const [bot] = await store.bots(space.id)
	const { pinned, conversations } = await store.conversationPage(
		space.id,
		null,
		ROSTER_PAGE_SIZE,
	)
	const thread = [...pinned, ...conversations].find(
		({ soloBotId }) => soloBotId === bot.id,
	)
	if (!thread) {
		throw new Error(`no solo thread for ${bot.name}`)
	}
	return { spaceId: space.id, conversation: thread }
}

const storeMessageReceived = async (
	store: TranscriptStore,
	text = RECEIVED_TEXT,
) => {
	const [space] = await store.spaces()
	const [bot] = await store.bots(space.id)
	const { id: conversationId } = await store.mainChat(bot.id)
	const turnId = `${bot.id}-received-${text}`
	const id = `${bot.id}-received-message-${text}`
	await store.startTurn({ conversationId, id: turnId, startedAt: Date.now() })
	await store.openAssistantMessage({
		authorBotId: bot.id,
		conversationId,
		createdAt: Date.now(),
		id,
		repliedToMessageId: null,
		turnId,
	})
	await store.appendText(id, text)
	await store.finalizeMessage(id, "complete")
	await store.completeTurn(turnId, Date.now())
}

const HOST_UPDATES_PER_TURN = 2

const emitHostUpdatesOfTurn = async (store: TranscriptStore) => {
	for (let update = 0; update < HOST_UPDATES_PER_TURN; update += 1) {
		await emitOnHost("conversation://updated", await soloThreadRowOf(store))
	}
}

type CacheEventCounter = { count: () => number; stop: () => void }

const countCacheEvents = (queryClient: QueryClient): CacheEventCounter => {
	let count = 0
	const stop = queryClient.getQueryCache().subscribe(() => {
		count += 1
	})
	return { count: () => count, stop }
}

const measureMessageReceived = async () => {
	const tally = tallyRenders()
	const { store, queryClient } = await mountApp()
	await storeMessageReceived(store)
	const received = await soloThreadRowOf(store)
	tally.reset()
	const cacheEvents = countCacheEvents(queryClient)

	await emitOnHost("conversation://updated", received)
	await settle(MOUNT_MS)
	cacheEvents.stop()

	return {
		app: tally.countOf("App"),
		appSidebar: tally.countOf("AppSidebar"),
		cacheEvents: cacheEvents.count(),
		isShown: document.body.textContent?.includes(RECEIVED_TEXT) ?? false,
	}
}

const EARLIER_TEXT = "An earlier message"

const measureRowsOfMessageReceived = async () => {
	const tally = tallyRenders()
	const { store } = await mountApp()
	await storeMessageReceived(store, EARLIER_TEXT)
	await emitOnHost("conversation://updated", await soloThreadRowOf(store))
	await settle(MOUNT_MS)
	await storeMessageReceived(store)
	const received = await soloThreadRowOf(store)
	const receiverId = received.conversation.soloBotId ?? ""
	tally.reset()

	await emitOnHost("conversation://updated", received)
	await settle(MOUNT_MS)

	const rows = tally.entriesOf("RosterRow")
	const [space] = await store.spaces()
	const receiver = (await store.bots(space.id)).find(
		({ id }) => id === receiverId,
	)
	return {
		app: tally.countOf("App"),
		receiverRow: rows.find(([id]) => id === receiverId)?.[1] ?? 0,
		otherRows: rows.filter(([id]) => id !== receiverId).length,
		isShownInRow:
			receiver !== undefined &&
			(rowFor(receiver.name).textContent?.includes(RECEIVED_TEXT) ?? false),
	}
}

const createRoom = async (store: TranscriptStore, title: string) => {
	const [space] = await store.spaces()
	const [bot] = await store.bots(space.id)
	return store.createConversation({
		spaceId: space.id,
		sectionId: null,
		title,
		botIds: [bot.id],
	})
}

const speakIn = async (store: TranscriptStore, conversationId: string) => {
	const turnId = `${conversationId}-spoken`
	await store.startTurn({ conversationId, id: turnId, startedAt: Date.now() })
	await store.appendUserMessage({
		authorBotId: null,
		content: RECEIVED_TEXT,
		conversationId,
		createdAt: Date.now(),
		id: `${conversationId}-spoken-message`,
		repliedToMessageId: null,
		turnId,
	})
	await store.completeTurn(turnId, Date.now())
}

const pageRowOf = async (store: TranscriptStore, conversationId: string) => {
	const [space] = await store.spaces()
	const { pinned, conversations } = await store.conversationPage(
		space.id,
		null,
		ROSTER_PAGE_SIZE,
	)
	const conversation = [...pinned, ...conversations].find(
		({ id }) => id === conversationId,
	)
	return { spaceId: space.id, conversation }
}

const shownRowNames = () =>
	[...document.querySelectorAll('[data-slot="roster-row-name"]')].map(
		({ textContent }) => textContent,
	)

const measureRowMovedToTop = async () => {
	const tally = tallyRenders()
	layout = fakeLayout()
	seedFirstRunDone()
	const store = createFakeTranscriptStore()
	harness.store = store
	harness.driver = createFakeChatDriver({ stepMs: STEP_MS })
	await seedRoster(store)
	const older = await createRoom(store, "Older room")
	await createRoom(store, "Newer room")
	render(createElement(App), { wrapper: createQueryTestWrapper().wrapper })
	await settle(MOUNT_MS)
	const [topBefore] = shownRowNames()
	await speakIn(store, older.id)
	const moved = await pageRowOf(store, older.id)
	tally.reset()

	await emitOnHost("conversation://updated", moved)
	await settle(MOUNT_MS)

	const [topAfter] = shownRowNames()
	return {
		app: tally.countOf("App"),
		appSidebar: tally.countOf("AppSidebar"),
		topBefore,
		topAfter,
	}
}

type FrameRunner = {
	next: () => Promise<void>
	flush: (count: number) => Promise<void>
}

const takeFrameRunner = (): FrameRunner => {
	const frames = takeFrameClock()
	let at = 0
	const next = () =>
		act(async () => {
			at += FRAME_MS
			frames.advance(at)
			await new Promise((resolve) => {
				setTimeout(resolve, 0)
			})
		})
	return {
		next,
		flush: async (count) => {
			for (let step = 0; step < count; step += 1) {
				await next()
			}
		},
	}
}

type SeededThread = {
	messages: number
	pageSize?: number
}

const seedThreadApp = async ({ messages, pageSize }: SeededThread) => {
	layout = fakeLayout()
	seedFirstRunDone()
	const store = createFakeTranscriptStore({ pageSize })
	const [space] = await store.spaces()
	const bot = await store.createBot(
		newBotIdentity(await store.bots(space.id)),
		space.id,
	)
	await seedTranscript(store, bot.id, messages)
	harness.store = store
	harness.driver = createFakeChatDriver({ stepMs: STEP_MS })
	return { bot, store }
}

const seedOtherBot = async (store: TranscriptStore) => {
	const [space] = await store.spaces()
	return store.createBot(newBotIdentity(await store.bots(space.id)), space.id)
}

const renderProfiledApp = () => {
	const commits = countCommits()
	render(
		createElement(
			Profiler,
			{ id: "app", onRender: commits.onRender },
			createElement(App),
		),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
	return commits
}

type ThreadOpening = {
	name: string
	lastMessage: string
	frames: FrameRunner
	commits: CommitCounter
}

const openThread = async ({
	name,
	lastMessage,
	frames,
	commits,
}: ThreadOpening) => {
	const openedAt = commits.count
	builds.markdownRenders = 0
	await act(async () => {
		fireEvent.click(rowFor(name))
	})
	let tasksToLastMessage = 0
	while (
		tasksToLastMessage < OPEN_FRAME_LIMIT &&
		!document.body.textContent?.includes(lastMessage)
	) {
		await frames.next()
		tasksToLastMessage += 1
	}
	if (tasksToLastMessage >= OPEN_FRAME_LIMIT) {
		throw new Error(`no last message for the thread of ${name}`)
	}

	return {
		commits: commits.count - openedAt,
		markdownProcessors: builds.markdownRenders,
		tasksToLastMessage,
	}
}

const measureThreadOpen = async () => {
	const frames = takeFrameRunner()
	const messages = LONG_THREAD_RUNS * 2
	const { bot } = await seedThreadApp({ messages })
	const commits = renderProfiledApp()
	await frames.flush(MOUNT_TASKS)

	const opened = await openThread({
		name: bot.name,
		lastMessage: `Answer ${messages - 1} in prose`,
		frames,
		commits,
	})

	return { ...opened, runs: LONG_THREAD_RUNS }
}

const loadOlderPages = async (frames: FrameRunner) => {
	for (let page = 0; page < OLDER_PAGES; page += 1) {
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: OLDER_LABEL }))
		})
		await frames.flush(SETTLE_TASKS)
	}
}

const bubbleCount = () =>
	document.querySelectorAll('[data-slot="message-bubble"]').length

const measureThreadReopen = async () => {
	const frames = takeFrameRunner()
	const messages = LONG_THREAD_RUNS * 2
	const { bot, store } = await seedThreadApp({ messages })
	const other = await seedOtherBot(store)
	const commits = renderProfiledApp()
	await frames.flush(MOUNT_TASKS)

	const opening = {
		name: bot.name,
		lastMessage: `Answer ${messages - 1} in prose`,
		frames,
		commits,
	}
	const cold = await openThread(opening)
	await loadOlderPages(frames)
	const grown = bubbleCount()

	await act(async () => {
		fireEvent.click(rowFor(other.name))
	})
	await frames.flush(SETTLE_TASKS)
	const reopened = await openThread(opening)

	return { cold, grown, reopened, rows: bubbleCount() }
}

const measureLongTranscriptOpen = async () => {
	const { bot } = await seedThreadApp({
		messages: LONG_TRANSCRIPT_MESSAGES,
		pageSize: LONG_TRANSCRIPT_MESSAGES,
	})
	const commits = renderProfiledApp()
	await settle(MOUNT_MS)

	const openedAt = commits.count
	builds.markdownRenders = 0
	let hasPaintedRow = false
	setRenderProbe((name) => {
		hasPaintedRow ||= name === "ThreadTurn"
	})
	await act(async () => {
		fireEvent.click(rowFor(bot.name))
	})
	for (let step = 0; step < OPEN_STEP_LIMIT && !hasPaintedRow; step += 1) {
		await settle(STEP_MS)
	}
	await settle(MOUNT_MS)

	return {
		commits: commits.count - openedAt,
		markdownProcessors: builds.markdownRenders,
		messages: LONG_TRANSCRIPT_MESSAGES,
	}
}

const measureTurn = async (chunks: number) => {
	const tally = tallyRenders()
	const { watch, store, queryClient } = await mountApp(() => replyOf(chunks))

	await streamOneTurn("first turn", watch, store)
	await emitHostUpdatesOfTurn(store)
	const settledTurns = tally.entriesOf("ThreadTurn").map(([key]) => key)
	tally.reset()
	const cacheEvents = countCacheEvents(queryClient)

	await streamOneTurn("second turn", watch, store)
	await emitHostUpdatesOfTurn(store)
	await settle(MOUNT_MS)
	cacheEvents.stop()
	const turns = tally.entriesOf("ThreadTurn")
	const countsWhere = (isSettled: boolean) =>
		turns
			.filter(([key]) => settledTurns.includes(key) === isSettled)
			.map(([, count]) => count)

	return {
		chunks: watch.chunks,
		cacheEvents: cacheEvents.count(),
		app: tally.countOf("App"),
		appSidebar: tally.countOf("AppSidebar"),
		rosterBots: tally.countOf("rosterBots"),
		rosterBotsBySpace: tally.countOf("rosterBotsBySpace"),
		streamingTurn: maxOf(countsWhere(false)),
		quietTurn: maxOf(countsWhere(true)),
	}
}

let layout: FakeLayout | null = null

describe("PRF1 render baseline", () => {
	afterEach(() => {
		setRenderProbe(null)
		layout?.restore()
		layout = null
		cleanup()
		localStorage.clear()
		vi.useRealTimers()
	})

	it("counts what one streamed turn re-renders", async () => {
		vi.useFakeTimers()

		expect(await measureTurn(SHORT_TURN_CHUNKS)).toMatchInlineSnapshot(`
			{
			  "app": 17,
			  "appSidebar": 6,
			  "cacheEvents": 26,
			  "chunks": 11,
			  "quietTurn": 2,
			  "rosterBots": 7,
			  "rosterBotsBySpace": 7,
			  "streamingTurn": 2,
			}
		`)
	})

	it("counts what a turn twice as long re-renders", async () => {
		vi.useFakeTimers()

		expect(await measureTurn(LONG_TURN_CHUNKS)).toMatchInlineSnapshot(`
			{
			  "app": 28,
			  "appSidebar": 6,
			  "cacheEvents": 37,
			  "chunks": 22,
			  "quietTurn": 2,
			  "rosterBots": 7,
			  "rosterBotsBySpace": 7,
			  "streamingTurn": 2,
			}
		`)
	})

	it("counts what one message received re-renders", async () => {
		vi.useFakeTimers()

		expect(await measureMessageReceived()).toMatchInlineSnapshot(`
			{
			  "app": 0,
			  "appSidebar": 1,
			  "cacheEvents": 3,
			  "isShown": true,
			}
		`)
	})

	it("renders the row of a received message alone, never App", async () => {
		vi.useFakeTimers()

		expect(await measureRowsOfMessageReceived()).toEqual({
			app: 0,
			receiverRow: 1,
			otherRows: 0,
			isShownInRow: true,
		})
	})

	it("re-renders the roster, never App, when a row moves to the top", async () => {
		vi.useFakeTimers()

		expect(await measureRowMovedToTop()).toEqual({
			app: 0,
			appSidebar: 1,
			topBefore: "Newer room",
			topAfter: "Older room",
		})
	})

	it("counts what the avatars write over sixty frames", async () => {
		vi.useFakeTimers()
		const { frames, store } = await mountApp()

		const idle = tallyFrames(frames)
		await submitPrompt("keep the roster busy")
		await emitHostWorking(store)
		await settle(STEP_MS * STEPS_INTO_TURN)
		const working = tallyFrames(frames)

		expect({
			avatars: document.querySelectorAll('[data-slot="companion-field"]')
				.length,
			idle,
			working,
		}).toMatchInlineSnapshot(`
			{
			  "avatars": 7,
			  "idle": {
			    "draws": 0,
			    "movingAvatars": 0,
			    "paints": 0,
			    "repeatedPaints": 0,
			  },
			  "working": {
			    "draws": 125676,
			    "movingAvatars": 3,
			    "paints": 180,
			    "repeatedPaints": 0,
			  },
			}
		`)
	})

	it("shows the last message of a two hundred run thread", async () => {
		expect(await measureThreadOpen()).toMatchInlineSnapshot(`
			{
			  "commits": 11,
			  "markdownProcessors": 20,
			  "runs": 200,
			  "tasksToLastMessage": 0,
			}
		`)
	})

	it(
		"reopens a thread on one page, like a cold open",
		async () => {
			expect(await measureThreadReopen()).toMatchInlineSnapshot(`
				{
				  "cold": {
				    "commits": 11,
				    "markdownProcessors": 20,
				    "tasksToLastMessage": 0,
				  },
				  "grown": 80,
				  "reopened": {
				    "commits": 6,
				    "markdownProcessors": 20,
				    "tasksToLastMessage": 0,
				  },
				  "rows": 20,
				}
			`)
		},
		THREAD_REOPEN_TIMEOUT_MS,
	)

	it(
		"opens a five hundred message transcript",
		async () => {
			vi.useFakeTimers()

			expect(await measureLongTranscriptOpen()).toMatchInlineSnapshot(`
				{
				  "commits": 11,
				  "markdownProcessors": 500,
				  "messages": 500,
				}
			`)
		},
		LONG_TRANSCRIPT_TIMEOUT_MS,
	)
})
