type MarkdownRun = {
	id: string
	start: number
	end: number
}

type MarkdownFenceRun = MarkdownRun & {
	isContinued?: boolean
}

type RemarkRunsOptions = {
	runs: MarkdownRun[]
}

interface MdastNode {
	type: string
	value?: string
	children?: MdastNode[]
	position?: { start: { offset?: number }; end: { offset?: number } }
	data?: { hName?: string; hProperties?: Record<string, unknown> }
}

const MARKDOWN_RUN_ATTRIBUTE = "data-markdown-run"

const MARKDOWN_RUN_END_ATTRIBUTE = "data-markdown-run-end"

const MARKDOWN_CODE_RUNS_ATTRIBUTE = "data-markdown-code-runs"

type MarkedFile = { value: unknown }

type Cut = { from: number; to: number; id: string }

type RunPiece = { from: number; to: number; ids: string[] }

type CodeLineSpan = { from: number; to: number; at: number }

const FENCE_OPENING = /^(?:`{3,}|~{3,})/

const runNodeOf = (id: string, child: MdastNode): MdastNode => ({
	type: "markdownRun",
	data: { hName: "span", hProperties: { [MARKDOWN_RUN_ATTRIBUTE]: id } },
	children: [child],
})

const isCaret = ({ start, end }: MarkdownRun) => start === end

const codeLinesOf = (node: MdastNode, source: string): CodeLineSpan[] => {
	const from = node.position?.start.offset
	const to = node.position?.end.offset
	if (from === undefined || to === undefined || !node.value) return []
	const [opening = "", ...below] = source.slice(from, to).split("\n")
	const isFenced = FENCE_OPENING.test(opening)
	const written = isFenced ? below : [opening, ...below]
	const shown = node.value.split("\n")
	if (shown.some((line, index) => !written[index]?.endsWith(line))) return []

	const lines: CodeLineSpan[] = []
	let writtenEnd = isFenced ? from + opening.length : from - 1
	let at = 0
	for (const [index, line] of shown.entries()) {
		writtenEnd += 1 + (written[index]?.length ?? 0)
		lines.push({ from: writtenEnd - line.length, to: writtenEnd, at })
		at += line.length + 1
	}
	return lines
}

const caretSpansOf = (node: MdastNode, source: string): [number, number][] => {
	const from = node.position?.start.offset
	const to = node.position?.end.offset
	if (node.type === "text")
		return from === undefined || to === undefined ? [] : [[from, to]]
	if (node.type === "code")
		return codeLinesOf(node, source).map((line) => [line.from, line.to])
	return (node.children ?? []).flatMap((child) => caretSpansOf(child, source))
}

const caretsSnappedToText = (
	runs: MarkdownRun[],
	tree: MdastNode,
	source: string,
) => {
	const spans = caretSpansOf(tree, source)
	const last = spans.at(-1)
	if (!last) return runs
	return runs.map((run) => {
		if (
			!isCaret(run) ||
			spans.some(([from, to]) => from <= run.start && run.start <= to)
		)
			return run
		const at = spans.find(([from]) => from > run.start)?.[0] ?? last[1]
		return { ...run, start: at, end: at }
	})
}

const cutsWithin = (runs: MarkdownRun[], from: number, to: number): Cut[] =>
	runs
		.filter((run) =>
			isCaret(run)
				? from <= run.start && run.start <= to
				: run.start < to && run.end > from,
		)
		.map((run) => ({
			from: Math.max(run.start, from) - from,
			to: Math.min(run.end, to) - from,
			id: run.id,
		}))

const cutsOf = (node: MdastNode, runs: MarkdownRun[]): Cut[] => {
	const { length } = node.value ?? ""
	const from = node.position?.start.offset
	const to = node.position?.end.offset
	if (from === undefined || to === undefined) return []
	const cuts = cutsWithin(runs, from, to)
	if (to - from === length) return cuts
	return cuts.map((cut) => ({
		from: cut.from === cut.to ? length : 0,
		to: length,
		id: cut.id,
	}))
}

const piecesOf = (length: number, cuts: Cut[]): RunPiece[] => {
	const edges = [
		...new Set([0, length, ...cuts.flatMap(({ from, to }) => [from, to])]),
	].sort((left, right) => left - right)

	return edges.flatMap((edge, index) => {
		const carets = cuts
			.filter(({ from, to }) => from === edge && to === edge)
			.map(({ id }) => ({ from: edge, to: edge, ids: [id] }))
		const next = edges[index + 1]
		if (next === undefined) return carets
		const ids = cuts
			.filter(({ from, to }) => from <= edge && to >= next)
			.map(({ id }) => id)
		return [...carets, { from: edge, to: next, ids }]
	})
}

const runPiecesOf = (runs: MarkdownRun[], from: number, to: number) =>
	piecesOf(to - from, cutsWithin(runs, from, to))

const splitRuns = (node: MdastNode, runs: MarkdownRun[]) => {
	const value = node.value ?? ""
	const cuts = cutsOf(node, runs)
	if (cuts.length === 0) return null

	return piecesOf(value.length, cuts).map(({ from, to, ids }) =>
		ids.reduceRight<MdastNode>((inner, id) => runNodeOf(id, inner), {
			type: "text",
			value: value.slice(from, to),
		}),
	)
}

const codeRunsOf = (lines: CodeLineSpan[], runs: MarkdownRun[]) =>
	runs.flatMap((run): MarkdownRun[] => {
		const parts = lines.flatMap(({ from, to, at }) =>
			cutsWithin([run], from, to).map((cut) => ({
				start: at + cut.from,
				end: at + cut.to,
			})),
		)
		const first = parts[0]
		const last = parts.at(-1)
		return first && last
			? [{ id: run.id, start: first.start, end: last.end }]
			: []
	})

const markCodeRuns = (node: MdastNode, codeRuns: MarkdownFenceRun[]) => {
	node.data = {
		...node.data,
		hProperties: {
			...node.data?.hProperties,
			[MARKDOWN_CODE_RUNS_ATTRIBUTE]: JSON.stringify(codeRuns),
		},
	}
}

const remarkRuns =
	({ runs: received }: RemarkRunsOptions) =>
	(tree: MdastNode, file: MarkedFile) => {
		const source = String(file.value ?? "")
		const runs = caretsSnappedToText(received, tree, source)
		const lastPieces = new Map<string, MdastNode>()
		const fences = new Map<MdastNode, MarkdownRun[]>()

		const noteLastPieces = (node: MdastNode) => {
			if (node.type !== "markdownRun") return
			lastPieces.set(
				String(node.data?.hProperties?.[MARKDOWN_RUN_ATTRIBUTE]),
				node,
			)
			node.children?.forEach(noteLastPieces)
		}

		const noteFence = (node: MdastNode) => {
			const codeRuns = codeRunsOf(codeLinesOf(node, source), runs)
			if (codeRuns.length === 0) return
			fences.set(node, codeRuns)
			for (const { id } of codeRuns) lastPieces.set(id, node)
		}

		const rewrite = (node: MdastNode) => {
			if (!node.children) return

			node.children = node.children.flatMap((child) =>
				child.type === "text" ? (splitRuns(child, runs) ?? child) : child,
			)

			for (const child of node.children) {
				if (child.type === "markdownRun") noteLastPieces(child)
				else if (child.type === "code") noteFence(child)
				else rewrite(child)
			}
		}

		rewrite(tree)

		for (const piece of lastPieces.values())
			if (piece.type === "markdownRun" && piece.data?.hProperties)
				piece.data.hProperties[MARKDOWN_RUN_END_ATTRIBUTE] = "true"

		for (const [fence, codeRuns] of fences)
			markCodeRuns(
				fence,
				codeRuns.map((run) =>
					lastPieces.get(run.id) === fence
						? run
						: { ...run, isContinued: true },
				),
			)
	}

export {
	MARKDOWN_CODE_RUNS_ATTRIBUTE,
	MARKDOWN_RUN_ATTRIBUTE,
	MARKDOWN_RUN_END_ATTRIBUTE,
	type MarkdownFenceRun,
	type MarkdownRun,
	remarkRuns,
	runPiecesOf,
}
