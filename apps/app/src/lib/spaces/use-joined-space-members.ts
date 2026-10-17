import { useQueries } from "@tanstack/react-query"

import {
	joinedSpaceMembersQueryOf,
	NO_JOINED_MEMBERS,
} from "./joined-space-members"
import { spaceQueryKeys } from "./space-query-keys"

import {
	JOINED_SPACE_MEMBERS_CHANGED_EVENT,
	type JoinedSpaceMember,
} from "../bindings"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"

const membersOfEach = (reads: { data?: JoinedSpaceMember[] }[]) =>
	reads.map(({ data }) => data ?? NO_JOINED_MEMBERS)

export const useJoinedSpaceMembers = (
	joinedIds: readonly string[],
): JoinedSpaceMember[][] => {
	const members = useQueries({
		queries: joinedIds.map(joinedSpaceMembersQueryOf),
		combine: membersOfEach,
	})
	useInvalidateOnHostEvent(JOINED_SPACE_MEMBERS_CHANGED_EVENT, [
		spaceQueryKeys.joinedMembers(),
	])
	return members
}
