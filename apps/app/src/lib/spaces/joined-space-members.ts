import {
	type QueryClient,
	queryOptions,
	skipToken,
} from "@tanstack/react-query"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
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

export const membersReadFailure = (): NoticeMessage => ({
	title: i18n.t("settings:rail.members"),
	description: i18n.t("settings:space.transfer.reason.generic"),
})

export const joinedSpaceMembersQueryOf = (joinedId: string | undefined) =>
	queryOptions({
		queryKey: spaceQueryKeys.joinedMembersOf(joinedId),
		queryFn: joinedId
			? async () => membersOf(await commands.joinedSpaceMembers(joinedId))
			: skipToken,
		meta: {
			failureNotice: membersReadFailure,
			raisedIn: "joined-space-members",
		},
	})

export const heldJoinedMembersOf = (
	queryClient: QueryClient,
	joinedId: string,
): JoinedSpaceMember[] =>
	queryClient.getQueryData(spaceQueryKeys.joinedMembersOf(joinedId)) ??
	NO_JOINED_MEMBERS
