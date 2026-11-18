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

const pendingFrames = new Map<number, FrameRequestCallback>()
let requestedFrames = 0

const runDueFrames = () => {
	const dueFrames = [...pendingFrames.values()]
	pendingFrames.clear()
	for (const frame of dueFrames) frame(performance.now())
}

const paintFrame = () => {
	runDueFrames()
	vi.runOnlyPendingTimers()
}

const paintOneFramePerLanguage = () => {
	for (const _language of CODE_LANGUAGES) paintFrame()
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
	vi.stubGlobal("requestIdleCallback", undefined)
	vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
		requestedFrames += 1
		pendingFrames.set(requestedFrames, frame)
		return requestedFrames
	})
	vi.stubGlobal("cancelAnimationFrame", (frame: number) => {
		pendingFrames.delete(frame)
	})
})

afterEach(() => {
	highlighter.warmed = []
	pendingFrames.clear()
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

it("warms no further code language once stopped while waiting for a frame", () => {
	const stopWarming = warmCodeHighlighter()
	paintFrame()

	stopWarming()
	paintOneFramePerLanguage()

	expect(highlighter.warmed).toEqual(CODE_LANGUAGES.slice(0, 1))
})

it("warms no further code language once stopped between a frame and its warm-up", () => {
	const stopWarming = warmCodeHighlighter()
	runDueFrames()

	stopWarming()
	paintOneFramePerLanguage()

	expect(highlighter.warmed).toEqual([])
})
