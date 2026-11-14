import { useQuery } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import { libraryQueryKeys } from "./library-query-keys"
import { readLibraryCommentAgentTurns } from "./library-reads"

import {
	LIBRARY_COMMENT_AGENT_TURNS_CHANGED_EVENT,
	type LibraryCommentAgentTurn,
} from "../bindings"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"

const NO_TURNS: LibraryCommentAgentTurn[] = []

const workingTurnsIn = (turns: LibraryCommentAgentTurn[]) =>
	turns.filter(({ state }) => state.kind === "working")

export const useLibraryCommentAgentTurns = (spaceId: string) => {
	const { data: workingTurns = NO_TURNS } = useQuery({
		queryKey: libraryQueryKeys.commentAgentTurnsOf(spaceId),
		queryFn: () => readLibraryCommentAgentTurns(spaceId),
		select: workingTurnsIn,
		meta: {
			failureNotice: () => ({
				title: i18n.t("common:library.failure.comment.agentTurns"),
			}),
			raisedIn: "use-library-comment-agent-turns",
		},
	})
	useInvalidateOnHostEvent(LIBRARY_COMMENT_AGENT_TURNS_CHANGED_EVENT, [
		libraryQueryKeys.commentAgentTurnsOf(spaceId),
	])

	return workingTurns
}
