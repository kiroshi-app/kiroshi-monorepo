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

export {
	AGENT_REPLY,
	ATLAS,
	COMMENT_COUNTS,
	COMMENT_PARTICIPANTS,
	FIRST_COMMENT,
	JUNIPER,
	LENA,
	LONG_COMMENT,
	LONG_NAMED_AGENT,
	LONG_NAMED_PERSON,
	MARTA,
	MEMBER_REPLY,
	OPEN_THREADS,
	PASSAGE_ANCHOR,
	RESOLVED_THREADS,
	STEVE,
	UNBREAKABLE,
}
