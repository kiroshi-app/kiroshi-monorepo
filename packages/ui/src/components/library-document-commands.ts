import { isolateHistory } from "@codemirror/commands"
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language"
import {
	type ChangeSet,
	type EditorSelection,
	type EditorState,
	type Line,
	type SelectionRange,
	type StateCommand,
	StateEffect,
	StateField,
	Transaction,
} from "@codemirror/state"
import type { SyntaxNode } from "@lezer/common"

type Span = {
	from: number
	to: number
}

type Change = Span & {
	insert: string
}

type InlineRun = Span & {
	node: SyntaxNode
	contentFrom: number
	contentTo: number
}

type InlineMarkers = {
	node: string
	open: string
	close: string
	isFlanked: boolean
}

type ListMark = Span & {
	isOrdered: boolean
}

type HeadingMark = Span & {
	level: number
}

type LineShape = {
	line: Line
	quote?: Span
	list?: ListMark
	task?: Span
	heading?: HeadingMark
	prefixStarts: number[]
	textFrom: number
	textTo: number
	isCode: boolean
}

type RoundTrip = {
	node: string
	inverse: ChangeSet
	selection: EditorSelection
}

type LineFormat = {
	has: (shape: LineShape) => boolean
	added: (shape: LineShape, index: number) => Change[]
	removed: (shape: LineShape) => Change[]
}

const PARSE_BUDGET_MS = 200

const INLINE_RUNS = new Set([
	"StrongEmphasis",
	"Emphasis",
	"Strikethrough",
	"InlineCode",
	"Link",
	"Image",
	"Autolink",
	"URL",
])

const ATOMIC_RUNS = new Set(["InlineCode", "Link", "Image", "Autolink", "URL"])

const CODE_BLOCKS = new Set(["FencedCode", "CodeBlock"])

const FENCE = "```"

const FORMAT_EVENT = [
	isolateHistory.of("full"),
	Transaction.userEvent.of("input.format"),
]

const isFormatToRemove = (isCarriedByPart: boolean[]) =>
	isCarriedByPart.every(Boolean)

const treeOf = (state: EditorState) =>
	ensureSyntaxTree(state, state.doc.length, PARSE_BUDGET_MS) ??
	syntaxTree(state)

const isSpace = (character: string) => character === " " || character === "\t"

const PUNCTUATION = /[\p{P}\p{S}]/u

const isWordCharacter = (character: string) =>
	character !== "" && !/\s/.test(character) && !PUNCTUATION.test(character)

const spacesEndFrom = (state: EditorState, at: number, to: number) => {
	let end = at
	while (end < to && isSpace(state.sliceDoc(end, end + 1))) end++
	return end
}

const trimmed = (state: EditorState, { from, to }: Span): Span => {
	let start = from
	let end = to
	while (start < end && isSpace(state.sliceDoc(start, start + 1))) start++
	while (end > start && isSpace(state.sliceDoc(end - 1, end))) end--
	return { from: start, to: end }
}

const isInside = (span: Span, at: number) => span.from < at && at < span.to

const overlaps = (first: Span, second: Span) =>
	first.from < second.to && second.from < first.to

const contains = (outer: Span, inner: Span) =>
	outer.from <= inner.from && inner.to <= outer.to

const union = (first: Span, second: Span): Span => ({
	from: Math.min(first.from, second.from),
	to: Math.max(first.to, second.to),
})

const runOf = (node: SyntaxNode): InlineRun => {
	const marks =
		node.name === "Link"
			? node.getChildren("LinkMark")
			: [node.firstChild, node.lastChild]
	const open = marks[0]
	const close = node.name === "Link" ? marks[1] : marks.at(-1)
	return {
		node,
		from: node.from,
		to: node.to,
		contentFrom: open?.to ?? node.from,
		contentTo: close?.from ?? node.to,
	}
}

const runsIn = (state: EditorState, { from, to }: Span) => {
	const runs: InlineRun[] = []
	treeOf(state).iterate({
		from,
		to,
		enter: (node) => {
			if (INLINE_RUNS.has(node.name)) runs.push(runOf(node.node))
		},
	})
	return runs
}

const headingLevelOf = (name: string) => Number(name.slice("ATXHeading".length))

const shapeOf = (state: EditorState, line: Line): LineShape => {
	const shape: LineShape = {
		line,
		prefixStarts: [],
		textFrom: line.from,
		textTo: line.to,
		isCode: false,
	}
	const prefixEnds = [line.from]
	treeOf(state).iterate({
		from: line.from,
		to: line.to,
		enter: (node) => {
			if (CODE_BLOCKS.has(node.name)) shape.isCode = true
			if (node.from < line.from || node.to > line.to) return
			const parent = node.node.parent
			if (node.name === "QuoteMark")
				shape.quote ??= { from: node.from, to: node.to }
			else if (node.name === "ListMark")
				shape.list = {
					from: node.from,
					to: node.to,
					isOrdered: parent?.parent?.name === "OrderedList",
				}
			else if (node.name === "TaskMarker")
				shape.task = { from: node.from, to: node.to }
			else if (node.name === "HeaderMark" && parent?.name.startsWith("ATX")) {
				if (node.from !== parent.from) {
					shape.textTo = node.from
					return
				}
				shape.heading = {
					from: node.from,
					to: node.to,
					level: headingLevelOf(parent.name),
				}
			} else return
			shape.prefixStarts.push(node.from)
			prefixEnds.push(node.to)
		},
	})
	shape.textFrom = spacesEndFrom(state, Math.max(...prefixEnds), line.to)
	shape.textTo = Math.max(shape.textFrom, shape.textTo)
	shape.prefixStarts.push(shape.textFrom)
	return shape
}

const linesOf = (state: EditorState, { from, to }: SelectionRange) => {
	const first = state.doc.lineAt(from).number
	const end = state.doc.lineAt(to)
	const last =
		to > from && end.from === to && end.number > first
			? end.number - 1
			: end.number
	return Array.from({ length: last - first + 1 }, (_, index) =>
		state.doc.line(first + index),
	)
}

const segmentsOfSelection = (state: EditorState) =>
	state.selection.ranges.flatMap((range) =>
		linesOf(state, range).flatMap((line) => {
			const shape = shapeOf(state, line)
			if (shape.isCode) return []
			const segment = trimmed(state, {
				from: Math.max(range.from, shape.textFrom),
				to: Math.min(range.to, shape.textTo),
			})
			return segment.from < segment.to ? [segment] : []
		}),
	)

const isCarried = (state: EditorState, segment: Span, node: string) => {
	const runs = runsIn(state, segment).filter((run) => run.node.name === node)
	for (let at = segment.from; at < segment.to; at++) {
		if (isSpace(state.sliceDoc(at, at + 1))) continue
		if (!runs.some((run) => run.from <= at && at < run.to)) return false
	}
	return true
}

const touches = (first: Span, second: Span) =>
	first.from <= second.to && second.from <= first.to

const isSplitBy = (run: InlineRun, span: Span, node: string) => {
	if (run.node.name === node) return touches(run, span) && !contains(span, run)
	if (!isInside(run, span.from) && !isInside(run, span.to)) return false
	if (ATOMIC_RUNS.has(run.node.name)) return true
	return !contains({ from: run.contentFrom, to: run.contentTo }, span)
}

const openingFlankedAt = (state: EditorState, at: number) => {
	if (!PUNCTUATION.test(state.sliceDoc(at, at + 1))) return at
	const { from } = state.doc.lineAt(at)
	let start = at
	while (start > from && isWordCharacter(state.sliceDoc(start - 1, start)))
		start--
	return start
}

const closingFlankedAt = (state: EditorState, at: number) => {
	if (!PUNCTUATION.test(state.sliceDoc(at - 1, at))) return at
	const { to } = state.doc.lineAt(at)
	let end = at
	while (end < to && isWordCharacter(state.sliceDoc(end, end + 1))) end++
	return end
}

const flanked = (state: EditorState, span: Span): Span => ({
	from: openingFlankedAt(state, span.from),
	to: closingFlankedAt(state, span.to),
})

const spanToFormat = (
	state: EditorState,
	segment: Span,
	{ node, isFlanked }: InlineMarkers,
) => {
	let span = segment
	for (;;) {
		const split = runsIn(state, span).find((run) => isSplitBy(run, span, node))
		const widened = isFlanked ? flanked(state, span) : span
		const next = split ? union(widened, split) : widened
		if (next.from === span.from && next.to === span.to) return span
		span = next
	}
}

const unwrapped = ({
	from,
	to,
	contentFrom,
	contentTo,
}: InlineRun): Change[] => [
	{ from, to: contentFrom, insert: "" },
	{ from: contentTo, to, insert: "" },
]

const wrapped = (
	state: EditorState,
	segment: Span,
	markers: InlineMarkers,
): Change[] => {
	const span = spanToFormat(state, segment, markers)
	const carried = runsIn(state, span).filter(
		(run) => run.node.name === markers.node && contains(span, run),
	)
	return [
		...carried.flatMap(unwrapped),
		{ from: span.from, to: span.from, insert: markers.open },
		{ from: span.to, to: span.to, insert: markers.close },
	]
}

const runsCarrying = (state: EditorState, segments: Span[], node: string) =>
	segments.flatMap((segment) =>
		runsIn(state, segment).filter(
			(run) => run.node.name === node && overlaps(run, segment),
		),
	)

const withoutNoOps = (state: EditorState, changes: Change[]) => {
	const byKey = new Map<string, Change>()
	for (const change of changes) {
		const key = `${change.from}:${change.to}:${change.insert}`
		if (state.sliceDoc(change.from, change.to) !== change.insert)
			byKey.set(key, change)
	}
	return [...byKey.values()]
}

const withoutRewrittenMarkers = (state: EditorState, changes: Change[]) => {
	const removedAt = (at: number, insert: string) =>
		changes.find(
			(change) =>
				change.insert === "" &&
				(change.from === at || change.to === at) &&
				state.sliceDoc(change.from, change.to) === insert,
		)
	const kept = new Set<Change>()
	for (const change of changes) {
		if (change.from !== change.to || change.insert === "") continue
		const removal = removedAt(change.from, change.insert)
		if (!removal) continue
		kept.add(change)
		kept.add(removal)
	}
	return changes.filter((change) => !kept.has(change))
}

const roundTripStarted = StateEffect.define<RoundTrip>()

const pendingRoundTrip = StateField.define<RoundTrip | null>({
	create: () => null,
	update: (pending, transaction) => {
		for (const effect of transaction.effects)
			if (effect.is(roundTripStarted)) return effect.value
		const isSelectionMoved = !transaction.startState.selection.eq(
			transaction.newSelection,
		)
		return transaction.docChanged || isSelectionMoved ? null : pending
	},
})

const roundTripEffects = (state: EditorState, roundTrip: RoundTrip) => [
	...(state.field(pendingRoundTrip, false) === undefined
		? [StateEffect.appendConfig.of(pendingRoundTrip)]
		: []),
	roundTripStarted.of(roundTrip),
]

const dispatchFormat = (
	{ state, dispatch }: Parameters<StateCommand>[0],
	changes: Change[],
	roundTripNode?: string,
) => {
	const effective = withoutNoOps(state, withoutRewrittenMarkers(state, changes))
	if (effective.length === 0) return false
	const changeSet = state.changes(effective)
	dispatch(
		state.update({
			changes: changeSet,
			selection: state.selection.map(changeSet, 1),
			effects:
				roundTripNode === undefined
					? []
					: roundTripEffects(state, {
							node: roundTripNode,
							inverse: changeSet.invert(state.doc),
							selection: state.selection,
						}),
			annotations: FORMAT_EVENT,
		}),
	)
	return true
}

const returnedRoundTrip = (
	{ state, dispatch }: Parameters<StateCommand>[0],
	node: string,
) => {
	const pending = state.field(pendingRoundTrip, false)
	if (pending?.node !== node) return false
	dispatch(
		state.update({
			changes: pending.inverse,
			selection: pending.selection,
			annotations: FORMAT_EVENT,
		}),
	)
	return true
}

const removalChecks = new WeakMap<
	StateCommand,
	(state: EditorState) => boolean
>()

const withRemovalCheck = (
	command: StateCommand,
	isRemoval: (state: EditorState) => boolean,
) => {
	removalChecks.set(command, isRemoval)
	return command
}

const isFormatOn = (state: EditorState, command: StateCommand) =>
	removalChecks.get(command)?.(state) ?? false

const isEverySegmentCarried = (
	state: EditorState,
	segments: Span[],
	node: string,
) =>
	segments.length > 0 &&
	isFormatToRemove(segments.map((segment) => isCarried(state, segment, node)))

const toggledInline = (
	node: string,
	marker: string,
	isFlanked: boolean,
): StateCommand =>
	withRemovalCheck(
		(target) => {
			const { state } = target
			if (returnedRoundTrip(target, node)) return true
			const segments = segmentsOfSelection(state)
			if (segments.length === 0) return false
			if (isEverySegmentCarried(state, segments, node))
				return dispatchFormat(
					target,
					runsCarrying(state, segments, node).flatMap(unwrapped),
				)
			const changes = segments.flatMap((segment) =>
				wrapped(state, segment, {
					node,
					open: marker,
					close: marker,
					isFlanked,
				}),
			)
			return dispatchFormat(target, changes, node)
		},
		(state) => isEverySegmentCarried(state, segmentsOfSelection(state), node),
	)

const toggleBold = toggledInline("StrongEmphasis", "**", true)

const toggleItalic = toggledInline("Emphasis", "*", true)

const toggleStrikethrough = toggledInline("Strikethrough", "~~", true)

const toggleInlineCode = toggledInline("InlineCode", "`", false)

const linkTargetOf = (url: string) =>
	url.trim().replace(/[\s()]/g, encodeURIComponent)

const relinked = (run: InlineRun, target: string): Change => ({
	from: run.contentTo,
	to: run.to,
	insert: `](${target})`,
})

const setLink =
	(url: string): StateCommand =>
	(target) => {
		const { state } = target
		const destination = linkTargetOf(url)
		const segments = segmentsOfSelection(state)
		if (segments.length === 0) return false
		const links = runsCarrying(state, segments, "Link")
		if (destination === "")
			return dispatchFormat(target, links.flatMap(unwrapped))
		const changes = isEverySegmentCarried(state, segments, "Link")
			? links.map((run) => relinked(run, destination))
			: segments.flatMap((segment) =>
					wrapped(state, segment, {
						node: "Link",
						open: "[",
						close: `](${destination})`,
						isFlanked: false,
					}),
				)
		return dispatchFormat(target, changes)
	}

const shapesOfSelection = (state: EditorState) => {
	const seen = new Set<number>()
	return state.selection.ranges.map((range) =>
		linesOf(state, range).flatMap((line) => {
			if (seen.has(line.number) || line.text.trim() === "") return []
			seen.add(line.number)
			const shape = shapeOf(state, line)
			return shape.isCode ? [] : [shape]
		}),
	)
}

const isEveryLineCarried = (shapes: LineShape[], format: LineFormat) =>
	shapes.length > 0 && isFormatToRemove(shapes.map(format.has))

const toggledLines = (format: LineFormat): StateCommand =>
	withRemovalCheck(
		(target) => {
			const groups = shapesOfSelection(target.state)
			const shapes = groups.flat()
			if (shapes.length === 0) return false
			const changes = isEveryLineCarried(shapes, format)
				? shapes.flatMap(format.removed)
				: groups.flatMap((group) =>
						group.flatMap((shape, index) => format.added(shape, index)),
					)
			return dispatchFormat(target, changes)
		},
		(state) => isEveryLineCarried(shapesOfSelection(state).flat(), format),
	)

const inserted = (at: number, insert: string): Change => ({
	from: at,
	to: at,
	insert,
})

const deleted = (from: number, to: number): Change => ({ from, to, insert: "" })

const prefixOf = (shape: LineShape, mark: Span): Span => ({
	from: mark.from,
	to: Math.min(...shape.prefixStarts.filter((start) => start > mark.from)),
})

const removedPrefix = (shape: LineShape, mark?: Span) =>
	mark ? [deleted(mark.from, prefixOf(shape, mark).to)] : []

const listInsertionOf = (shape: LineShape) =>
	shape.heading?.from ?? shape.textFrom

const listMarked = (
	shape: LineShape,
	marker: string,
	hasTask: boolean,
): Change[] => {
	const { list, task } = shape
	if (!list)
		return [
			inserted(
				listInsertionOf(shape),
				hasTask ? `${marker} [ ] ` : `${marker} `,
			),
		]
	const replaced = { ...list, insert: marker }
	if (task && !hasTask)
		return [replaced, deleted(task.from, prefixOf(shape, task).to)]
	if (!task && hasTask)
		return [replaced, inserted(prefixOf(shape, list).to, "[ ] ")]
	return [replaced]
}

const headingFormat = (level: number): LineFormat => ({
	has: ({ heading }) => heading?.level === level,
	added: (shape) =>
		shape.heading
			? [{ ...shape.heading, insert: "#".repeat(level) }]
			: [inserted(shape.textFrom, `${"#".repeat(level)} `)],
	removed: (shape) => removedPrefix(shape, shape.heading),
})

const BULLET_LIST: LineFormat = {
	has: ({ list, task }) => list?.isOrdered === false && !task,
	added: (shape) => listMarked(shape, "-", false),
	removed: (shape) => removedPrefix(shape, shape.list),
}

const NUMBERED_LIST: LineFormat = {
	has: ({ list, task }) => list?.isOrdered === true && !task,
	added: (shape, index) => listMarked(shape, `${index + 1}.`, false),
	removed: (shape) => removedPrefix(shape, shape.list),
}

const TASK_LIST: LineFormat = {
	has: ({ task }) => task !== undefined,
	added: (shape) =>
		shape.task && shape.list?.isOrdered === false
			? []
			: listMarked(shape, "-", true),
	removed: (shape) =>
		shape.list && shape.task
			? [deleted(shape.list.from, prefixOf(shape, shape.task).to)]
			: [],
}

const QUOTE: LineFormat = {
	has: ({ quote }) => quote !== undefined,
	added: ({ quote, line }) => (quote ? [] : [inserted(line.from, "> ")]),
	removed: (shape) => removedPrefix(shape, shape.quote),
}

const toggleHeading1 = toggledLines(headingFormat(1))

const toggleHeading2 = toggledLines(headingFormat(2))

const toggleHeading3 = toggledLines(headingFormat(3))

const toggleBulletList = toggledLines(BULLET_LIST)

const toggleNumberedList = toggledLines(NUMBERED_LIST)

const toggleTask = toggledLines(TASK_LIST)

const toggleQuote = toggledLines(QUOTE)

const fencesIn = (state: EditorState, span: Span) => {
	const fences: SyntaxNode[] = []
	treeOf(state).iterate({
		from: span.from,
		to: span.to,
		enter: (node) => {
			if (node.name !== "FencedCode") return
			fences.push(node.node)
			return false
		},
	})
	return fences
}

const fenceLinesOf = (state: EditorState, fence: SyntaxNode) => {
	const opening = state.doc.lineAt(fence.from)
	const closing = state.doc.lineAt(fence.to)
	return closing.number > opening.number && fence.lastChild?.name === "CodeMark"
		? [opening, closing]
		: [opening]
}

const withoutLine = (state: EditorState, line: Line): Change =>
	line.to < state.doc.length
		? deleted(line.from, line.to + 1)
		: deleted(Math.max(0, line.from - 1), line.to)

const unfenced = (state: EditorState, fence: SyntaxNode) =>
	fenceLinesOf(state, fence).map((line) => withoutLine(state, line))

const blockOf = (state: EditorState, range: SelectionRange): Span => {
	const lines = linesOf(state, range)
	return {
		from: lines[0]?.from ?? range.from,
		to: lines.at(-1)?.to ?? range.to,
	}
}

const fenceAround = (state: EditorState, block: Span) => {
	const fences = fencesIn(state, block)
	const [fence] = fences
	return fences.length === 1 && fence && contains(fence, block)
		? fence
		: undefined
}

const fenced = (state: EditorState, block: Span): Change[] => {
	const fences = fencesIn(state, block)
	const span = fences.reduce<Span>(
		(around, fence) =>
			union(around, {
				from: state.doc.lineAt(fence.from).from,
				to: state.doc.lineAt(fence.to).to,
			}),
		block,
	)
	return [
		...fences.flatMap((fence) => unfenced(state, fence)),
		inserted(span.from, `${FENCE}\n`),
		inserted(span.to, `\n${FENCE}`),
	]
}

const toggleCodeBlock: StateCommand = (target) => {
	const { state } = target
	const blocks = state.selection.ranges.map((range) => blockOf(state, range))
	const fences = blocks.map((block) => fenceAround(state, block))
	const changes = isFormatToRemove(fences.map(Boolean))
		? fences.flatMap((fence) => (fence ? unfenced(state, fence) : []))
		: blocks.flatMap((block) => fenced(state, block))
	return dispatchFormat(target, changes)
}

const selectedLinkOf = (state: EditorState) => {
	const segments = segmentsOfSelection(state)
	if (!isEverySegmentCarried(state, segments, "Link")) return undefined
	const url = runsCarrying(state, segments, "Link")[0]?.node.getChild("URL")
	return { url: url ? state.sliceDoc(url.from, url.to) : "" }
}

export {
	isFormatOn,
	isFormatToRemove,
	selectedLinkOf,
	setLink,
	toggleBold,
	toggleBulletList,
	toggleCodeBlock,
	toggleHeading1,
	toggleHeading2,
	toggleHeading3,
	toggleInlineCode,
	toggleItalic,
	toggleNumberedList,
	toggleQuote,
	toggleStrikethrough,
	toggleTask,
}
