export type ScrollOrigin =
	| "content-mutation-observer"
	| "content-resize-observer"
	| "viewport-resize-observer"
	| "app-scroll-to-end"
	| "app-scroll-to-element"
	| "content-visibility-swap"
	| "window-rows"
	| "engine-handle-resize"
	| "unattributed"
	| "user-input"
	| "untagged-js-write"

export type AppScrollWriter = "app-scroll-to-end" | "app-scroll-to-element"

type WriterOrigin =
	| AppScrollWriter
	| "content-mutation-observer"
	| "engine-handle-resize"
	| "untagged-js-write"

export type WriteContext = {
	origin: WriterOrigin
	via?: string
}

type Write = WriteContext & {
	delta: number
}

type SmoothScroll = WriteContext & {
	until: number
}

export type Change = {
	origin: ScrollOrigin
	via?: string
	dScrollTop: number
	dScrollHeight: number
	dReaderTop: number
}

export type ScrollTraceEntry = Change & {
	t: number
	frame: number
	scrollTop: number
	scrollHeight: number
	clientHeight: number
	clientWidth: number
	thumbRatio: number
}

export type AutoscrollingToggle = {
	t: number
	isOn: boolean
}

export type Layout = {
	scrollTop: number
	scrollHeight: number
	clientHeight: number
	clientWidth: number
	items: Element[]
	heights: Map<Element, number>
	reader: Element | undefined
	readerTop: number | null
}

export type Session = {
	label: string
	element: Element
	messageId: string
	startedAt: number
	startTop: number
	endedAt?: number
	endTop?: number | null
	entriesFrom: number
	entriesTo?: number
}

export type Natives = {
	MutationObserver: typeof MutationObserver
	ResizeObserver: typeof ResizeObserver
	requestAnimationFrame: typeof requestAnimationFrame
	cancelAnimationFrame: typeof cancelAnimationFrame
}

export type Recorder = {
	natives: Natives
	frame: number
	entries: ScrollTraceEntry[]
	toggles: AutoscrollingToggle[]
	sessions: Session[]
	writes: Write[]
	smooth: SmoothScroll | null
	inputUntil: number
	pendingWheel: number
	isPointerDown: boolean
	isAwaitingStop: boolean
	cvEventFrames: WeakMap<Element, number>
}

export type ViewportTrace = {
	viewport: HTMLElement
	content: Element | null
	active: Recorder
	gap: number
	readTop: () => number
	previous: Layout | null
}

export const MOVE_EPSILON = 0.5

export const now = () => performance.now()

export const round = (value: number) => Math.round(value * 10) / 10
