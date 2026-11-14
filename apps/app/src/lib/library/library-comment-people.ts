import type {
	LibraryCommentAgent,
	LibraryCommentAuthor,
	LibraryCommentPerson,
} from "@workspace/ui/components/library-comment-author"
import { mentionRunsOf } from "@workspace/ui/components/library-comment-mentions"

import {
	type JoinedSpaceMember,
	LIBRARY_COMMENT_HOST_AUTHOR_ID,
	type LibraryCommentParty,
	type Member,
} from "../bindings"
import type { Bot } from "../conversations/store-contract"
import { avatarSrc } from "../host/index"
import { memberNameOf } from "../host/member-names"

const MENTION_TRIGGER_LENGTH = 1

export const agentsOf = (bots: Bot[]): LibraryCommentAgent[] =>
	bots.map((bot) => ({
		kind: "agent",
		id: bot.id,
		name: bot.name,
		blot: bot.avatarBlot,
		image: avatarSrc(bot.avatarImagePath),
	}))

export const personNamed = (
	id: string,
	name: string,
): LibraryCommentPerson => ({
	kind: "person",
	id,
	name,
})

const isFirstOfItsId = (
	person: LibraryCommentPerson,
	index: number,
	people: LibraryCommentPerson[],
) => people.findIndex(({ id }) => id === person.id) === index

export const hostedPeopleOf = (
	host: LibraryCommentPerson,
	members: Member[],
	unnamed: string,
): LibraryCommentPerson[] => [
	host,
	...members
		.filter(({ status }) => status === "joined")
		.map((member) => personNamed(member.userId, member.name || unnamed)),
]

export const joinedPeopleOf = (
	members: readonly JoinedSpaceMember[],
	unnamed: string,
): LibraryCommentPerson[] =>
	members
		.map((member) =>
			personNamed(
				member.role === "host" ? LIBRARY_COMMENT_HOST_AUTHOR_ID : member.userId,
				memberNameOf(member, unnamed),
			),
		)
		.filter(isFirstOfItsId)

export const partyOf = ({
	kind,
	id,
}: LibraryCommentAuthor): LibraryCommentParty => ({ kind, id })

export const authorAmong = (
	participants: LibraryCommentAuthor[],
	{ kind, id }: LibraryCommentParty,
	unnamed: string,
): LibraryCommentAuthor =>
	participants.find((each) => each.kind === kind && each.id === id) ?? {
		kind,
		id,
		name: unnamed,
	}

export const mentionsIn = (
	text: string,
	participants: LibraryCommentAuthor[],
): LibraryCommentParty[] => {
	const mentionedNames = new Set(
		mentionRunsOf(
			text,
			participants.map(({ name }) => name),
		)
			.filter(({ isMention }) => isMention)
			.map((run) => run.text.slice(MENTION_TRIGGER_LENGTH)),
	)
	return participants
		.filter(({ name }) => mentionedNames.has(name))
		.map(partyOf)
}
