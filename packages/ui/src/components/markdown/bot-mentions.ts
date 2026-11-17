interface MdastNode {
	type: string
	value?: string
	children?: MdastNode[]
	position?: { start: { offset?: number }; end: { offset?: number } }
	data?: { hName?: string; hProperties?: Record<string, unknown> }
}

const MENTION = /<@([\w-]+)>/g

const BOT_MENTION_ATTRIBUTE = "data-bot-mention"

const BOT_MENTION_COUNT_ATTRIBUTE = "data-bot-mention-count"

const mentionOf = (id: string): MdastNode => ({
	type: "botMention",
	data: {
		hName: "span",
		hProperties: {
			[BOT_MENTION_ATTRIBUTE]: id,
			[BOT_MENTION_COUNT_ATTRIBUTE]: 1,
		},
	},
	children: [],
})

const textOf = (value: string, from?: number): MdastNode => ({
	type: "text",
	value,
	...(from !== undefined && {
		position: { start: { offset: from }, end: { offset: from + value.length } },
	}),
})

const verbatimStartOf = ({ value = "", position }: MdastNode) => {
	const from = position?.start.offset
	const to = position?.end.offset
	return from !== undefined && to !== undefined && to - from === value.length
		? from
		: undefined
}

const repeatedProperties = (
	node: MdastNode | undefined,
	id: string,
	gap: string,
) => {
	const properties =
		node?.type === "botMention" ? node.data?.hProperties : undefined

	if (!properties || gap.trim() !== "") return undefined

	return properties[BOT_MENTION_ATTRIBUTE] === id ? properties : undefined
}

const splitMentions = (value: string, from?: number) => {
	const parts: MdastNode[] = []
	let read = 0

	const textFrom = (start: number, end?: number) =>
		textOf(value.slice(start, end), from === undefined ? from : from + start)

	for (const match of value.matchAll(MENTION)) {
		const at = match.index ?? 0
		const gapStart = read
		const gap = value.slice(read, at)
		read = at + match[0].length

		const repeated = repeatedProperties(parts.at(-1), match[1], gap)

		if (repeated) {
			repeated[BOT_MENTION_COUNT_ATTRIBUTE] =
				Number(repeated[BOT_MENTION_COUNT_ATTRIBUTE]) + 1
			continue
		}

		if (gap) parts.push(textFrom(gapStart, at))
		parts.push(mentionOf(match[1]))
	}

	if (parts.length === 0) return null
	if (read < value.length) parts.push(textFrom(read))

	return parts
}

const isText = ({ type, value }: MdastNode) =>
	type === "text" && typeof value === "string"

export const remarkBotMentions = () => (tree: MdastNode) => {
	const rewrite = (node: MdastNode) => {
		if (!node.children) return

		node.children = node.children.flatMap((child) =>
			isText(child)
				? (splitMentions(child.value ?? "", verbatimStartOf(child)) ?? child)
				: child,
		)

		for (const child of node.children) rewrite(child)
	}

	rewrite(tree)
}

export {
	BOT_MENTION_ATTRIBUTE,
	BOT_MENTION_COUNT_ATTRIBUTE,
	MENTION as BOT_MENTION_PATTERN,
}
