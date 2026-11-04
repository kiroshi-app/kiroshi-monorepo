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

const runNodeOf = (id: string, value: string): MdastNode => ({
	type: "markdownRun",
	data: { hName: "span", hProperties: { [MARKDOWN_RUN_ATTRIBUTE]: id } },
	children: [{ type: "text", value }],
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

const cutsOf = (node: MdastNode, runs: MarkdownRun[]): Cut[] => {
	const value = node.value ?? ""
	const from = node.position?.start.offset
	const to = node.position?.end.offset
	if (from === undefined || to === undefined) return []
	const isVerbatim = to - from === value.length

	return runs
		.filter((run) =>
			isCaret(run)
				? from <= run.start && run.start <= to
				: run.start < to && run.end > from,
		)
		.map((run) => {
			if (isVerbatim)
				return {
					from: Math.max(run.start, from) - from,
					to: Math.min(run.end, to) - from,
					id: run.id,
				}
			const start = isCaret(run) ? value.length : 0
			return { from: start, to: value.length, id: run.id }
		})
		.sort((left, right) => left.from - right.from)
}

const splitRuns = (node: MdastNode, runs: MarkdownRun[]) => {
	const value = node.value ?? ""
	const cuts = cutsOf(node, runs)
	if (cuts.length === 0) return null

	const parts: MdastNode[] = []
	let read = 0
	for (const cut of cuts) {
		if (cut.from < read) continue
		if (cut.from > read)
			parts.push({ type: "text", value: value.slice(read, cut.from) })
		parts.push(runNodeOf(cut.id, value.slice(cut.from, cut.to)))
		read = cut.to
	}
	if (read < value.length)
		parts.push({ type: "text", value: value.slice(read) })

	return parts
}

const remarkRuns =
	({ runs: received }: RemarkRunsOptions) =>
	(tree: MdastNode) => {
		const runs = caretsSnappedToText(received, tree)
		const lastPieces = new Map<string, MdastNode>()

		const rewrite = (node: MdastNode) => {
			if (!node.children) return

			node.children = node.children.flatMap((child) =>
				child.type === "text" ? (splitRuns(child, runs) ?? child) : child,
			)

			for (const child of node.children) {
				if (child.type === "markdownRun") {
					lastPieces.set(
						String(child.data?.hProperties?.[MARKDOWN_RUN_ATTRIBUTE]),
						child,
					)
					continue
				}
				rewrite(child)
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
}
