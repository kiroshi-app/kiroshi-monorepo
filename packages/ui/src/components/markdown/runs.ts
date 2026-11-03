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

const cutsOf = (node: MdastNode, runs: MarkdownRun[]): Cut[] => {
	const value = node.value ?? ""
	const from = node.position?.start.offset
	const to = node.position?.end.offset
	if (from === undefined || to === undefined) return []
	const isVerbatim = to - from === value.length

	return runs
		.filter((run) => run.start < to && run.end > from)
		.map((run) =>
			isVerbatim
				? {
						from: Math.max(run.start, from) - from,
						to: Math.min(run.end, to) - from,
						id: run.id,
					}
				: { from: 0, to: value.length, id: run.id },
		)
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
	({ runs }: RemarkRunsOptions) =>
	(tree: MdastNode) => {
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
