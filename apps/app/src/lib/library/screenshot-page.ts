import type {
	ScreenshotJob,
	ScreenshotRendered,
	ScreenshotRequestError,
} from "../bindings"

type Typed<T> =
	| { status: "ok"; data: T }
	| { status: "error"; error: ScreenshotRequestError }

export type ScreenshotSteps = {
	requestId: string
	readJob: () => Promise<Typed<ScreenshotJob>>
	render: (job: ScreenshotJob) => Promise<Element>
	capture: (shown: Element, job: ScreenshotJob) => Promise<string>
	answer: (
		requestId: string,
		answer: ScreenshotRendered,
	) => Promise<Typed<null>>
}

const PNG_DATA_URL_PREFIX = "data:image/png;base64,"

const reasonOf = (error: unknown) =>
	error instanceof Error ? error.message : JSON.stringify(error)

const okOf = async <T>(read: Promise<Typed<T>>) => {
	const answered = await read
	if (answered.status === "error") {
		throw new Error(
			`the screenshot job was refused: ${reasonOf(answered.error)}`,
		)
	}
	return answered.data
}

export const pngContentOf = (dataUrl: string) => {
	if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
		throw new Error("the capture answered no PNG")
	}
	return dataUrl.slice(PNG_DATA_URL_PREFIX.length)
}

const shot = async ({ readJob, render, capture }: ScreenshotSteps) => {
	const job = await okOf(readJob())
	return capture(await render(job), job)
}

export const answerScreenshot = async (steps: ScreenshotSteps) => {
	const rendered = await shot(steps).then(
		(png): ScreenshotRendered => ({ kind: "rendered", png }),
		(error: unknown): ScreenshotRendered => ({
			kind: "failed",
			reason: reasonOf(error),
		}),
	)
	const answered = await steps.answer(steps.requestId, rendered)
	if (answered.status === "error") {
		console.error("the screenshot answer was refused", answered.error)
	}
}
