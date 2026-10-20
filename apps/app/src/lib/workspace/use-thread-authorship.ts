import { useMemo } from "react"

import type { WorkspaceCore } from "./use-workspace-core"

import { signedInAccountIdOf } from "../account/use-account"
import {
	HOSTED_HERE,
	type SpaceHost,
	type ThreadAuthorship,
} from "../chat/thread-authorship"
import { NO_JOINED_MEMBERS } from "../spaces/joined-space-members"
import { openJoinedSpaceOf } from "../spaces/joined-spaces-controller"
import { useJoinedSpaceMembers } from "../spaces/use-joined-space-members"

export const useThreadAuthorship = ({
	account,
	joinedSpaces,
	spaces,
}: WorkspaceCore): ThreadAuthorship => {
	const accountId = signedInAccountIdOf(account.state)
	const { joinedSpaces: joined, openId } = joinedSpaces.state
	const { selectedSpaceId } = spaces.state
	const open = openJoinedSpaceOf(joined, openId, selectedSpaceId)
	const [members = NO_JOINED_MEMBERS] = useJoinedSpaceMembers(
		open ? [open.id] : [],
	)

	return useMemo(() => {
		const host: SpaceHost = open ? { kind: "joined", members } : HOSTED_HERE
		return { accountId, host }
	}, [accountId, open, members])
}
