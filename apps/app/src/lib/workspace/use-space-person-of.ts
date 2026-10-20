import { useMemo } from "react"

import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import type { WorkspaceCore } from "./use-workspace-core"

import { signedInAccountIdOf } from "../account/use-account"
import {
	type PersonOf,
	personNameOf,
	type SpaceHost,
} from "../chat/thread-authorship"
import { NO_JOINED_MEMBERS } from "../spaces/joined-space-members"
import { joinedRowIdOf } from "../spaces/joined-spaces-controller"
import { useJoinedSpaceMembers } from "../spaces/use-joined-space-members"

type SpacePersonOf = (spaceRowId: string | null) => PersonOf

export const useSpacePersonOf = ({
	account,
	joinedSpaces,
}: Pick<WorkspaceCore, "account" | "joinedSpaces">): SpacePersonOf => {
	const accountId = signedInAccountIdOf(account.state)
	const joined = joinedSpaces.state.joinedSpaces
	const membersOfEach = useJoinedSpaceMembers(joined.map(({ id }) => id))
	const unnamed = useChatCopy()("working.name")

	return useMemo(() => {
		const hosted: SpaceHost = { kind: "hosted" }
		const hostsByRowId = new Map<string, SpaceHost>(
			joined.map(({ id }, index) => [
				joinedRowIdOf(id),
				{ kind: "joined", members: membersOfEach[index] ?? NO_JOINED_MEMBERS },
			]),
		)
		const hostOf = (spaceRowId: string | null) =>
			(spaceRowId && hostsByRowId.get(spaceRowId)) || hosted
		return (spaceRowId) => (author) =>
			personNameOf({ accountId, host: hostOf(spaceRowId) }, author, unnamed)
	}, [accountId, joined, membersOfEach, unnamed])
}
