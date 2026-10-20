import type { InfiniteData } from "@tanstack/react-query"

import type {
	Bot,
	Conversation,
	ConversationInPage,
	ConversationPage,
	StoredLastWord,
} from "../conversations/store-contract"
import type { LastWord } from "../conversations/transcript-state"

export const ROSTER_PAGE_SIZE = 30

export type RosterRead = {
	bots: Bot[]
	conversations: Conversation[]
}

export type LastWords = {
	companions: Record<string, LastWord>
	conversations: Record<string, LastWord>
}

export type SoloBotIds = Record<string, string>

export type RosterPage = RosterRead & {
	lastWords: LastWords
	soloBotIds: SoloBotIds
	nextCursor: string | null
}

export const NO_LAST_WORDS: LastWords = { companions: {}, conversations: {} }

export const NO_SOLO_BOT_IDS: SoloBotIds = {}

export type RosterPages = InfiniteData<RosterPage>

export const topicsIn = ({
	pinned,
	conversations,
}: ConversationPage): Conversation[] =>
	[...pinned, ...conversations].filter(({ soloBotId }) => soloBotId === null)

export const cursorAfter = ({ nextCursor }: RosterPage) => nextCursor

const lastWordOf = ({
	text,
	at,
	authorBotId,
	authorAccountId,
	authorName,
	writtenFrom,
}: StoredLastWord): LastWord => ({
	text: text?.trim() || undefined,
	at,
	authorBotId: authorBotId ?? undefined,
	person:
		authorBotId === null
			? { authorAccountId, authorName, writtenFrom }
			: undefined,
})

const wordsOf = (
	rows: ConversationInPage[],
	keyOf: (row: ConversationInPage) => string | null,
): Record<string, LastWord> =>
	Object.fromEntries(
		rows.flatMap((row) => {
			const key = keyOf(row)
			return key === null || row.lastWord === null
				? []
				: [[key, lastWordOf(row.lastWord)]]
		}),
	)

export const lastWordsIn = ({
	pinned,
	conversations,
}: ConversationPage): LastWords => {
	const rows = [...pinned, ...conversations]
	return {
		companions: wordsOf(rows, ({ soloBotId }) => soloBotId),
		conversations: wordsOf(rows, ({ id, soloBotId }) =>
			soloBotId === null ? id : null,
		),
	}
}

const withWordsOf = (held: LastWords, fresh: LastWords): LastWords => ({
	companions: { ...held.companions, ...fresh.companions },
	conversations: { ...held.conversations, ...fresh.conversations },
})

export const lastWordsOf = ({ pages }: RosterPages): LastWords =>
	pages
		.map(({ lastWords }) => lastWords)
		.reduceRight(withWordsOf, NO_LAST_WORDS)

export const soloBotIdsIn = ({
	pinned,
	conversations,
}: ConversationPage): SoloBotIds =>
	Object.fromEntries(
		[...pinned, ...conversations].flatMap(({ id, soloBotId }) =>
			soloBotId === null ? [] : [[id, soloBotId]],
		),
	)

export const soloBotIdsOf = ({ pages }: RosterPages): SoloBotIds =>
	Object.assign({}, ...pages.map(({ soloBotIds }) => soloBotIds))

const withoutRepeats = (conversations: Conversation[]): Conversation[] => {
	const seenIds = new Set<string>()
	return conversations.filter(({ id }) => {
		const isRepeat = seenIds.has(id)
		seenIds.add(id)
		return !isRepeat
	})
}

export const rosterReadOf = ({ pages }: RosterPages): RosterRead => ({
	bots: pages[0].bots,
	conversations: withoutRepeats(
		pages.flatMap(({ conversations }) => conversations),
	),
})

const restatedIn = (
	conversations: Conversation[],
	held: Map<string, Conversation>,
): Conversation[] => conversations.flatMap(({ id }) => held.get(id) ?? [])

const arrivalsIn = (pages: RosterPage[], read: RosterRead) => {
	const pagedIds = new Set(
		pages.flatMap(({ conversations }) => conversations.map(({ id }) => id)),
	)
	return read.conversations.filter(({ id }) => !pagedIds.has(id))
}

export const withHeldRead = (
	paged: RosterPages | undefined,
	read: RosterRead,
): RosterPages => {
	if (paged === undefined) {
		return {
			pages: [
				{
					...read,
					lastWords: NO_LAST_WORDS,
					soloBotIds: NO_SOLO_BOT_IDS,
					nextCursor: null,
				},
			],
			pageParams: [null],
		}
	}
	const [head, ...laterPages] = paged.pages
	const held = new Map(read.conversations.map((row) => [row.id, row]))
	return {
		pageParams: paged.pageParams,
		pages: [
			{
				...head,
				bots: read.bots,
				conversations: [
					...arrivalsIn(paged.pages, read),
					...restatedIn(head.conversations, held),
				],
			},
			...laterPages.map((page) => ({
				...page,
				conversations: restatedIn(page.conversations, held),
			})),
		],
	}
}

const pushedOutOf = (
	heldHead: RosterPage,
	head: RosterPage,
	isInHead: (conversation: Conversation) => boolean,
): Conversation[] => {
	const lastStillInHead = heldHead.conversations.findLastIndex(isInHead)
	return head.nextCursor === null || lastStillInHead === -1
		? []
		: heldHead.conversations.slice(lastStillInHead + 1)
}

export const withFreshHead = (
	paged: RosterPages,
	head: RosterPage,
): RosterPages => {
	const [heldHead, ...laterPages] = paged.pages
	const headIds = new Set(head.conversations.map(({ id }) => id))
	const isInHead = ({ id }: Conversation) => headIds.has(id)
	return {
		pageParams: paged.pageParams,
		pages: [
			{
				...head,
				conversations: [
					...head.conversations,
					...pushedOutOf(heldHead, head, isInHead),
				],
				lastWords: withWordsOf(heldHead.lastWords, head.lastWords),
				soloBotIds: { ...heldHead.soloBotIds, ...head.soloBotIds },
			},
			...laterPages.map((page) => ({
				...page,
				conversations: page.conversations.filter(
					(conversation) => !isInHead(conversation),
				),
			})),
		],
	}
}

const withoutConversation = (conversations: Conversation[], id: string) =>
	conversations.filter((conversation) => conversation.id !== id)

const lastWordsOfRow = (row: ConversationInPage) =>
	lastWordsIn({ pinned: [], conversations: [row], nextCursor: null })

export const withPageRow = (
	paged: RosterPages,
	row: ConversationInPage,
): RosterPages => {
	const [head, ...laterPages] = paged.pages
	const lastWords = withWordsOf(head.lastWords, lastWordsOfRow(row))
	if (row.soloBotId !== null) {
		const soloBotIds = { ...head.soloBotIds, [row.id]: row.soloBotId }
		return {
			...paged,
			pages: [{ ...head, lastWords, soloBotIds }, ...laterPages],
		}
	}
	return {
		pageParams: paged.pageParams,
		pages: [
			{
				...head,
				conversations: [
					row,
					...withoutConversation(head.conversations, row.id),
				],
				lastWords,
			},
			...laterPages.map((page) => ({
				...page,
				conversations: withoutConversation(page.conversations, row.id),
			})),
		],
	}
}
