type MarkdownRun = {
	id: string
	start: number
	end: number
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

type Cut = { from: number; to: number; id: string }

type RunPiece = { from: number; to: number; ids: string[] }

const runNodeOf = (id: string, child: MdastNode): MdastNode => ({
	type: "markdownRun",
	data: { hName: "span", hProperties: { [MARKDOWN_RUN_ATTRIBUTE]: id } },
	children: [child],
})

const isCaret = ({ start, end }: MarkdownRun) => start === end

const textSpansOf = (node: MdastNode): [number, number][] => {
	const from = node.position?.start.offset
	const to = node.position?.end.offset
	if (node.type === "text")
		return from === undefined || to === undefined ? [] : [[from, to]]
	return (node.children ?? []).flatMap(textSpansOf)
}

const caretsSnappedToText = (runs: MarkdownRun[], tree: MdastNode) => {
	const spans = textSpansOf(tree)
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

const remarkRuns =
	({ runs: received }: RemarkRunsOptions) =>
	(tree: MdastNode) => {
		const runs = caretsSnappedToText(received, tree)
		const lastPieces = new Map<string, MdastNode>()

		const noteLastPieces = (node: MdastNode) => {
			if (node.type !== "markdownRun") return
			lastPieces.set(
				String(node.data?.hProperties?.[MARKDOWN_RUN_ATTRIBUTE]),
				node,
			)
			node.children?.forEach(noteLastPieces)
		}

		const rewrite = (node: MdastNode) => {
			if (!node.children) return

			node.children = node.children.flatMap((child) =>
				child.type === "text" ? (splitRuns(child, runs) ?? child) : child,
			)

			for (const child of node.children) {
				if (child.type === "markdownRun") noteLastPieces(child)
				else rewrite(child)
			}
		}

		rewrite(tree)

		for (const piece of lastPieces.values())
			if (piece.data?.hProperties)
				piece.data.hProperties[MARKDOWN_RUN_END_ATTRIBUTE] = "true"
	}

export {
	MARKDOWN_RUN_ATTRIBUTE,
	MARKDOWN_RUN_END_ATTRIBUTE,
	type MarkdownRun,
	remarkRuns,
	runPiecesOf,
}
