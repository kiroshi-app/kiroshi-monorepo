import { diff } from "@workspace/ui/lib/scroll-trace-attribution"
import {
	listenToInput,
	observeAutoscrollingToggles,
} from "@workspace/ui/lib/scroll-trace-input"
import { readerTopOf, readLayout } from "@workspace/ui/lib/scroll-trace-layout"
import {
	type AppScrollWriter,
	type AutoscrollingToggle,
	MOVE_EPSILON,
	type Natives,
	now,
	type Recorder,
	round,
	type ScrollOrigin,
	type ScrollTraceEntry,
	type Session,
	type ViewportTrace,
	type WriteContext,
} from "@workspace/ui/lib/scroll-trace-model"
import {
	followReader,
	openSession,
	record,
} from "@workspace/ui/lib/scroll-trace-record"

type OriginTally = {
	moves: number
	feltPx: number
	grossPx: number
	netPx: number
	scrollTopPx: number
	scrollHeightPx: number
}

type ScrollTraceSummary = {
	label: string
	messageId: string
	startedAt: number
	durationMs: number
	displacementPx: number | null
	frames: number
	autoscrollingToggles: number
	thumbRatioMin: number
	thumbRatioMax: number
	origins: Partial<Record<ScrollOrigin, OriginTally>>
}

type ScrollTrace = {
	mark: (label?: string) => ScrollTraceSummary | null
	sessions: () => ScrollTraceSummary[]
	entries: () => ScrollTraceEntry[]
	toggles: () => AutoscrollingToggle[]
	report: () => string
}

declare global {
	interface Window {
		kiroshiScrollTrace?: ScrollTrace
	}
}

const CONTENT_SLOT = "message-scroller-content"
const VIEWPORT_SLOT = "message-scroller-viewport"
const SMOOTH_SCROLL_MS = 1000

let recorder: Recorder | null = null
let activeContext: WriteContext | null = null

const runIn = <Result>(
	context: WriteContext | null,
	run: () => Result,
): Result => {
	if (!context) return run()
	const previous = activeContext
	activeContext = context
	try {
		return run()
	} finally {
		activeContext = previous
	}
}

export const traceScrollWrite = <Result>(
	origin: AppScrollWriter,
	write: () => Result,
): Result => (recorder ? runIn({ origin }, write) : write())

const isSlot = (target: Node, slot: string) =>
	target instanceof HTMLElement && target.dataset.slot === slot

const resizeViaOf = (target: Element) => {
	if (isSlot(target, CONTENT_SLOT)) return "content-resize-observer"
	if (isSlot(target, VIEWPORT_SLOT)) return "viewport-resize-observer"
}

const patchGlobals = (natives: Natives) => {
	const contexts = new WeakMap<object, WriteContext>()

	class TracedMutationObserver extends natives.MutationObserver {
		constructor(callback: MutationCallback) {
			super((records, observer) =>
				runIn(contexts.get(observer) ?? null, () =>
					callback(records, observer),
				),
			)
		}

		override observe(target: Node, options?: MutationObserverInit) {
			if (isSlot(target, CONTENT_SLOT)) {
				contexts.set(this, { origin: "content-mutation-observer" })
			}
			super.observe(target, options)
		}
	}

	class TracedResizeObserver extends natives.ResizeObserver {
		constructor(callback: ResizeObserverCallback) {
			super((entries, observer) =>
				runIn(contexts.get(observer) ?? null, () =>
					callback(entries, observer),
				),
			)
		}

		override observe(target: Element, options?: ResizeObserverOptions) {
			const via = resizeViaOf(target)
			if (via) contexts.set(this, { origin: "engine-handle-resize", via })
			super.observe(target, options)
		}
	}

	window.MutationObserver = TracedMutationObserver
	window.ResizeObserver = TracedResizeObserver
	window.requestAnimationFrame = (callback) => {
		const context = activeContext
		return natives.requestAnimationFrame.call(
			window,
			context ? (time) => runIn(context, () => callback(time)) : callback,
		)
	}

	return () => {
		window.MutationObserver = natives.MutationObserver
		window.ResizeObserver = natives.ResizeObserver
		window.requestAnimationFrame = natives.requestAnimationFrame
	}
}

const isSmoothScrollTo = (args: unknown[]) => {
	const [options] = args
	return (
		typeof options === "object" &&
		options !== null &&
		(options as ScrollToOptions).behavior === "smooth"
	)
}

type WriteHooksInput = {
	viewport: HTMLElement
	active: Recorder
}

const hookWrites = ({ viewport, active }: WriteHooksInput) => {
	const descriptor = Object.getOwnPropertyDescriptor(
		Element.prototype,
		"scrollTop",
	)
	const readTop = () => descriptor?.get?.call(viewport) as number
	const tracked = (write: () => void, isSmooth: boolean) => {
		const context = activeContext ?? { origin: "untagged-js-write" as const }
		const before = readTop()
		write()
		active.writes.push({ ...context, delta: readTop() - before })
		if (isSmooth) {
			active.smooth = { ...context, until: now() + SMOOTH_SCROLL_MS }
		}
	}

	Object.defineProperty(viewport, "scrollTop", {
		configurable: true,
		get: readTop,
		set: (value: number) =>
			tracked(() => descriptor?.set?.call(viewport, value), false),
	})
	Object.defineProperty(viewport, "scrollTo", {
		configurable: true,
		value: (...args: unknown[]) =>
			tracked(
				() => Reflect.apply(Element.prototype.scrollTo, viewport, args),
				isSmoothScrollTo(args),
			),
	})

	return {
		readTop,
		release: () => {
			Reflect.deleteProperty(viewport, "scrollTop")
			Reflect.deleteProperty(viewport, "scrollTo")
		},
	}
}

const rowGapOf = (content: Element) => {
	const style = getComputedStyle(content)
	const gap = Number.parseFloat(style.rowGap)
	return Number.isFinite(gap) ? gap : 0
}

const isInputActive = (active: Recorder) =>
	active.isPointerDown || now() < active.inputUntil

const emptyTally = (): OriginTally => ({
	moves: 0,
	feltPx: 0,
	grossPx: 0,
	netPx: 0,
	scrollTopPx: 0,
	scrollHeightPx: 0,
})

const feltShares = (frameEntries: ScrollTraceEntry[]) => {
	const moved = frameEntries.reduce((sum, entry) => sum + entry.dReaderTop, 0)
	const direction = Math.sign(moved)
	const pushing = frameEntries.map((entry) =>
		Math.max(0, entry.dReaderTop * direction),
	)
	const pushed = pushing.reduce((sum, share) => sum + share, 0)
	return pushing.map((share) =>
		pushed === 0 ? 0 : (Math.abs(moved) * share) / pushed,
	)
}

const tallyOrigins = (slice: ScrollTraceEntry[]) => {
	const origins: Partial<Record<ScrollOrigin, OriginTally>> = {}
	const byFrame = Map.groupBy(slice, (entry) => entry.frame)

	for (const frameEntries of byFrame.values()) {
		const felt = feltShares(frameEntries)
		frameEntries.forEach((entry, index) => {
			const tally = origins[entry.origin] ?? emptyTally()
			origins[entry.origin] = {
				moves:
					tally.moves + (Math.abs(entry.dReaderTop) >= MOVE_EPSILON ? 1 : 0),
				feltPx: round(tally.feltPx + felt[index]),
				grossPx: round(tally.grossPx + Math.abs(entry.dReaderTop)),
				netPx: round(tally.netPx + entry.dReaderTop),
				scrollTopPx: round(tally.scrollTopPx + Math.abs(entry.dScrollTop)),
				scrollHeightPx: round(
					tally.scrollHeightPx + Math.abs(entry.dScrollHeight),
				),
			}
		})
	}
	return origins
}

const TALLY_COLUMNS: (keyof OriginTally)[] = [
	"moves",
	"feltPx",
	"grossPx",
	"netPx",
	"scrollTopPx",
	"scrollHeightPx",
]

const summaryTable = (summary: ScrollTraceSummary) => {
	const rows = Object.entries(summary.origins)
		.sort(([, left], [, right]) => (right?.feltPx ?? 0) - (left?.feltPx ?? 0))
		.map(
			([origin, tally]) =>
				`| ${origin} | ${TALLY_COLUMNS.map((column) => tally?.[column]).join(" | ")} |`,
		)
	return [
		`### ${summary.label} (reader on ${summary.messageId})`,
		`displacement ${summary.displacementPx ?? "row lost"} px over ${Math.round(summary.durationMs)} ms, ${summary.frames} frames with a change, ${summary.autoscrollingToggles} data-autoscrolling toggles, thumb ratio ${summary.thumbRatioMin} to ${summary.thumbRatioMax}`,
		"",
		`| origin | ${TALLY_COLUMNS.join(" | ")} |`,
		`|---|${TALLY_COLUMNS.map(() => "---").join("|")}|`,
		...rows,
	].join("\n")
}

type ViewportTraceInput = {
	viewport: HTMLElement
	active: Recorder
}

const traceViewport = ({ viewport, active }: ViewportTraceInput) => {
	const content = viewport.querySelector(`[data-slot="${CONTENT_SLOT}"]`)
	const { readTop, release } = hookWrites({ viewport, active })
	const trace: ViewportTrace = {
		viewport,
		content,
		active,
		gap: content ? rowGapOf(content) : 0,
		readTop,
		previous: null,
	}
	let frameRequest = 0

	const sample = () => {
		active.frame += 1
		const after = readLayout(trace, trace.previous?.reader)
		if (trace.previous)
			record(active, after, diff(trace, trace.previous, after))
		trace.previous = followReader(trace, after)
		if (!isInputActive(active)) active.pendingWheel = 0
		if (active.isAwaitingStop && !isInputActive(active)) {
			active.isAwaitingStop = false
			openSession(trace, `stop-${active.sessions.length + 1}`)
		}
		frameRequest = active.natives.requestAnimationFrame.call(window, sample)
	}

	const stopObservingToggles = observeAutoscrollingToggles(trace)
	const stopListening = listenToInput(trace)
	frameRequest = active.natives.requestAnimationFrame.call(window, sample)

	return {
		mark: (label: string) => openSession(trace, label),
		readerTopOf: (element: Element | undefined) =>
			readerTopOf(viewport, element),
		detach: () => {
			active.natives.cancelAnimationFrame.call(window, frameRequest)
			stopObservingToggles()
			stopListening()
			release()
		},
	}
}

let attached: ReturnType<typeof traceViewport> | null = null

const attachViewport = (viewport: HTMLElement | null) => {
	if (!recorder) return
	attached?.detach()
	attached = viewport ? traceViewport({ viewport, active: recorder }) : null
}

export const scrollTraceViewportRef = () =>
	recorder ? attachViewport : undefined

const summarize = (active: Recorder, session: Session): ScrollTraceSummary => {
	const slice = active.entries.slice(session.entriesFrom, session.entriesTo)
	const endedAt = session.endedAt ?? now()
	const endTop =
		session.endedAt === undefined
			? (attached?.readerTopOf(session.element) ?? null)
			: (session.endTop ?? null)
	const ratios = slice.map((entry) => entry.thumbRatio)
	return {
		label: session.label,
		messageId: session.messageId,
		startedAt: round(session.startedAt),
		durationMs: round(endedAt - session.startedAt),
		displacementPx: endTop === null ? null : round(endTop - session.startTop),
		frames: new Set(slice.map((entry) => entry.frame)).size,
		autoscrollingToggles: active.toggles.filter(
			(toggle) => toggle.t >= session.startedAt && toggle.t <= endedAt,
		).length,
		thumbRatioMin: ratios.length > 0 ? Math.min(...ratios) : 0,
		thumbRatioMax: ratios.length > 0 ? Math.max(...ratios) : 0,
		origins: tallyOrigins(slice),
	}
}

const traceApi = (active: Recorder): ScrollTrace => {
	const sessions = () =>
		active.sessions.map((session) => summarize(active, session))
	return {
		mark: (label = `mark-${active.sessions.length + 1}`) => {
			attached?.mark(label)
			const session = active.sessions.at(-1)
			return session ? summarize(active, session) : null
		},
		sessions,
		entries: () => active.entries,
		toggles: () => active.toggles,
		report: () =>
			[`${navigator.userAgent}`, ...sessions().map(summaryTable)].join("\n\n"),
	}
}

export const installScrollTrace = () => {
	if (recorder) return () => {}
	const natives: Natives = {
		MutationObserver: window.MutationObserver,
		ResizeObserver: window.ResizeObserver,
		requestAnimationFrame: window.requestAnimationFrame,
		cancelAnimationFrame: window.cancelAnimationFrame,
	}
	const restoreGlobals = patchGlobals(natives)
	const active: Recorder = {
		natives,
		frame: 0,
		entries: [],
		toggles: [],
		sessions: [],
		writes: [],
		smooth: null,
		inputUntil: 0,
		pendingWheel: 0,
		isPointerDown: false,
		isAwaitingStop: false,
		cvEventFrames: new WeakMap(),
	}
	recorder = active
	window.kiroshiScrollTrace = traceApi(active)

	return () => {
		attached?.detach()
		attached = null
		restoreGlobals()
		recorder = null
		window.kiroshiScrollTrace = undefined
	}
}
