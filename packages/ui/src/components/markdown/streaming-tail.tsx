interface HastNode {
	type: string
	tagName?: string
	value?: string
	properties?: Record<string, unknown>
	children?: HastNode[]
}

type MarkdownStreamingTailProps = {
	firstWordAt: number
	lastWordStep: number
	children: string
}

const STREAMING_TAIL_FIRST_WORD_PROPERTY = "dataStreamingTailFirstWord"

const STREAMING_TAIL_LAST_STEP_PROPERTY = "dataStreamingTailLastStep"

const SOFTEST_STEP = 3

const WORDS_KEPT_MOUNTED = SOFTEST_STEP + 1

const WORD = /\S+/g

const WORD_GAP = /(\s+)/

const INLINE_PROSE = new Set(["strong", "em", "del", "a"])

const PROSE_CONTAINERS = new Set([
	"p",
	"li",
	"ul",
	"ol",
	"blockquote",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"table",
	"thead",
	"tbody",
	"tr",
	"td",
	"th",
])

const isInlineProse = (node: HastNode) =>
	node.type === "element" && INLINE_PROSE.has(node.tagName ?? "")

const closesNoLine = (node: HastNode) =>
	(node.type === "text" && (node.value ?? "").trim() === "") ||
	(node.type === "element" && node.tagName === "section")

const lastTextLineOf = (node: HastNode): HastNode | undefined => {
	const last = node.children?.findLast((child) => !closesNoLine(child))
	if (!last) return undefined
	if (last.type === "text" || isInlineProse(last)) return node
	return last.type === "element" && PROSE_CONTAINERS.has(last.tagName ?? "")
		? lastTextLineOf(last)
		: undefined
}

const textOf = (value: string): HastNode[] =>
	value ? [{ type: "text", value }] : []

const tailOf = (text: string, wordsLeft: number): HastNode[] | undefined => {
	const words = Array.from(text.matchAll(WORD))
	const last = words.at(-1)
	if (!last) return undefined
	const firstWordAt = Math.max(0, words.length - wordsLeft)
	const from = words[firstWordAt].index
	const to = last.index + last[0].length

	return [
		...textOf(text.slice(0, from)),
		{
			type: "element",
			tagName: "span",
			properties: {
				[STREAMING_TAIL_FIRST_WORD_PROPERTY]: firstWordAt,
				[STREAMING_TAIL_LAST_STEP_PROPERTY]: Math.max(
					0,
					wordsLeft - (WORDS_KEPT_MOUNTED - SOFTEST_STEP),
				),
			},
			children: [{ type: "text", value: text.slice(from, to) }],
		},
		...textOf(text.slice(to)),
	]
}

const markTail = (line: HastNode, wordsLeft: number): number => {
	const children = line.children ?? []
	let left = wordsLeft

	for (let at = children.length - 1; at >= 0 && left > 0; at--) {
		const child = children[at]
		if (isInlineProse(child)) {
			left = markTail(child, left)
			continue
		}
		if (child.type !== "text") return 0
		const text = child.value ?? ""
		const tail = tailOf(text, left)
		if (!tail) continue
		children.splice(at, 1, ...tail)
		left -= Math.min(left, text.match(WORD)?.length ?? 0)
	}

	return left
}

const rehypeStreamingTail = () => (tree: HastNode) => {
	const line = lastTextLineOf(tree)
	if (line) markTail(line, WORDS_KEPT_MOUNTED)
}

const STREAMING_WORD_CLASS =
	"transition-[filter,opacity] duration-200 ease-out motion-reduce:transition-none data-[step=1]:opacity-75 data-[step=1]:blur-[1px] data-[step=2]:opacity-55 data-[step=2]:blur-[2.5px] data-[step=3]:opacity-30 data-[step=3]:blur-[4px]"

const MarkdownStreamingTail = ({
	firstWordAt,
	lastWordStep,
	children,
}: MarkdownStreamingTailProps) => {
	const pieces = children.split(WORD_GAP)
	const lastWordAt = (pieces.length - 1) / 2

	return pieces.map((piece, at) => {
		if (at % 2 === 1) return piece
		const wordAt = at / 2

		return (
			<span
				key={firstWordAt + wordAt}
				data-slot="markdown-streaming-word"
				data-step={Math.max(0, lastWordStep - (lastWordAt - wordAt))}
				className={STREAMING_WORD_CLASS}
			>
				{piece}
			</span>
		)
	})
}

export {
	MarkdownStreamingTail,
	rehypeStreamingTail,
	STREAMING_TAIL_FIRST_WORD_PROPERTY,
	STREAMING_TAIL_LAST_STEP_PROPERTY,
}
