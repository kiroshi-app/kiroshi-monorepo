import * as Y from "yjs"

export const SEND_INTERVAL_MS = 250

const MARKDOWN_TEXT = "markdown"

const REMOTE_ORIGIN = Symbol("remote")

type LibraryDocumentSessionOptions = {
	state: string
	send: (update: string) => Promise<unknown>
}

export const bytesOf = (base64: string) =>
	Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))

export const base64Of = (bytes: Uint8Array) =>
	btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff

const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff

const sharedPrefixLength = (current: string, next: string) => {
	let length = 0
	while (
		length < current.length &&
		length < next.length &&
		current[length] === next[length]
	) {
		length++
	}
	return isHighSurrogate(current.charCodeAt(length - 1)) ? length - 1 : length
}

const sharedSuffixLength = (current: string, next: string, prefix: number) => {
	const limit = Math.min(current.length, next.length) - prefix
	let length = 0
	while (
		length < limit &&
		current[current.length - 1 - length] === next[next.length - 1 - length]
	) {
		length++
	}
	return isLowSurrogate(current.charCodeAt(current.length - length))
		? length - 1
		: length
}

const MAX_EDIT_DISTANCE = 1000

const TOKEN = /[\p{L}\p{N}\p{M}_]+|\s+|./gsu

type Hunk = {
	from: number
	to: number
	insert: string
}

type Run = {
	before: number
	after: number
	length: number
}

type Step = {
	x: number
	fromDiagonal: number
}

const tokensOf = (markdown: string) => markdown.match(TOKEN) ?? []

const offsetsOf = (tokens: string[]) =>
	tokens.reduce(
		(offsets, token, i) => {
			offsets.push((offsets[i] as number) + token.length)
			return offsets
		},
		[0],
	)

const reachOn = (layer: Int32Array, d: number, diagonal: number) =>
	Math.abs(diagonal) > d ? -1 : (layer[diagonal + d] as number)

const stepInto = (
	previous: Int32Array,
	d: number,
	diagonal: number,
	before: string[],
	after: string[],
): Step | null => {
	const inserted = reachOn(previous, d - 1, diagonal + 1)
	const deleted = reachOn(previous, d - 1, diagonal - 1)
	const canInsert = inserted >= 0 && inserted - diagonal <= after.length
	const canDelete = deleted >= 0 && deleted + 1 <= before.length
	if (canDelete && (!canInsert || deleted + 1 > inserted)) {
		return { x: deleted + 1, fromDiagonal: diagonal - 1 }
	}
	return canInsert ? { x: inserted, fromDiagonal: diagonal + 1 } : null
}

const snakeEnd = (before: string[], after: string[], x: number, y: number) => {
	let length = 0
	while (
		x + length < before.length &&
		y + length < after.length &&
		before[x + length] === after[y + length]
	) {
		length++
	}
	return x + length
}

const frontierLayers = (before: string[], after: string[]) => {
	const layers = [Int32Array.of(snakeEnd(before, after, 0, 0))]
	const isDone = (x: number, diagonal: number) =>
		x === before.length && x - diagonal === after.length
	if (isDone(layers[0]?.[0] as number, 0)) {
		return layers
	}
	for (let d = 1; d <= MAX_EDIT_DISTANCE; d++) {
		const previous = layers[d - 1] as Int32Array
		const layer = new Int32Array(2 * d + 1).fill(-1)
		layers.push(layer)
		for (let diagonal = -d; diagonal <= d; diagonal += 2) {
			const step = stepInto(previous, d, diagonal, before, after)
			if (!step) {
				continue
			}
			const x = snakeEnd(before, after, step.x, step.x - diagonal)
			layer[diagonal + d] = x
			if (isDone(x, diagonal)) {
				return layers
			}
		}
	}
	return null
}

const matchedRunsOf = (
	layers: Int32Array[],
	before: string[],
	after: string[],
) => {
	const runs: Run[] = []
	let x = before.length
	let y = after.length
	for (let d = layers.length - 1; d > 0; d--) {
		const previous = layers[d - 1] as Int32Array
		const diagonal = x - y
		const step = stepInto(previous, d, diagonal, before, after) as Step
		runs.push({ before: step.x, after: step.x - diagonal, length: x - step.x })
		x = reachOn(previous, d - 1, step.fromDiagonal)
		y = x - step.fromDiagonal
	}
	runs.push({ before: 0, after: 0, length: x })
	return runs.reverse()
}

type TokenSpan = {
	from: number
	to: number
	insertFrom: number
	insertTo: number
}

const isLineBreak = (token: string | undefined) =>
	token?.includes("\n") ?? false

const boundaryScoreOf = (tokens: string[], from: number, to: number) =>
	Number(isLineBreak(tokens[from - 1]) || isLineBreak(tokens[from])) +
	Number(isLineBreak(tokens[to - 1]) || isLineBreak(tokens[to]))

const lineBreakShiftOf = (
	tokens: string[],
	from: number,
	to: number,
	lowest: number,
	highest: number,
) => {
	let start = from
	while (
		start > lowest &&
		tokens[start - 1] === tokens[to - from + start - 1]
	) {
		start--
	}
	let best = start
	let bestScore = -1
	for (let shifted = start; ; shifted++) {
		const end = to - from + shifted
		const score = boundaryScoreOf(tokens, shifted, end)
		if (score >= bestScore) {
			best = shifted
			bestScore = score
		}
		if (end >= highest || tokens[shifted] !== tokens[end]) {
			return best - from
		}
	}
}

const shiftedSpanOf = (
	span: TokenSpan,
	previous: TokenSpan | undefined,
	next: TokenSpan | undefined,
	before: string[],
	after: string[],
): TokenSpan => {
	const isInsert = span.from === span.to
	const isDelete = span.insertFrom === span.insertTo
	if (isInsert === isDelete) {
		return span
	}
	const shift = isInsert
		? lineBreakShiftOf(
				after,
				span.insertFrom,
				span.insertTo,
				previous?.insertTo ?? 0,
				next?.insertFrom ?? after.length,
			)
		: lineBreakShiftOf(
				before,
				span.from,
				span.to,
				previous?.to ?? 0,
				next?.from ?? before.length,
			)
	return {
		from: span.from + shift,
		to: span.to + shift,
		insertFrom: span.insertFrom + shift,
		insertTo: span.insertTo + shift,
	}
}

const tokenSpansOf = (before: string[], after: string[]) => {
	const layers = frontierLayers(before, after)
	const runs = layers
		? matchedRunsOf(layers, before, after).filter(({ length }) => length > 0)
		: []
	const end = { before: before.length, after: after.length, length: 0 }
	const spans: TokenSpan[] = []
	let from = 0
	let insertFrom = 0
	for (const run of [...runs, end]) {
		if (run.before > from || run.after > insertFrom) {
			spans.push({ from, to: run.before, insertFrom, insertTo: run.after })
		}
		from = run.before + run.length
		insertFrom = run.after + run.length
	}
	const shifted: TokenSpan[] = []
	for (const [i, span] of spans.entries()) {
		shifted.push(
			shiftedSpanOf(span, shifted[i - 1], spans[i + 1], before, after),
		)
	}
	return shifted
}

const changedHunksOf = (current: string, next: string): Hunk[] => {
	const before = tokensOf(current)
	const after = tokensOf(next)
	const beforeOffsets = offsetsOf(before)
	const afterOffsets = offsetsOf(after)
	return tokenSpansOf(before, after).map((span) => {
		const from = beforeOffsets[span.from] as number
		const to = beforeOffsets[span.to] as number
		const removed = current.slice(from, to)
		const inserted = next.slice(
			afterOffsets[span.insertFrom],
			afterOffsets[span.insertTo],
		)
		const start = sharedPrefixLength(removed, inserted)
		const kept = sharedSuffixLength(removed, inserted, start)
		return {
			from: from + start,
			to: to - kept,
			insert: inserted.slice(start, inserted.length - kept),
		}
	})
}

const replaceChangedHunks = (doc: Y.Doc, next: string) => {
	const text = doc.getText(MARKDOWN_TEXT)
	const hunks = changedHunksOf(text.toString(), next)
	doc.transact(() => {
		for (const { from, to, insert } of hunks.reverse()) {
			if (to > from) {
				text.delete(from, to - from)
			}
			if (insert) {
				text.insert(from, insert)
			}
		}
	})
}

const docOf = (state: string) => {
	const doc = new Y.Doc()
	Y.applyUpdate(doc, bytesOf(state), REMOTE_ORIGIN)
	return doc
}

export const seedUpdateOf = (state: string, markdown: string) => {
	const doc = docOf(state)
	const before = Y.encodeStateVector(doc)
	replaceChangedHunks(doc, markdown)
	return base64Of(Y.encodeStateAsUpdate(doc, before))
}

export const createLibraryDocumentSession = ({
	state,
	send,
}: LibraryDocumentSessionOptions) => {
	const doc = docOf(state)
	const text = doc.getText(MARKDOWN_TEXT)
	let pending: Uint8Array[] = []
	let timer: ReturnType<typeof setTimeout> | null = null
	let sent: Promise<unknown> = Promise.resolve()

	const flush = () => {
		if (timer) {
			clearTimeout(timer)
			timer = null
		}
		if (pending.length > 0) {
			const update = base64Of(Y.mergeUpdates(pending))
			pending = []
			sent = Promise.allSettled([sent, send(update)])
		}
		return sent
	}

	doc.on("update", (update: Uint8Array, origin: unknown) => {
		if (origin === REMOTE_ORIGIN) {
			return
		}
		pending.push(update)
		timer ??= setTimeout(flush, SEND_INTERVAL_MS)
	})

	const receive = (update: string) => {
		const before = text.toString()
		Y.applyUpdate(doc, bytesOf(update), REMOTE_ORIGIN)
		return text.toString() !== before
	}

	const offsetOf = (caret: string) => {
		const position = Y.createAbsolutePositionFromRelativePosition(
			Y.decodeRelativePosition(bytesOf(caret)),
			doc,
		)
		return position?.type === text ? position.index : null
	}

	const caretOf = (offset: number) =>
		base64Of(
			Y.encodeRelativePosition(
				Y.createRelativePositionFromTypeIndex(text, offset, -1),
			),
		)

	const subscribe = (onChange: () => void) => {
		doc.on("update", onChange)
		return () => doc.off("update", onChange)
	}

	return {
		markdown: () => text.toString(),
		subscribe,
		edit: (markdown: string) => replaceChangedHunks(doc, markdown),
		receive,
		flush,
		offsetOf,
		caretOf,
	}
}
