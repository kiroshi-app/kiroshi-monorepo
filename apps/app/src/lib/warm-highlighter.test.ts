import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { CODE_LANGUAGES } from "@workspace/ui/lib/code-highlight"

import { warmCodeHighlighter } from "./warm-highlighter"

const highlighter = vi.hoisted(() => ({ warmed: [] as string[] }))

vi.mock("@workspace/ui/lib/code-highlight", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/lib/code-highlight")
	>()),
	warmCodeLanguage: (language: string) => {
		highlighter.warmed.push(language)
	},
}))

let pendingFrames: FrameRequestCallback[] = []

const paintFrame = () => {
	const dueFrames = pendingFrames
	pendingFrames = []
	for (const frame of dueFrames) frame(performance.now())
	vi.runOnlyPendingTimers()
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout"] })
	vi.stubGlobal("requestIdleCallback", undefined)
	vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
		pendingFrames.push(frame)
		return pendingFrames.length
	})
})

afterEach(() => {
	highlighter.warmed = []
	pendingFrames = []
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

it("warms one code language between two animation frames, every language in order, when the webview has no requestIdleCallback", () => {
	warmCodeHighlighter()

	const warmedPerFrame = CODE_LANGUAGES.map(() => {
		const warmedBefore = highlighter.warmed.length
		paintFrame()
		return highlighter.warmed.length - warmedBefore
	})

	expect(warmedPerFrame).toEqual(CODE_LANGUAGES.map(() => 1))
	expect(highlighter.warmed).toEqual(CODE_LANGUAGES)
	paintFrame()
	expect(highlighter.warmed).toEqual(CODE_LANGUAGES)
})
