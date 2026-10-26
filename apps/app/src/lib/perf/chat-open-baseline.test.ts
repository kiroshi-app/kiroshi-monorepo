// @vitest-environment happy-dom

import { defaultStringifySearch } from "@tanstack/react-router"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement, Profiler, type ProfilerOnRenderCallback } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
	highlightCode,
	highlighterBuildCount,
	prepareHighlighter,
} from "@workspace/ui/lib/code-highlight"
import { setRenderProbe } from "@workspace/ui/lib/render-probe"

import "@workspace/ui/lib/i18n"

import { newBotIdentity } from "@/lib/bots/bot-settings"
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

const builds = vi.hoisted(() => ({ highlightCalls: 0, markdownRenders: 0 }))

vi.mock("@/lib/conversations/create-store", () => ({
	createTranscriptStore: () => harness.store,
}))

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

vi.mock("@workspace/ui/lib/code-highlight", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@workspace/ui/lib/code-highlight")>()
	return {
		...actual,
		highlightCode: (...args: Parameters<typeof actual.highlightCode>) => {
			builds.highlightCalls += 1
			return actual.highlightCode(...args)
		},
	}
})

const { App } = await import("@/App")

const STEP_MS = 1

const MOUNT_MS = 200

const OPEN_STEP_LIMIT = 400

const QUIET_STEPS = 20

const BOTS_IN_SPACE = 4

const SEEDED_MESSAGES = 2

const PAGE_MESSAGES = 20

const CALL_DELAY_MS = 5

const STEPS_INTO_STREAM = 4

const WRITE_CALLS = new Set([
	"appendText",
	"appendUserMessage",
	"completeTurn",
	"finalizeMessage",
	"openAssistantMessage",
	"startTurn",
])

const HIGHLIGHTED_CODE = "const answer = 42"

const CODE_BLOCK = `\`\`\`ts\n${HIGHLIGHTED_CODE}\n\`\`\``

const timeOf = (run: () => unknown) => {
	const startedAt = performance.now()
	run()
	return performance.now() - startedAt
}

type TraceEntry = { name: string; began: number }

type StoreTrace = { entries: TraceEntry[]; store: TranscriptStore }

const traceStore = (store: TranscriptStore, delayMs: number): StoreTrace => {
	const entries: TraceEntry[] = []
	const hold = () =>
		new Promise((resolve) => {
			setTimeout(resolve, delayMs)
		})
	const traced = new Proxy(store as Record<string, unknown>, {
		get: (target, key) => {
			const held = Reflect.get(target, key)
			if (typeof held !== "function") {
				return held
			}
			return async (...args: unknown[]) => {
				entries.push({ name: String(key), began: Date.now() })
				if (delayMs > 0) {
					await hold()
				}
				return (held as (...passed: unknown[]) => Promise<unknown>).apply(
					target,
					args,
				)
			}
		},
	})
	return { entries, store: traced as TranscriptStore }
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

const settle = async (ms: number) => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms)
	})
}

const seedBots = async (store: TranscriptStore) => {
	const [space] = await store.spaces()
	const held = await store.bots(space.id)
	for (let index = held.length; index < BOTS_IN_SPACE; index += 1) {
		await store.createBot(newBotIdentity(await store.bots(space.id)), space.id)
	}
	return store.bots(space.id)
}

const seedTranscript = async (
	store: TranscriptStore,
	botId: string,
	messages: number,
	withCode = false,
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
			const body = withCode
				? `Answer ${index} with code\n\n${CODE_BLOCK}`
				: `Answer ${index} in prose`
			await store.appendText(id, body)
			await store.finalizeMessage(id, "complete")
		}
		await store.completeTurn(turnId, index)
	}
}

type MountedApp = {
	bots: { id: string; name: string }[]
	commits: CommitCounter
	trace: StoreTrace
}

type MountOptions = { delayMs?: number; pageBotIndex?: number }

const seedFirstRunDone = () => {
	writeMirror({ ...readMirror(), firstRunDone: true })
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

const mountApp = async ({
	delayMs = 0,
	pageBotIndex,
}: MountOptions = {}): Promise<MountedApp> => {
	layout = fakeLayout()
	seedFirstRunDone()
	const store = createFakeTranscriptStore()
	const bots = await seedBots(store)
	for (const [index, bot] of bots.entries()) {
		const isPage = index === pageBotIndex
		await seedTranscript(
			store,
			bot.id,
			isPage ? PAGE_MESSAGES : SEEDED_MESSAGES,
			isPage,
		)
	}
	await openOnFirstCompanion(store)
	const trace = traceStore(store, delayMs)
	harness.store = trace.store
	harness.driver = createFakeChatDriver({ stepMs: STEP_MS })
	const commits = countCommits()
	render(
		createElement(
			Profiler,
			{ id: "app", onRender: commits.onRender },
			createElement(App),
		),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
	await settle(MOUNT_MS)
	prepareHighlighter()
	return {
		bots: bots.map(({ id, name }) => ({ id, name })),
		commits,
		trace,
	}
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

const chooseBot = async (name: string) => {
	await act(async () => {
		fireEvent.click(rowFor(name))
	})
}

type OpenReport = {
	storeCalls: string[]
	elapsedMs: number
	commits: number
	writesAhead: number
}

const openBot = async (
	app: MountedApp,
	bot: { id: string; name: string },
): Promise<OpenReport> => {
	const fromCall = app.trace.entries.length
	const fromCommit = app.commits.count
	const startedAt = Date.now()
	const painted = { at: -1, calls: -1, commits: -1 }
	setRenderProbe((name, key) => {
		if (painted.at >= 0 || name !== "ThreadTurn" || !key?.startsWith(bot.id)) {
			return
		}
		painted.at = Date.now()
		painted.calls = app.trace.entries.length
		painted.commits = app.commits.count
	})
	await chooseBot(bot.name)
	for (let step = 0; step < OPEN_STEP_LIMIT && painted.at < 0; step += 1) {
		await settle(STEP_MS)
	}
	setRenderProbe(null)
	if (painted.at < 0) {
		throw new Error(`no painted row for ${bot.name}`)
	}
	const awaited = app.trace.entries.slice(fromCall, painted.calls)
	const readAt = awaited.findIndex((entry) => entry.name === "loadPage")
	const ahead = readAt < 0 ? awaited : awaited.slice(0, readAt)
	return {
		storeCalls: awaited.map((entry) => entry.name),
		elapsedMs: painted.at - startedAt,
		commits: painted.commits - fromCommit,
		writesAhead: ahead.filter((entry) => WRITE_CALLS.has(entry.name)).length,
	}
}

const promptOneTurn = async (text: string) => {
	const input = screen.getByRole("textbox", { name: "Message" })
	fireEvent.change(input, { target: { value: text } })
	await act(async () => {
		fireEvent.keyDown(input, { key: "Enter" })
	})
	await settle(STEP_MS * STEPS_INTO_STREAM)
}

const quiesce = () => settle(MOUNT_MS)

const measureOpenings = async (delayMs: number) => {
	const app = await mountApp({ delayMs })
	const [, cold, streamer, contended] = app.bots
	const coldOpen = await openBot(app, cold)
	await quiesce()
	await openBot(app, streamer)
	await quiesce()
	const warmOpen = await openBot(app, cold)
	await quiesce()
	await openBot(app, streamer)
	await quiesce()
	await promptOneTurn("keep this companion writing")
	const busyOpen = await openBot(app, contended)
	return { busyOpen, coldOpen, warmOpen }
}

const measurePage = async () => {
	const pageBotIndex = 1
	const app = await mountApp({ pageBotIndex })
	const page = app.bots[pageBotIndex]
	builds.markdownRenders = 0
	builds.highlightCalls = 0
	const fromCommit = app.commits.count
	const fromBuild = highlighterBuildCount()
	const opened = await openBot(app, page)
	await settle(STEP_MS * QUIET_STEPS)
	return {
		commitsToFirstRow: opened.commits,
		commitsToSettled: app.commits.count - fromCommit,
		highlightCalls: builds.highlightCalls,
		highlighterBuilds: highlighterBuildCount() - fromBuild,
		markdownProcessors: builds.markdownRenders,
		paintedRows: document.querySelectorAll('[data-slot="chat-turn-group"]')
			.length,
	}
}

let layout: FakeLayout | null = null

describe("PRF5 chat open baseline", () => {
	afterEach(() => {
		setRenderProbe(null)
		layout?.restore()
		layout = null
		cleanup()
		localStorage.clear()
		vi.useRealTimers()
	})

	it("pays the highlighter build before any code block renders", () => {
		const offPaintPath = timeOf(prepareHighlighter)
		const onPaintPath = timeOf(() => highlightCode(HIGHLIGHTED_CODE, "ts"))

		expect(highlighterBuildCount()).toBe(1)
		expect(onPaintPath).toBeLessThan(offPaintPath / 100)
	})

	it("lists the store calls an opening waits on", async () => {
		vi.useFakeTimers()

		expect(await measureOpenings(0)).toMatchInlineSnapshot(`
			{
			  "busyOpen": {
			    "commits": 5,
			    "elapsedMs": 0,
			    "storeCalls": [
			      "mainChat",
			      "botCommands",
			      "loadPage",
			    ],
			    "writesAhead": 0,
			  },
			  "coldOpen": {
			    "commits": 5,
			    "elapsedMs": 0,
			    "storeCalls": [
			      "mainChat",
			      "botCommands",
			      "loadPage",
			    ],
			    "writesAhead": 0,
			  },
			  "warmOpen": {
			    "commits": 1,
			    "elapsedMs": 0,
			    "storeCalls": [],
			    "writesAhead": 0,
			  },
			}
		`)
	})

	it("times the same openings with one fixed delay per store call", async () => {
		vi.useFakeTimers()

		expect(await measureOpenings(CALL_DELAY_MS)).toMatchInlineSnapshot(`
			{
			  "busyOpen": {
			    "commits": 8,
			    "elapsedMs": 10,
			    "storeCalls": [
			      "mainChat",
			      "captureCheckpoint",
			      "botCommands",
			      "loadPage",
			      "boundedContext",
			    ],
			    "writesAhead": 0,
			  },
			  "coldOpen": {
			    "commits": 7,
			    "elapsedMs": 10,
			    "storeCalls": [
			      "mainChat",
			      "botCommands",
			      "loadPage",
			    ],
			    "writesAhead": 0,
			  },
			  "warmOpen": {
			    "commits": 1,
			    "elapsedMs": 0,
			    "storeCalls": [],
			    "writesAhead": 0,
			  },
			}
		`)
	})

	it("counts what a page of twenty stored messages costs", async () => {
		vi.useFakeTimers()

		expect(await measurePage()).toMatchInlineSnapshot(`
			{
			  "commitsToFirstRow": 5,
			  "commitsToSettled": 13,
			  "highlightCalls": 10,
			  "highlighterBuilds": 0,
			  "markdownProcessors": 32,
			  "paintedRows": 20,
			}
		`)
	})
})
