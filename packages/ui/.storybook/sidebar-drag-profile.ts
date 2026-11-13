import { type ChildProcess, spawn } from "node:child_process"
import { createServer } from "node:net"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import { type Browser, type CDPSession, chromium, type Page } from "playwright"

const STORY_ID = "layout-workspaceshell--long-content"
const HANDLE = '[data-slot="sidebar-resize-handle"]'
const SIDEBAR = '[data-slot="navigation-sidebar"]'
const STRIP = '[data-slot="title-bar-tabs"]'
const TURN = '[data-slot="message-bubble-content"]'
const VIEWPORT = { width: 1440, height: 900 }
const DRAG_MS = 2000
const SWEEP_MS = 1000
const SWEEP_AMPLITUDE = 64
const POINTER_INTERVAL_MS = 8
const RELEASE_SETTLE_MS = 500
const STORY_SETTLE_MS = 2000
const SERVER_TIMEOUT_MS = 180_000
const SERVER_POLL_MS = 500
const TOP_LINES = 8
const MICROSECONDS_PER_MS = 1000
const UI_PACKAGE = fileURLToPath(new URL("..", import.meta.url))

type DragReading = {
	frames: number[]
	longTasks: number
	edgeMoves: number
	stripResizes: number
	pointerMoves: number
}

type TraceEvent = {
	name: string
	ph: string
	ts: number
	dur?: number
	pid: number
	tid: number
	args?: { name?: string }
}

type OpenSpan = { name: string; end: number }

type CpuProfile = {
	nodes: {
		id: number
		callFrame: { functionName: string; url: string; lineNumber: number }
	}[]
	samples?: number[]
	timeDeltas?: number[]
}

type Detection = { durationMs: number; sidebar: string; strip: string }

type StoryServer = { url: string; stop: () => void }

const freePort = () =>
	new Promise<number>((resolve, reject) => {
		const probe = createServer()
		probe.once("error", reject)
		probe.listen(0, () => {
			const address = probe.address()
			probe.close(() =>
				typeof address === "object" && address
					? resolve(address.port)
					: reject(new Error("No free port to serve Storybook on")),
			)
		})
	})

const isServing = (url: string) =>
	fetch(`${url}/iframe.html`).then(
		(response) => response.ok,
		() => false,
	)

const stopGroup = (server: ChildProcess) => {
	if (server.pid) process.kill(-server.pid)
}

const serveStorybook = async (): Promise<StoryServer> => {
	const port = await freePort()
	const url = `http://localhost:${port}`
	const server = spawn(
		"bun",
		["x", "storybook", "dev", "--port", String(port), "--no-open", "--ci"],
		{ cwd: UI_PACKAGE, detached: true, stdio: "ignore" },
	)
	const deadline = Date.now() + SERVER_TIMEOUT_MS
	while (!(await isServing(url))) {
		if (Date.now() > deadline) {
			stopGroup(server)
			throw new Error(`Storybook did not answer on ${url}`)
		}
		await sleep(SERVER_POLL_MS)
	}
	return { url, stop: () => stopGroup(server) }
}

const storyServer = async (): Promise<StoryServer> => {
	const url = process.env.STORYBOOK_URL
	return url ? { url, stop: () => undefined } : serveStorybook()
}

const detect = (page: Page) =>
	page.evaluate(
		({ durationMs, sidebar, strip }: Detection) =>
			new Promise<DragReading>((resolve, reject) => {
				const panel = document.querySelector(sidebar)
				const tabStrip = document.querySelector(strip)
				if (!panel || !tabStrip) {
					reject(new Error("No sidebar beside a title-bar tab strip on screen"))
					return
				}
				const reading: DragReading = {
					frames: [],
					longTasks: 0,
					edgeMoves: -1,
					stripResizes: -1,
					pointerMoves: 0,
				}
				let isDetecting = true
				let previous = performance.now()
				const onFrame = (now: number) => {
					reading.frames.push(now - previous)
					previous = now
					if (isDetecting) requestAnimationFrame(onFrame)
				}
				const longTasks = new PerformanceObserver((list) => {
					reading.longTasks += list.getEntries().length
				})
				const panelSize = new ResizeObserver(() => {
					reading.edgeMoves += 1
				})
				const stripSize = new ResizeObserver(() => {
					reading.stripResizes += 1
				})
				const countMove = () => {
					reading.pointerMoves += 1
				}
				longTasks.observe({ type: "longtask" })
				panelSize.observe(panel)
				stripSize.observe(tabStrip)
				window.addEventListener("pointermove", countMove)
				requestAnimationFrame(onFrame)
				window.setTimeout(() => {
					isDetecting = false
					longTasks.disconnect()
					panelSize.disconnect()
					stripSize.disconnect()
					window.removeEventListener("pointermove", countMove)
					resolve({ ...reading, frames: reading.frames.slice(1) })
				}, durationMs)
			}),
		{
			durationMs: DRAG_MS + RELEASE_SETTLE_MS,
			sidebar: SIDEBAR,
			strip: STRIP,
		},
	)

const drag = async (page: Page) => {
	const grip = await page.locator(HANDLE).boundingBox()
	if (!grip) throw new Error("No sidebar resize handle on screen")
	const origin = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
	await page.mouse.move(origin.x, origin.y)
	await page.mouse.down()
	const startedAt = performance.now()
	for (
		let elapsed = 0;
		elapsed < DRAG_MS;
		elapsed = performance.now() - startedAt
	) {
		const sweep = Math.sin((2 * Math.PI * elapsed) / SWEEP_MS)
		await page.mouse.move(origin.x + SWEEP_AMPLITUDE * sweep, origin.y)
		await sleep(POINTER_INTERVAL_MS)
	}
	await page.mouse.up()
}

const percentile = (sorted: number[], share: number) =>
	sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]

const rounded = (value: number) => Math.round(value * 10) / 10

const frameSummary = (frames: number[]) => {
	const sorted = [...frames].sort((a, b) => a - b)
	return {
		count: sorted.length,
		medianMs: rounded(percentile(sorted, 0.5)),
		p95Ms: rounded(percentile(sorted, 0.95)),
		maxMs: rounded(sorted[sorted.length - 1]),
	}
}

const topLines = (selfTimes: Map<string, number>) =>
	[...selfTimes]
		.sort(([, a], [, b]) => b - a)
		.slice(0, TOP_LINES)
		.map(([name, selfMs]) => `${rounded(selfMs)} ms  ${name}`)

const rendererMainThread = (events: TraceEvent[]) => {
	const mainThreads = new Set(
		events
			.filter(
				(event) =>
					event.name === "thread_name" && event.args?.name === "CrRendererMain",
			)
			.map((event) => `${event.pid}:${event.tid}`),
	)
	const spanCounts = new Map<string, number>()
	for (const event of events) {
		const thread = `${event.pid}:${event.tid}`
		if (event.ph !== "X" || !mainThreads.has(thread)) continue
		spanCounts.set(thread, (spanCounts.get(thread) ?? 0) + 1)
	}
	const [busiest] = [...spanCounts].sort(([, a], [, b]) => b - a)
	return busiest?.[0]
}

const traceSelfTimes = (events: TraceEvent[]) => {
	const mainThread = rendererMainThread(events)
	const spans = events
		.filter(
			(event) => event.ph === "X" && `${event.pid}:${event.tid}` === mainThread,
		)
		.sort((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0))
	const selfTimes = new Map<string, number>()
	const open: OpenSpan[] = []
	const add = (name: string, microseconds: number) =>
		selfTimes.set(
			name,
			(selfTimes.get(name) ?? 0) + microseconds / MICROSECONDS_PER_MS,
		)
	for (const span of spans) {
		const duration = span.dur ?? 0
		while (open.length > 0 && open[open.length - 1].end <= span.ts) open.pop()
		const parent = open[open.length - 1]
		if (parent) add(parent.name, -duration)
		add(span.name, duration)
		open.push({ name: span.name, end: span.ts + duration })
	}
	return selfTimes
}

const cpuSelfTimes = ({ nodes, samples = [], timeDeltas = [] }: CpuProfile) => {
	const labels = new Map(
		nodes.map(({ id, callFrame }) => [
			id,
			`${callFrame.functionName || "(anonymous)"} ${callFrame.url.replace(/^.*\/(src|node_modules)\//, "$1/").replace(/\?.*$/, "")}:${callFrame.lineNumber + 1}`,
		]),
	)
	const selfTimes = new Map<string, number>()
	samples.forEach((nodeId, index) => {
		const label = labels.get(nodeId) ?? "(unknown)"
		selfTimes.set(
			label,
			(selfTimes.get(label) ?? 0) +
				(timeDeltas[index] ?? 0) / MICROSECONDS_PER_MS,
		)
	})
	for (const label of selfTimes.keys()) {
		if (/^\((idle|program|garbage collector)\)/.test(label))
			selfTimes.delete(label)
	}
	return selfTimes
}

const profiledDrag = async (browser: Browser, page: Page, cdp: CDPSession) => {
	await cdp.send("Profiler.enable")
	await browser.startTracing(page, {
		categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"],
	})
	await cdp.send("Profiler.start")
	const detection = detect(page)
	await drag(page)
	const reading = await detection
	const { profile } = await cdp.send("Profiler.stop")
	const trace = JSON.parse((await browser.stopTracing()).toString()) as {
		traceEvents: TraceEvent[]
	}
	return {
		reading,
		mainThreadSelfTime: topLines(traceSelfTimes(trace.traceEvents)),
		scriptSelfTime: topLines(cpuSelfTimes(profile)),
	}
}

const plainDrag = async (page: Page) => {
	const detection = detect(page)
	await drag(page)
	return { reading: await detection }
}

const measure = async (url: string, isProfiled: boolean, throttle: number) => {
	const browser = await chromium.launch()
	try {
		const page = await browser.newPage({ viewport: VIEWPORT })
		await page.goto(`${url}/iframe.html?id=${STORY_ID}&viewMode=story`, {
			timeout: SERVER_TIMEOUT_MS,
		})
		await page.locator(HANDLE).waitFor({ timeout: SERVER_TIMEOUT_MS })
		await page.waitForLoadState("networkidle")
		await sleep(STORY_SETTLE_MS)
		const cdp = await page.context().newCDPSession(page)
		await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
		const { reading, ...profile } = isProfiled
			? await profiledDrag(browser, page, cdp)
			: await plainDrag(page)
		return {
			scenario: `${DRAG_MS} ms drag of the left handle, ${STORY_ID}, ${await page.locator(TURN).count()} turns, ${VIEWPORT.width}x${VIEWPORT.height}`,
			detector: `requestAnimationFrame deltas and PerformanceObserver longtask, Chromium ${browser.version()}, CPU throttle ${throttle}x, profiler ${isProfiled ? "on" : "off"}`,
			frames: frameSummary(reading.frames),
			longTasks: reading.longTasks,
			pointerMoves: reading.pointerMoves,
			edgeMoves: reading.edgeMoves,
			stripResizes: reading.stripResizes,
			...profile,
		}
	} finally {
		await browser.close()
	}
}

const { values } = parseArgs({
	options: {
		profile: { type: "boolean", default: false },
		throttle: { type: "string", default: "1" },
	},
})

const server = await storyServer()
try {
	const report = await measure(
		server.url,
		values.profile,
		Number(values.throttle),
	)
	console.log(JSON.stringify(report, null, "\t"))
} finally {
	server.stop()
}
