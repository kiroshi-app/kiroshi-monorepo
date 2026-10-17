import {
	type QueryClient,
	queryOptions,
	skipToken,
} from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import { spaceQueryKeys } from "./space-query-keys"

import {
	commands,
	type JoinedSpaceError,
	type JoinedSpaceMember,
} from "../bindings"

export const NO_JOINED_MEMBERS: JoinedSpaceMember[] = []

type MembersResult =
	| { status: "ok"; data: JoinedSpaceMember[] }
	| { status: "error"; error: JoinedSpaceError }

const membersOf = (result: MembersResult): JoinedSpaceMember[] => {
	if (result.status === "error") {
		throw result.error
	}
	return result.data
}

const readFailure = () => ({
	title: i18n.t("settings:rail.members"),
	description: i18n.t("settings:space.transfer.reason.generic"),
})

export const joinedSpaceMembersQueryOf = (joinedId: string | undefined) =>
	queryOptions({
		queryKey: spaceQueryKeys.joinedMembersOf(joinedId),
		queryFn: joinedId
			? async () => membersOf(await commands.joinedSpaceMembers(joinedId))
			: skipToken,
		meta: { failureNotice: readFailure, raisedIn: "joined-space-members" },
	})

export const heldJoinedMembersOf = (
	queryClient: QueryClient,
	joinedId: string,
): JoinedSpaceMember[] =>
	queryClient.getQueryData(spaceQueryKeys.joinedMembersOf(joinedId)) ??
	NO_JOINED_MEMBERS
