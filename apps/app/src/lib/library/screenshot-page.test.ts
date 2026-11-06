import { describe, expect, it, vi } from "vitest"

import {
	answerScreenshot,
	pngContentOf,
	type ScreenshotSteps,
} from "./screenshot-page"

import type { ScreenshotJob } from "../bindings"

const JOB: ScreenshotJob = {
	requestId: "r1",
	spaceId: "personal",
	scale: 2,
	target: { kind: "document", name: "notes.md", blocks: [] },
}

const SHOWN = { tagName: "MAIN" } as unknown as Element

const stepsOf = (overrides: Partial<ScreenshotSteps>) => {
	const answer = vi.fn<ScreenshotSteps["answer"]>(async () => ({
		status: "ok" as const,
		data: null,
	}))
	const steps: ScreenshotSteps = {
		requestId: "r1",
		readJob: async () => ({ status: "ok", data: JOB }),
		render: async () => SHOWN,
		capture: async () => "cG5n",
		answer,
		...overrides,
	}
	return { steps, answer }
}

describe("answerScreenshot", () => {
	it("answers the PNG the capture drew of the rendered target at the job scale", async () => {
		const capture = vi.fn<ScreenshotSteps["capture"]>(async () => "cG5n")
		const { steps, answer } = stepsOf({ capture })

		await answerScreenshot(steps)

		expect(capture).toHaveBeenCalledWith(SHOWN, JOB)
		expect(answer).toHaveBeenCalledExactlyOnceWith("r1", {
			kind: "rendered",
			png: "cG5n",
		})
	})

	it("answers a refused job as failed with the refusal, rendering nothing", async () => {
		const render = vi.fn<ScreenshotSteps["render"]>()
		const { steps, answer } = stepsOf({
			readJob: async () => ({
				status: "error",
				error: { kind: "unknownRequest", requestId: "r1" },
			}),
			render,
		})

		await answerScreenshot(steps)

		expect(render).not.toHaveBeenCalled()
		expect(answer).toHaveBeenCalledExactlyOnceWith("r1", {
			kind: "failed",
			reason:
				'the screenshot job was refused: {"kind":"unknownRequest","requestId":"r1"}',
		})
	})

	it("answers a render that throws as failed with its message, capturing nothing", async () => {
		const capture = vi.fn<ScreenshotSteps["capture"]>()
		const { steps, answer } = stepsOf({
			render: async () => {
				throw new Error("the canvas is not a board")
			},
			capture,
		})

		await answerScreenshot(steps)

		expect(capture).not.toHaveBeenCalled()
		expect(answer).toHaveBeenCalledExactlyOnceWith("r1", {
			kind: "failed",
			reason: "the canvas is not a board",
		})
	})

	it("answers a capture that fails as failed with its message", async () => {
		const { steps, answer } = stepsOf({
			capture: async () => {
				throw new Error("the image did not decode")
			},
		})

		await answerScreenshot(steps)

		expect(answer).toHaveBeenCalledExactlyOnceWith("r1", {
			kind: "failed",
			reason: "the image did not decode",
		})
	})

	it("logs an answer the host refuses", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {})
		const refusal = { kind: "unknownRequest" as const, requestId: "r1" }
		const { steps } = stepsOf({
			answer: async () => ({ status: "error", error: refusal }),
		})

		await answerScreenshot(steps)

		expect(error).toHaveBeenCalledWith(
			"the screenshot answer was refused",
			refusal,
		)
		error.mockRestore()
	})
})

describe("pngContentOf", () => {
	it("keeps the base64 of a PNG data URL and refuses any other", () => {
		expect(pngContentOf("data:image/png;base64,cG5n")).toBe("cG5n")
		expect(() => pngContentOf("data:image/jpeg;base64,cG5n")).toThrow(
			"the capture answered no PNG",
		)
	})
})
