// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { createDragGhostView } from "./drag-ghost-view"
import { drawGhost, type GhostSources } from "./ghost-thumbnail"

import type {
	DragGhostTab,
	TranscriptMessage,
	TranscriptPage,
} from "../bindings"
import { DragGhost } from "@/components/drag-ghost"

const TAB: DragGhostTab = {
	tabId: "torn",
	href: "/?conversation=release",
	title: "Release notes for 2.4",
}

const SIZE = { width: 600, height: 400 }

const messageOf = (
	id: string,
	role: TranscriptMessage["role"],
	content: string,
	completion: TranscriptMessage["completion"] = "complete",
): TranscriptMessage => ({
	id,
	conversationId: "release",
	turnId: id,
	seq: 0,
	role,
	content,
	completion,
	createdAt: 0,
	authorBotId: role === "assistant" ? "ada" : null,
	authorAccountId: null,
	authorName: null,
	repliedToMessageId: null,
	runtimeSessionId: null,
})

const PAGE: TranscriptPage = {
	conversationId: "release",
	hasMore: false,
	arrivals: [],
	messages: [
		messageOf("older", "user", "An older question"),
		messageOf("ask", "user", "Can you draft the release notes?"),
		messageOf("reply", "assistant", "Here's a first pass."),
		messageOf("typing", "assistant", "Still writ", "streaming"),
	],
}

const sourcesReading = (
	readTranscript: GhostSources["readTranscript"],
): GhostSources => ({
	bots: [],
	conversations: [
		{ id: "release", name: "Release notes", companionName: "Ada" },
	],
	missionTitles: {},
	soloThreads: {},
	spaceId: "space-home",
	readTranscript,
})

type TabHeard = (event: { payload: DragGhostTab }) => void

const mountGhost = async () => {
	let hear: TabHeard = () => undefined
	const listen = vi.fn((_event: string, handler: TabHeard) => {
		hear = handler
		return Promise.resolve(() => undefined)
	})
	const view = createDragGhostView(
		listen as unknown as Parameters<typeof createDragGhostView>[0],
	)
	await view.watch()
	render(createElement(DragGhost, { view }))
	return (tab: DragGhostTab) => act(() => hear({ payload: tab }))
}

const thumbnailWritten = () =>
	act(() => {
		window.dispatchEvent(
			new StorageEvent("storage", { key: "dragGhostThumbnail" }),
		)
	})

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.restoreAllMocks()
})

describe("the drag ghost", () => {
	it("draws nothing before it hears a tab", async () => {
		await mountGhost()

		expect(screen.queryByText(TAB.title)).toBeNull()
	})

	it("draws the torn-off tab with its title, its agent and its last two settled messages", async () => {
		const readTranscript = vi.fn().mockResolvedValue(PAGE)
		const hearTab = await mountGhost()

		drawGhost(TAB, SIZE, sourcesReading(readTranscript))
		await hearTab(TAB)

		expect(screen.getByText(TAB.title)).toBeTruthy()
		expect(screen.getByText("Ada")).toBeTruthy()
		expect(screen.getByText("Message Ada")).toBeTruthy()
		await vi.waitFor(() =>
			expect(readTranscript).toHaveBeenCalledExactlyOnceWith("release", null),
		)
		await thumbnailWritten()
		expect(screen.getByText("Can you draft the release notes?")).toBeTruthy()
		expect(screen.getByText("Here's a first pass.")).toBeTruthy()
		expect(screen.queryByText("An older question")).toBeNull()
		expect(screen.queryByText("Still writ")).toBeNull()
	})

	it("still draws the title and the agent when the last messages fail to load", async () => {
		const readTranscript = vi.fn().mockRejectedValue(new Error("store lost"))
		const hearTab = await mountGhost()

		drawGhost(TAB, SIZE, sourcesReading(readTranscript))
		await hearTab(TAB)
		await vi.waitFor(() => expect(console.error).toHaveBeenCalled())
		await thumbnailWritten()

		expect(screen.getByText(TAB.title)).toBeTruthy()
		expect(screen.getByText("Message Ada")).toBeTruthy()
		expect(screen.queryByText("Here's a first pass.")).toBeNull()
	})

	it("draws nothing for a tab whose thumbnail was not drawn", async () => {
		const hearTab = await mountGhost()

		drawGhost(TAB, SIZE, sourcesReading(vi.fn().mockResolvedValue(PAGE)))
		await hearTab({ ...TAB, tabId: "other", title: "Another tab" })

		expect(screen.queryByText("Another tab")).toBeNull()
	})
})
