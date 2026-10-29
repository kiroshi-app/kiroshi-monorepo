import type {
	AppSidebarBot,
	AppSidebarConversation,
	AppSidebarRowMission,
	AppSidebarSection,
	RosterPin,
} from "@workspace/ui/components/app-sidebar-model"

interface RosterRow {
	id: string
	sectionId?: string | null
	pinPosition?: number | null
}

const sectionOf = (held: RosterRow, known: Set<string>) =>
	held.sectionId && known.has(held.sectionId) ? held.sectionId : null

const pinOf = (held: RosterRow) => held.pinPosition ?? null

const SORTED_ZONE = "__sorted__"

const PINNED_ZONE = "__pinned__"

const SORTED = "sorted"

type Landing = typeof SORTED | { at: number; holder: string | null }

interface PinnedEntry {
	id: string
	sectionId: string | null
	rank: number
	section?: AppSidebarSection
	bot?: AppSidebarBot
	conversation?: AppSidebarConversation
}

const byRank = (one: PinnedEntry, other: PinnedEntry) => one.rank - other.rank

const NO_ACTIVITY = -1

const activityOf = ({ bot, conversation }: PinnedEntry) =>
	bot?.lastActivityAt ?? conversation?.lastActivityAt ?? NO_ACTIVITY

const byMostRecent = (one: PinnedEntry, other: PinnedEntry) =>
	activityOf(other) - activityOf(one)

const hasWaitingMission = (missions: AppSidebarRowMission[] | undefined) =>
	missions?.some(({ state }) => state === "waiting") ?? false

const isWaitingOnReader = ({ bot, conversation }: PinnedEntry) =>
	hasWaitingMission(bot?.missions) || hasWaitingMission(conversation?.missions)

const waitingFirst = (entries: PinnedEntry[]) => [
	...entries.filter(isWaitingOnReader),
	...entries.filter((entry) => !isWaitingOnReader(entry)),
]

const toPin = ({ id, sectionId }: PinnedEntry): RosterPin => ({ id, sectionId })

const botEntry = (
	bot: AppSidebarBot,
	sectionId: string | null = null,
): PinnedEntry => ({ id: bot.id, sectionId, rank: pinOf(bot) ?? 0, bot })

const conversationEntry = (
	conversation: AppSidebarConversation,
	sectionId: string | null = null,
): PinnedEntry => ({
	id: conversation.id,
	sectionId,
	rank: pinOf(conversation) ?? 0,
	conversation,
})

const inRuns = (entries: PinnedEntry[]) =>
	entries.reduce<PinnedEntry[][]>((runs, entry) => {
		const last = runs.at(-1)
		if (last && !entry.section && !last[0].section) last.push(entry)
		else runs.push([entry])
		return runs
	}, [])

const endOfSection = (entries: PinnedEntry[], sectionId: string) => {
	const head = entries.findIndex((entry) => entry.section?.id === sectionId)
	if (head < 0) return head
	let at = head + 1
	while (entries[at]?.sectionId === sectionId) at += 1
	return at
}

export {
	botEntry,
	byMostRecent,
	byRank,
	conversationEntry,
	endOfSection,
	inRuns,
	type Landing,
	PINNED_ZONE,
	type PinnedEntry,
	pinOf,
	type RosterRow,
	SORTED,
	SORTED_ZONE,
	sectionOf,
	toPin,
	waitingFirst,
}
