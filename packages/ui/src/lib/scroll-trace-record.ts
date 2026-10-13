import {
	firstRowInView,
	readerTopOf,
	readLayout,
} from "@workspace/ui/lib/scroll-trace-layout"
import {
	type Change,
	type Layout,
	now,
	type Recorder,
	round,
	type ViewportTrace,
} from "@workspace/ui/lib/scroll-trace-model"

export const record = (active: Recorder, after: Layout, changes: Change[]) => {
	const t = now()
	for (const change of changes) {
		active.entries.push({
			...change,
			dScrollTop: round(change.dScrollTop),
			dScrollHeight: round(change.dScrollHeight),
			dReaderTop: round(change.dReaderTop),
			t: round(t),
			frame: active.frame,
			scrollTop: round(after.scrollTop),
			scrollHeight: after.scrollHeight,
			clientHeight: after.clientHeight,
			clientWidth: after.clientWidth,
			thumbRatio: round((after.scrollHeight / after.clientHeight) * 100) / 100,
		})
	}
}

const currentSession = (active: Recorder) => {
	const session = active.sessions.at(-1)
	return session && session.endedAt === undefined ? session : undefined
}

export const closeSession = ({ viewport, active, previous }: ViewportTrace) => {
	const session = currentSession(active)
	if (!session) return
	session.endedAt = now()
	session.endTop = previous?.readerTop ?? readerTopOf(viewport, session.element)
	session.entriesTo = active.entries.length
}

export const openSession = (trace: ViewportTrace, label: string) => {
	closeSession(trace)
	const element = firstRowInView(trace)
	const startTop = readerTopOf(trace.viewport, element)
	if (!element || startTop === null) return
	trace.active.sessions.push({
		label,
		element,
		messageId: (element as HTMLElement).dataset.messageId ?? "",
		startedAt: now(),
		startTop,
		entriesFrom: trace.active.entries.length,
	})
	trace.previous = readLayout(trace, element)
}

export const followReader = (trace: ViewportTrace, after: Layout): Layout => {
	const reader = currentSession(trace.active)?.element ?? firstRowInView(trace)
	return reader === after.reader
		? after
		: { ...after, reader, readerTop: readerTopOf(trace.viewport, reader) }
}
