import { skipToken, useQuery } from "@tanstack/react-query"
import { useContext, useMemo } from "react"

import type {
	LibraryCommentAuthor,
	LibraryCommentPerson,
} from "@workspace/ui/components/library-comment-author"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import {
	agentsOf,
	authorAmong,
	hostedPeopleOf,
	joinedPeopleOf,
	personNamed,
} from "./library-comment-people"

import {
	HOSTING_MEMBERS_CHANGED_EVENT,
	LIBRARY_COMMENT_HOST_AUTHOR_ID,
	type LibraryCommentParty,
	type Member,
} from "../bindings"
import { ThreadAuthorshipContext } from "../chat/thread-authorship"
import type { Bot } from "../conversations/store-contract"
import { hostQueryKeys } from "../host/host-query-keys"
import { readMembers } from "../host/member-actions"
import { membersTransport } from "../host/members-transport"
import { useHostingStates } from "../host/use-hosting-states"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"
import { membersReadFailure } from "../spaces/joined-space-members"

type LibraryCommentPeopleInput = {
	spaceId: string
	bots: Bot[]
	viewerName: string
}

export type LibraryCommentPeople = {
	self: LibraryCommentPerson
	participants: LibraryCommentAuthor[]
	authorOf: (party: LibraryCommentParty) => LibraryCommentAuthor
}

const NO_MEMBERS: Member[] = []

const useHostedMembers = (spaceId: string, isHostedHere: boolean) => {
	const hosting = useHostingStates(isHostedHere ? [spaceId] : [])
	const isShared = hosting[spaceId]?.kind === "online"
	const { data: members = NO_MEMBERS } = useQuery({
		queryKey: hostQueryKeys.membersOf(spaceId),
		queryFn: isShared
			? () => readMembers(membersTransport, spaceId)
			: skipToken,
		meta: {
			failureNotice: membersReadFailure,
			raisedIn: "use-library-comment-people",
		},
	})
	useInvalidateOnHostEvent(HOSTING_MEMBERS_CHANGED_EVENT, [
		hostQueryKeys.members(),
	])
	return members
}

export const useLibraryCommentPeople = ({
	spaceId,
	bots,
	viewerName,
}: LibraryCommentPeopleInput): LibraryCommentPeople => {
	const { accountId, host } = useContext(ThreadAuthorshipContext)
	const unnamed = useChatCopy()("working.name")
	const hostedMembers = useHostedMembers(spaceId, host.kind === "hosted")

	return useMemo(() => {
		const ownName = viewerName || unnamed
		const people =
			host.kind === "joined"
				? joinedPeopleOf(host.members, unnamed)
				: hostedPeopleOf(
						personNamed(LIBRARY_COMMENT_HOST_AUTHOR_ID, ownName),
						hostedMembers,
						unnamed,
					)
		const ownId =
			host.kind === "joined" && accountId
				? accountId
				: LIBRARY_COMMENT_HOST_AUTHOR_ID
		const participants = [...agentsOf(bots), ...people]
		return {
			self:
				people.find(({ id }) => id === ownId) ?? personNamed(ownId, ownName),
			participants,
			authorOf: (party) => authorAmong(participants, party, unnamed),
		}
	}, [accountId, host, hostedMembers, bots, viewerName, unnamed])
}
