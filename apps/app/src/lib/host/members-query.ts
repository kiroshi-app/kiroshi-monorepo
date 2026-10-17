import {
	type QueryClient,
	queryOptions,
	skipToken,
} from "@tanstack/react-query"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { hostQueryKeys } from "./host-query-keys"
import { readMembers } from "./member-actions"
import { type MembersTransport, membersTransport } from "./members-transport"

import type { Member } from "../bindings"

export const NO_MEMBERS: Member[] = []

const readFailure = (): NoticeMessage => ({
	title: i18n.t("settings:rail.members"),
	description: i18n.t("settings:space.transfer.reason.generic"),
})

export const membersQueryOf = (
	spaceId: string | undefined,
	transport: MembersTransport = membersTransport,
) =>
	queryOptions({
		queryKey: hostQueryKeys.membersOf(spaceId),
		queryFn: spaceId ? () => readMembers(transport, spaceId) : skipToken,
		meta: { failureNotice: readFailure, raisedIn: "use-members" },
	})

export const heldMembersOf = (
	queryClient: QueryClient,
	spaceId: string,
): Member[] =>
	queryClient.getQueryData(hostQueryKeys.membersOf(spaceId)) ?? NO_MEMBERS
