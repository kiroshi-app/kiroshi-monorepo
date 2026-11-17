import type { QueryClient } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import { titleOf } from "./library-items"
import { libraryQueryKeys } from "./library-query-keys"
import { readLibraryCommentAgentTurnsOn } from "./library-reads"

import type {
	LibraryCommentAgentTurn,
	LibraryCommentAgentTurnState,
	LibraryCommentAgentTurnsChanged,
	LibraryCommentThread,
	LibraryItem,
} from "../bindings"
import { raiseReportedFailure } from "../failure-report"
import type { Bot } from "../conversations/store-contract"

type FailedState = Extract<LibraryCommentAgentTurnState, { kind: "failed" }>

type FailedTurn = LibraryCommentAgentTurn & { state: FailedState }

export type TurnAgent = Pick<Bot, "id" | "name">

type WatchedTurns = {
	queryClient: QueryClient
	spaceId: string
	agents: TurnAgent[]
}

const RAISED_IN = "library-comment-turn-failures"

const noticedByClient = new WeakMap<QueryClient, Set<string>>()

const noticedIn = (queryClient: QueryClient) => {
	const noticed = noticedByClient.get(queryClient) ?? new Set<string>()
	noticedByClient.set(queryClient, noticed)
	return noticed
}

const isFailedTurn = (turn: LibraryCommentAgentTurn): turn is FailedTurn =>
	turn.state.kind === "failed"

const failureKeyOf = (
	spaceId: string,
	{ threadId, agentId, state }: FailedTurn,
) => [spaceId, threadId, agentId, state.failedAt].join(":")

const itemNameOfThread = (
	queryClient: QueryClient,
	spaceId: string,
	threadId: string,
) =>
	queryClient
		.getQueriesData<LibraryCommentThread[]>({
			queryKey: libraryQueryKeys.commentThreadsIn(spaceId),
		})
		.flatMap(([, threads]) => threads ?? [])
		.find(({ id }) => id === threadId)?.itemName

const itemTitleOf = (
	queryClient: QueryClient,
	spaceId: string,
	name: string,
) => {
	const listed = queryClient
		.getQueryData<LibraryItem[]>(libraryQueryKeys.itemsOf(spaceId))
		?.find((item) => item.name === name)
	return listed ? titleOf(listed) : name
}

const failureTitleOf = (
	agentName: string | undefined,
	item: string | undefined,
) => {
	const agent =
		agentName ?? i18n.t("common:library.failure.comment.unnamedAgent")
	return item === undefined
		? i18n.t("common:library.failure.comment.turnFailed", { agent })
		: i18n.t("common:library.failure.comment.turnFailedOn", { agent, item })
}

const raiseTurnFailure = (
	{ queryClient, spaceId, agents }: WatchedTurns,
	{ threadId, agentId }: FailedTurn,
) => {
	const agentName = agents.find(({ id }) => id === agentId)?.name
	const itemName = itemNameOfThread(queryClient, spaceId, threadId)
	const item = itemName && itemTitleOf(queryClient, spaceId, itemName)
	void raiseReportedFailure(
		{ title: failureTitleOf(agentName, item) },
		{ raisedIn: RAISED_IN, space: spaceId, botId: agentId, botName: agentName },
	)
}

export const raiseUnnoticedTurnFailures = (
	watched: WatchedTurns,
	turns: LibraryCommentAgentTurn[],
) => {
	const noticed = noticedIn(watched.queryClient)
	for (const turn of turns.filter(isFailedTurn)) {
		const key = failureKeyOf(watched.spaceId, turn)
		if (!noticed.has(key)) {
			noticed.add(key)
			raiseTurnFailure(watched, turn)
		}
	}
}

export const logTurnFailureOffScreen = (
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
