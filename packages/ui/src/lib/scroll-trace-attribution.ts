import {
	type Change,
	type Layout,
	MOVE_EPSILON,
	now,
	type Recorder,
	type ScrollOrigin,
	type ViewportTrace,
} from "@workspace/ui/lib/scroll-trace-model"

const CHANGE_EPSILON = 0.01
const SCROLL_HEIGHT_ROUNDING = 1
const CV_EVENT_FRAMES = 2

const placeholderHeightOf = (item: Element) => {
	const style = getComputedStyle(item)
	if (style.contentVisibility !== "auto") return null
	const size = Number.parseFloat(
		style.containIntrinsicHeight.replace("auto", "").trim(),
	)
	return Number.isFinite(size) ? size : null
}

const gapOf = (item: Element, gap: number) =>
	item instanceof HTMLElement && item.hidden ? 0 : gap

type ChangeDelta = Partial<Omit<Change, "origin" | "via">>

type ChangeSet = {
	add: (
		origin: ScrollOrigin,
		via: string | undefined,
		delta: ChangeDelta,
	) => void
	sum: (field: keyof ChangeDelta) => number
	list: () => Change[]
}

const isMeaningful = (change: Change) =>
	change.via === "client-size" ||
	Math.abs(change.dScrollTop) > CHANGE_EPSILON ||
	Math.abs(change.dScrollHeight) > CHANGE_EPSILON ||
	Math.abs(change.dReaderTop) > CHANGE_EPSILON

const changeSet = (): ChangeSet => {
	const changes = new Map<string, Change>()
	return {
		add: (origin, via, delta) => {
			const key = `${origin}|${via ?? ""}`
			const change = changes.get(key) ?? {
				origin,
				via,
				dScrollTop: 0,
				dScrollHeight: 0,
				dReaderTop: 0,
			}
			changes.set(key, {
				...change,
				dScrollTop: change.dScrollTop + (delta.dScrollTop ?? 0),
				dScrollHeight: change.dScrollHeight + (delta.dScrollHeight ?? 0),
				dReaderTop: change.dReaderTop + (delta.dReaderTop ?? 0),
			})
		},
		sum: (field) =>
			Array.from(changes.values()).reduce(
				(total, change) => total + change[field],
				0,
			),
		list: () => Array.from(changes.values()).filter(isMeaningful),
	}
}

const isSwap = (active: Recorder, item: Element, previousHeight: number) => {
	const eventFrame = active.cvEventFrames.get(item)
	if (eventFrame !== undefined && active.frame - eventFrame <= CV_EVENT_FRAMES)
		return true
	const placeholder = placeholderHeightOf(item)
	return (
		placeholder !== null &&
		Math.abs(previousHeight - placeholder) < MOVE_EPSILON
	)
}

const wheelShareOf = (active: Recorder, unexplained: number) => {
	if (Math.sign(unexplained) !== Math.sign(active.pendingWheel)) return 0
	const share =
		Math.sign(unexplained) *
		Math.min(Math.abs(unexplained), Math.abs(active.pendingWheel))
	active.pendingWheel -= share
	return share
}

const residualScrollOrigin = (
	active: Recorder,
	after: Layout,
	dScrollHeight: number,
): { origin: ScrollOrigin; via?: string } => {
	if (active.isPointerDown) return { origin: "user-input", via: "pointer" }
	if (active.smooth && now() < active.smooth.until) {
		return { origin: active.smooth.origin, via: "smooth" }
	}
	const isClamped =
		dScrollHeight < 0 &&
		after.scrollTop >= after.scrollHeight - after.clientHeight - 1
	return { origin: "unattributed", via: isClamped ? "clamp" : undefined }
}

const itemOriginOf = (
	active: Recorder,
	item: Element,
	previousHeight: number,
	isWidthChange: boolean,
): ScrollOrigin => {
	if (isWidthChange) return "viewport-resize-observer"
	return isSwap(active, item, previousHeight)
		? "content-visibility-swap"
		: "content-resize-observer"
}

const addItemChanges = (
	{ active, gap }: ViewportTrace,
	changes: ChangeSet,
	before: Layout,
	after: Layout,
) => {
	const reader = before.reader
	const readerBefore = reader ? before.items.indexOf(reader) : -1
	const readerAfter = reader ? after.items.indexOf(reader) : -1
	const isWidthChange = before.clientWidth !== after.clientWidth
	const firstKept = after.items.find((item) => before.heights.has(item))
	const firstKeptBefore = firstKept ? before.items.indexOf(firstKept) : -1
	const firstKeptAfter = firstKept ? after.items.indexOf(firstKept) : -1
	const edgeOrigin = (isTop: boolean): ScrollOrigin =>
		isTop ? "window-rows" : "content-mutation-observer"
	const placementOf = (item: Element, index: number) => {
		const previousHeight = before.heights.get(item)
		if (previousHeight !== undefined) {
			return {
				origin: itemOriginOf(active, item, previousHeight, isWidthChange),
				via: undefined,
				delta: (after.heights.get(item) ?? 0) - previousHeight,
			}
		}
		const isTop = index < firstKeptAfter
		return {
			origin: edgeOrigin(isTop),
			via: isTop ? "rows-loaded" : "rows-appended",
			delta: (after.heights.get(item) ?? 0) + gapOf(item, gap),
		}
	}

	after.items.forEach((item, index) => {
		const { origin, via, delta } = placementOf(item, index)
		if (Math.abs(delta) < CHANGE_EPSILON) return
		changes.add(origin, via, {
			dScrollHeight: delta,
			dReaderTop: index < readerAfter ? delta : 0,
		})
	})

	before.items.forEach((item, index) => {
		if (after.heights.has(item)) return
		const isTop = index < firstKeptBefore
		const delta = -((before.heights.get(item) ?? 0) + gapOf(item, gap))
		changes.add(edgeOrigin(isTop), isTop ? "rows-dropped" : "rows-removed", {
			dScrollHeight: delta,
			dReaderTop: index < readerBefore ? delta : 0,
		})
	})
}

const addScrollChanges = (
	active: Recorder,
	changes: ChangeSet,
	before: Layout,
	after: Layout,
) => {
	const dScrollHeight = after.scrollHeight - before.scrollHeight
	const heightResidual = dScrollHeight - changes.sum("dScrollHeight")
	if (Math.abs(heightResidual) > SCROLL_HEIGHT_ROUNDING) {
		changes.add("content-resize-observer", "outside-rows", {
			dScrollHeight: heightResidual,
		})
	}
	if (
		before.clientHeight !== after.clientHeight ||
		before.clientWidth !== after.clientWidth
	) {
		changes.add("viewport-resize-observer", "client-size", {})
	}
	for (const write of active.writes) {
		changes.add(write.origin, write.via, {
			dScrollTop: write.delta,
			dReaderTop: -write.delta,
		})
	}
	active.writes = []
	const unexplained =
		after.scrollTop - before.scrollTop - changes.sum("dScrollTop")
	const wheelShare = wheelShareOf(active, unexplained)
	if (Math.abs(wheelShare) > CHANGE_EPSILON) {
		changes.add("user-input", "wheel", {
			dScrollTop: wheelShare,
			dReaderTop: -wheelShare,
		})
	}
	const unexplainedTop = unexplained - wheelShare
	if (Math.abs(unexplainedTop) > CHANGE_EPSILON) {
		const residual = residualScrollOrigin(active, after, dScrollHeight)
		changes.add(residual.origin, residual.via, {
			dScrollTop: unexplainedTop,
			dReaderTop: -unexplainedTop,
		})
	}
}

const addReaderResidual = (
	changes: ChangeSet,
	before: Layout,
	after: Layout,
) => {
	if (before.readerTop === null || after.readerTop === null) return
	const residual =
		after.readerTop - before.readerTop - changes.sum("dReaderTop")
	if (Math.abs(residual) > CHANGE_EPSILON) {
		changes.add("content-resize-observer", "outside-content", {
			dReaderTop: residual,
		})
	}
}

export const diff = (trace: ViewportTrace, before: Layout, after: Layout) => {
	const changes = changeSet()
	addItemChanges(trace, changes, before, after)
	addScrollChanges(trace.active, changes, before, after)
	addReaderResidual(changes, before, after)
	return changes.list()
}
