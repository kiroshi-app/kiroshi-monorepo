import { createContext, useCallback, useContext } from "react"

import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import type { Member } from "../bindings"
import type { TranscriptMessage } from "../conversations/transcript-contract"
import { authorAmong, memberNameOf } from "../host/member-names"

export type SpaceHost =
	| { kind: "hosted"; ownAccountIds: readonly string[] }
	| { kind: "joined"; members: readonly Member[] }

export type ThreadAuthorship = {
	accountId: string | null
	host: SpaceHost
}

export type MessageAuthorship = Pick<
	TranscriptMessage,
	"authorAccountId" | "authorName"
>

export const HOSTED_SIGNED_OUT: ThreadAuthorship = {
	accountId: null,
	host: { kind: "hosted", ownAccountIds: [] },
}

export const ThreadAuthorshipContext =
	createContext<ThreadAuthorship>(HOSTED_SIGNED_OUT)

const isWrittenBySelf = (
	{ accountId, host }: ThreadAuthorship,
	{ authorAccountId }: MessageAuthorship,
): boolean => {
	if (authorAccountId === null) {
		return host.kind === "hosted"
	}
	return (
		authorAccountId === accountId ||
		(host.kind === "hosted" && host.ownAccountIds.includes(authorAccountId))
	)
}

const personNameOf = (
	authorship: ThreadAuthorship,
	author: MessageAuthorship,
	unnamed: string,
): string | undefined => {
	if (isWrittenBySelf(authorship, author)) {
		return undefined
	}
	const { host } = authorship
	return host.kind === "joined"
		? memberNameOf(authorAmong(host.members, author.authorAccountId), unnamed)
		: author.authorName || unnamed
}

export type PersonOf = (author: MessageAuthorship) => string | undefined

export const usePersonOf = (): PersonOf => {
	const authorship = useContext(ThreadAuthorshipContext)
	const t = useChatCopy()
	const unnamed = t("working.name")
	return useCallback(
		(author: MessageAuthorship) => personNameOf(authorship, author, unnamed),
		[authorship, unnamed],
	)
}
