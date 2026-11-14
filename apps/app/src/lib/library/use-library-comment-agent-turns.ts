import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import {
	isFailedTurn,
	raiseUnnoticedTurnFailures,
	type TurnAgent,
} from "./library-comment-turn-failures"
import { libraryQueryKeys } from "./library-query-keys"
import {
	readLibraryCommentAgentTurns,
	readLibraryCommentAgentTurnsOn,
} from "./library-reads"
import { reportUnheard } from "./use-library-document-writers"

import {
	LIBRARY_COMMENT_AGENT_TURNS_CHANGED_EVENT,
	type LibraryCommentAgentTurn,
	type LibraryCommentAgentTurnsChanged,
} from "../bindings"
import { listen } from "../host/index"

const NO_TURNS: LibraryCommentAgentTurn[] = []

const workingTurnsIn = (turns: LibraryCommentAgentTurn[]) =>
	turns.filter(({ state }) => state.kind === "working")

const logFailureOffScreen = (
	hostId: string | null,
	{ spaceId, threadId, agentId }: LibraryCommentAgentTurnsChanged,
) =>
	readLibraryCommentAgentTurnsOn(hostId, spaceId).then(
		(turns) => {
			const hasFailed = turns
				.filter(isFailedTurn)
				.some((turn) => turn.threadId === threadId && turn.agentId === agentId)
			if (hasFailed) {
				console.info(
					`library: the comment turn of agent ${agentId} on thread ${threadId} failed in Space ${spaceId}, which is not on screen`,
				)
			}
		},
		(reason: unknown) => {
			console.error(
				`library: the comment turns of Space ${spaceId}, which is not on screen, could not be read`,
				reason,
			)
		},
	)

export const useLibraryCommentAgentTurns = (
	spaceId: string,
	agents: TurnAgent[],
) => {
	const queryClient = useQueryClient()
	const { data: workingTurns = NO_TURNS } = useQuery({
		queryKey: libraryQueryKeys.commentAgentTurnsOf(spaceId),
		queryFn: async () => {
			const turns = await readLibraryCommentAgentTurns(spaceId)
			raiseUnnoticedTurnFailures({ queryClient, spaceId, agents }, turns)
			return turns
		},
		select: workingTurnsIn,
		meta: {
			failureNotice: () => ({
				title: i18n.t("common:library.failure.comment.agentTurns"),
			}),
			raisedIn: "use-library-comment-agent-turns",
		},
	})

	useEffect(() => {
		const subscription = listen<LibraryCommentAgentTurnsChanged>(
			LIBRARY_COMMENT_AGENT_TURNS_CHANGED_EVENT,
			({ payload }, hostId) => {
				if (payload.spaceId !== spaceId) {
					void logFailureOffScreen(hostId, payload)
					return
				}
				void queryClient.invalidateQueries({
					queryKey: libraryQueryKeys.commentAgentTurnsOf(spaceId),
				})
			},
		).catch(reportUnheard(LIBRARY_COMMENT_AGENT_TURNS_CHANGED_EVENT))
		return () => {
			void subscription.then((unlisten) => unlisten?.())
		}
	}, [queryClient, spaceId])

	return workingTurns
}
