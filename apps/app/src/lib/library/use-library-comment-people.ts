import { skipToken, useQuery } from "@tanstack/react-query"
import { useContext, useMemo } from "react"

import type {
	LibraryCommentAgent,
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
import { workingAgentOf } from "./library-comment-views"
import { useLibraryCommentAgentTurns } from "./use-library-comment-agent-turns"

import {
	HOSTING_MEMBERS_CHANGED_EVENT,
	LIBRARY_COMMENT_HOST_AUTHOR_ID,
	type LibraryCommentParty,
	type LibraryCommentThread,
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
	workingAgentOf: (
		thread: LibraryCommentThread,
	) => LibraryCommentAgent | undefined
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
	const workingTurns = useLibraryCommentAgentTurns(spaceId, bots)

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
		const agents = agentsOf(bots)
		const participants = [...agents, ...people]
		return {
			self:
				people.find(({ id }) => id === ownId) ?? personNamed(ownId, ownName),
			participants,
			authorOf: (party) => authorAmong(participants, party, unnamed),
			workingAgentOf: (thread) => workingAgentOf(thread, workingTurns, agents),
		}
	}, [accountId, host, hostedMembers, workingTurns, bots, viewerName, unnamed])
}
