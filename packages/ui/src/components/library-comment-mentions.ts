const TRIGGER = "@"

const SPACE = /\s/

const NAME_END = "(?![\\p{L}\\p{N}_])"

type MentionQuery = { start: number; query: string }

type MentionEdit = { value: string; caret: number }

type MentionRun = { start: number; text: string; isMention: boolean }

const mentionQueryAt = (value: string, caret: number): MentionQuery | null => {
	const start = value.lastIndexOf(TRIGGER, caret - 1)
	if (start < 0 || caret <= start) return null

	const before = value[start - 1]
	if (before !== undefined && !SPACE.test(before)) return null

	const query = value.slice(start + 1, caret)

	return query.includes("\n") ? null : { start, query }
}

const withMention = (
	value: string,
	{ start, query }: MentionQuery,
	name: string,
): MentionEdit => {
	const head = `${value.slice(0, start)}${TRIGGER}${name}`
	const tail = value.slice(start + 1 + query.length)
	const gap = SPACE.test(tail[0] ?? "") ? "" : " "

	return { value: `${head}${gap}${tail}`, caret: head.length + 1 }
}

const withTrigger = (value: string, caret: number): MentionEdit => {
	const before = value[caret - 1]
	const gap = before === undefined || SPACE.test(before) ? "" : " "
	const head = `${value.slice(0, caret)}${gap}${TRIGGER}`

	return { value: `${head}${value.slice(caret)}`, caret: head.length }
}

const escaped = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const mentionRunsOf = (text: string, names: string[]): MentionRun[] => {
	const longestFirst = names
		.filter((name) => name.length > 0)
		.sort((one, other) => other.length - one.length)
	if (longestFirst.length === 0) return [{ start: 0, text, isMention: false }]

	const mention = new RegExp(
		`(?<=^|\\s)${TRIGGER}(?:${longestFirst.map(escaped).join("|")})${NAME_END}`,
		"gu",
	)
	const runs: MentionRun[] = []
	let cursor = 0

	for (const match of text.matchAll(mention)) {
		if (match.index > cursor)
			runs.push({
				start: cursor,
				text: text.slice(cursor, match.index),
				isMention: false,
			})
		runs.push({ start: match.index, text: match[0], isMention: true })
		cursor = match.index + match[0].length
	}

	if (cursor < text.length)
		runs.push({ start: cursor, text: text.slice(cursor), isMention: false })

	return runs
}

export {
	type MentionEdit,
	type MentionQuery,
	type MentionRun,
	mentionQueryAt,
	mentionRunsOf,
	withMention,
	withTrigger,
}
