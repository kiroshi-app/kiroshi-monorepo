import type { InfiniteData } from "@tanstack/react-query"

import type {
	Bot,
	Conversation,
	ConversationPage,
} from "../conversations/store-contract"

export const ROSTER_PAGE_SIZE = 30

export type RosterRead = {
	bots: Bot[]
	conversations: Conversation[]
}

export type RosterPage = RosterRead & {
	nextCursor: string | null
}

export type RosterPages = InfiniteData<RosterPage>

export const topicsIn = ({
	pinned,
	conversations,
}: ConversationPage): Conversation[] =>
	[...pinned, ...conversations].filter(({ soloBotId }) => soloBotId === null)

export const cursorAfter = ({ nextCursor }: RosterPage) => nextCursor

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
		return { pages: [{ ...read, nextCursor: null }], pageParams: [null] }
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
