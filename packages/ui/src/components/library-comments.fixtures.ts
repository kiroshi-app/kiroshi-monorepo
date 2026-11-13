import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import type {
	LibraryCommentAgent,
	LibraryCommentAuthor,
	LibraryCommentPerson,
} from "@workspace/ui/components/library-comment-author"
import type { LibraryComment } from "@workspace/ui/components/library-comment-thread"
import type {
	LibraryCommentSummary,
	LibraryCommentsCounts,
} from "@workspace/ui/components/library-comments-list"
import type { LibraryBlockPassage } from "@workspace/ui/components/library-document-blocks"
import type { LibraryDocumentThread } from "@workspace/ui/components/library-document-comments"

const STEVE: LibraryCommentPerson = {
	kind: "person",
	id: "steve",
	name: "Steve",
}

const LENA: LibraryCommentPerson = {
	kind: "person",
	id: "lena",
	name: "Lena Ortiz",
}

const MARTA: LibraryCommentPerson = {
	kind: "person",
	id: "marta",
	name: "Marta Silva",
}

const ATLAS: LibraryCommentAgent = {
	kind: "agent",
	id: "atlas",
	name: "Atlas",
	title: "Planner",
	blot: BLOT_HUES.green,
}

const JUNIPER: LibraryCommentAgent = {
	kind: "agent",
	id: "juniper",
	name: "Juniper",
	title: "Writer",
	blot: BLOT_HUES.pink,
}

const LONG_NAMED_PERSON: LibraryCommentPerson = {
	kind: "person",
	id: "long-person",
	name: "Maximiliana Wolfeschlegelsteinhausenbergerdorff of the Lisbon office",
}

const LONG_NAMED_AGENT: LibraryCommentAgent = {
	kind: "agent",
	id: "long-agent",
	name: "Supercalifragilisticexpialidocious",
	title: "Itinerary and reservations coordinator",
	blot: BLOT_HUES.orange,
}

const COMMENT_PARTICIPANTS: LibraryCommentAuthor[] = [
	ATLAS,
	JUNIPER,
	LENA,
	MARTA,
]

const PASSAGE_ANCHOR = "On “so the second session stops at 16:30.”"

const FIRST_COMMENT: LibraryComment = {
	id: "comment-1",
	author: STEVE,
	time: "10 min",
	body: "Can we push the boat to 17:30? @Atlas ask the captain.",
}

const MEMBER_REPLY: LibraryComment = {
	id: "comment-2",
	author: LENA,
	time: "6 min",
	body: "Fine by me if dinner moves to 20:30.",
}

const AGENT_REPLY: LibraryComment = {
	id: "comment-3",
	author: ATLAS,
	time: "2 min",
	body: "The captain can leave at 17:45, not later. 17:30 works if we're on the dock by 17:20.",
}

const UNBREAKABLE = "https://kiroshi.app/library/".concat("offsite-".repeat(18))

const LONG_COMMENT: LibraryComment = {
	id: "comment-long",
	author: LONG_NAMED_PERSON,
	time: "Yesterday at 23:59",
	body: `${UNBREAKABLE} The second session always runs late, so the boat has to wait for us. If the captain cannot move, we shorten the session, skip the recap and walk to the dock together. @${LONG_NAMED_AGENT.name} please check the tide table too.`,
}

const COMMENT_COUNTS: LibraryCommentsCounts = { open: 3, resolved: 4 }

const RESOLVED_THREADS: LibraryCommentSummary[] = [
	{
		id: "thread-boat",
		author: STEVE,
		replyCount: 3,
		date: "Today",
		comment: "Can we push the boat to 17:30?",
		anchor: PASSAGE_ANCHOR,
	},
	{
		id: "thread-terrace",
		author: LENA,
		replyCount: 1,
		date: "Yesterday",
		comment: "Is the terrace covered if it rains?",
		anchor: "On the first paragraph",
	},
	{
		id: "thread-flights",
		author: ATLAS,
		replyCount: 0,
		date: "Nov 10",
		comment: "Flights went from 4 to 6 people, budget updated.",
		anchor: "On “6,480 euros”",
	},
	{
		id: "thread-vans",
		author: MARTA,
		replyCount: 0,
		date: "Nov 8",
		comment: "Who books the vans from the airport?",
		anchor: { gone: "text" },
	},
]

const OPEN_THREADS: LibraryCommentSummary[] = [
	{
		id: "thread-dinner",
		author: LENA,
		replyCount: 2,
		date: "Today",
		comment: "Dinner at 20:00 is tight if the boat is late.",
		anchor: "On “dinner on the terrace at 20:00”",
	},
	{
		id: "thread-market",
		author: JUNIPER,
		replyCount: 0,
		date: "Today",
		comment: "I drafted two options for Saturday morning.",
		anchor: "On this paragraph",
	},
	{
		id: "thread-budget",
		author: STEVE,
		replyCount: 1,
		date: "Yesterday",
		comment: "Does this include the boat?",
		anchor: "On “6,480 euros”",
	},
]

const SESSION_PARAGRAPH =
	"We open with the roadmap review at 14:00, so the second session stops at 16:30. The boat leaves the dock right after, and we are back for dinner on the terrace at 20:00."

const MARKET_PARAGRAPH =
	"Saturday morning is free: the market in the old town, or a swim before the train."

const BUDGET_PARAGRAPH =
	"The house, the boat and the meals come to 6,480 euros for the eight of us."

const SESSION_BLOCK = "boat01"

const MARKET_BLOCK = "market"

const BUDGET_BLOCK = "money1"

const SESSION_PASSAGE = "so the second session stops at 16:30."

const DINNER_PASSAGE = "dinner on the terrace at 20:00"

const passageIn = (source: string, text: string): LibraryBlockPassage => {
	const start = source.indexOf(text)
	return { start, end: start + text.length, text }
}

const OFFSITE_DOCUMENT = {
	title: "Team offsite",
	detail: "74 words · Edited today at 10:41",
	body: [
		"The offsite runs from Thursday to Saturday at the house above the harbour. ^intro1",
		"## Thursday ^thursd",
		`${SESSION_PARAGRAPH} ^${SESSION_BLOCK}`,
		"## Saturday ^saturd",
		`${MARKET_PARAGRAPH} ^${MARKET_BLOCK}`,
		"## Budget ^budget",
		`${BUDGET_PARAGRAPH} ^${BUDGET_BLOCK}`,
	].join("\n\n"),
}

const SESSION_THREAD: LibraryDocumentThread = {
	id: "thread-boat",
	anchor: {
		blockId: SESSION_BLOCK,
		passage: passageIn(SESSION_PARAGRAPH, SESSION_PASSAGE),
	},
	comments: [FIRST_COMMENT, MEMBER_REPLY, AGENT_REPLY],
}

const MARKET_THREAD: LibraryDocumentThread = {
	id: "thread-market",
	anchor: { blockId: MARKET_BLOCK },
	comments: [
		{
			id: "comment-market",
			author: JUNIPER,
			time: "1 h",
			body: "I drafted two options for Saturday morning.",
		},
	],
}

const BUDGET_THREAD: LibraryDocumentThread = {
	id: "thread-budget",
	anchor: {
		blockId: BUDGET_BLOCK,
		passage: passageIn(BUDGET_PARAGRAPH, "6,480 euros"),
	},
	comments: [
		{
			id: "comment-budget",
			author: LENA,
			time: "Yesterday",
			body: "Does this include the boat?",
		},
	],
}

const DOCUMENT_THREADS = [SESSION_THREAD, MARKET_THREAD, BUDGET_THREAD]

export {
	AGENT_REPLY,
	ATLAS,
	COMMENT_COUNTS,
	COMMENT_PARTICIPANTS,
	DINNER_PASSAGE,
	DOCUMENT_THREADS,
	FIRST_COMMENT,
	JUNIPER,
	LENA,
	LONG_COMMENT,
	LONG_NAMED_AGENT,
	LONG_NAMED_PERSON,
	MARKET_BLOCK,
	MARKET_PARAGRAPH,
	MARKET_THREAD,
	MARTA,
	MEMBER_REPLY,
	OFFSITE_DOCUMENT,
	OPEN_THREADS,
	PASSAGE_ANCHOR,
	passageIn,
	RESOLVED_THREADS,
	SESSION_BLOCK,
	SESSION_PARAGRAPH,
	SESSION_PASSAGE,
	SESSION_THREAD,
	STEVE,
	UNBREAKABLE,
}
