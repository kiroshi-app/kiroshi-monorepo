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

const replaceChangedRange = (doc: Y.Doc, next: string) => {
	const text = doc.getText(MARKDOWN_TEXT)
	const current = text.toString()
	const start = sharedPrefixLength(current, next)
	const end = sharedSuffixLength(current, next, start)
	doc.transact(() => {
		text.delete(start, current.length - end - start)
		text.insert(start, next.slice(start, next.length - end))
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
	replaceChangedRange(doc, markdown)
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
		edit: (markdown: string) => replaceChangedRange(doc, markdown),
		receive,
		flush,
		offsetOf,
		caretOf,
	}
}
