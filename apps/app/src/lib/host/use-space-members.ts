import { useQuery } from "@tanstack/react-query"

import { hostQueryKeys } from "./host-query-keys"
import { membersQueryOf, NO_MEMBERS } from "./members-query"

import { HOSTING_MEMBERS_CHANGED_EVENT, type Member } from "../bindings"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"

export const useSpaceMembers = (spaceId: string | undefined): Member[] => {
	const { data: members = NO_MEMBERS } = useQuery(membersQueryOf(spaceId))
	useInvalidateOnHostEvent(HOSTING_MEMBERS_CHANGED_EVENT, [
		hostQueryKeys.members(),
	])
	return members
}
