import { useMemo } from "react"

import type { WorkspaceCore } from "./use-workspace-core"

import { storedOwnAccounts } from "../account/own-accounts"
import { signedInAccountIdOf } from "../account/use-account"
import type { SpaceHost, ThreadAuthorship } from "../chat/thread-authorship"
import { useSpaceMembers } from "../host/use-space-members"
import {
	isRelaySpace,
	openJoinedSpaceOf,
} from "../spaces/joined-spaces-controller"

export const useThreadAuthorship = ({
	account,
	joinedSpaces,
	spaces,
}: WorkspaceCore): ThreadAuthorship => {
	const accountId = signedInAccountIdOf(account.state)
	const { joinedSpaces: joined, openId } = joinedSpaces.state
	const { selectedSpaceId } = spaces.state
	const open = openJoinedSpaceOf(joined, openId, selectedSpaceId)
	const sharedSpaceId =
		open && isRelaySpace(open) ? (selectedSpaceId ?? undefined) : undefined
	const members = useSpaceMembers(sharedSpaceId)

	return useMemo(() => {
		const host: SpaceHost = open
			? { kind: "joined", members }
			: { kind: "hosted", ownAccountIds: storedOwnAccounts.list() }
		return { accountId, host }
	}, [accountId, open, members])
}
