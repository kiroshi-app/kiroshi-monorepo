import type { QueryClient } from "@tanstack/react-query"
import { domToPng } from "modern-screenshot"

import { pngContentOf } from "./screenshot-page"

import type { ScreenshotJob } from "../bindings"

const SETTLE_PAUSE_MS = 50

const SETTLE_LIMIT_MS = 8000

const IDLE_SAMPLES = 2

const CAPTURE_TIMEOUT_MS = 5000

const CHROME_SLOTS = new Set(["board-dock", "board-zoom-control"])

const paused = () =>
	new Promise((resolve) => {
		setTimeout(resolve, SETTLE_PAUSE_MS)
	})

const loaded = (image: HTMLImageElement) =>
	image.complete
		? Promise.resolve()
		: new Promise<void>((resolve) => {
				const shown = () => resolve()
				image.addEventListener("load", shown, { once: true })
				image.addEventListener("error", shown, { once: true })
			})

const readsSettled = async (queryClient: QueryClient) => {
	const deadline = Date.now() + SETTLE_LIMIT_MS
	let idleSamples = 0
	while (idleSamples < IDLE_SAMPLES) {
		if (Date.now() > deadline) {
			throw new Error("the library reads of the target did not settle")
		}
		await paused()
		idleSamples = queryClient.isFetching() === 0 ? idleSamples + 1 : 0
	}
	const failed = queryClient
		.getQueryCache()
		.findAll({ predicate: (query) => query.state.status === "error" })
	if (failed.length > 0) {
		const keys = failed.map((query) => JSON.stringify(query.queryKey))
		throw new Error(`a library read of the target failed: ${keys.join(", ")}`)
	}
}

export const settled = async (queryClient: QueryClient, shown: Element) => {
	await readsSettled(queryClient)
	await document.fonts.ready
	await Promise.all([...shown.querySelectorAll("img")].map(loaded))
}

const isChrome = (node: Node) =>
	node instanceof HTMLElement && CHROME_SLOTS.has(node.dataset.slot ?? "")

const describeLayout = (shown: Element, { requestId }: ScreenshotJob) => {
	const { width, height } = shown.getBoundingClientRect()
	console.info(
		`screenshot ${requestId} captures a ${width} x ${height} target in a ${innerWidth} x ${innerHeight} page, ${document.visibilityState}`,
	)
}

export const captured = async (shown: Element, job: ScreenshotJob) => {
	describeLayout(shown, job)
	return pngContentOf(
		await domToPng(shown, {
			scale: job.scale,
			timeout: CAPTURE_TIMEOUT_MS,
			backgroundColor: getComputedStyle(document.body).backgroundColor,
			filter: (node) => !isChrome(node),
		}),
	)
}
