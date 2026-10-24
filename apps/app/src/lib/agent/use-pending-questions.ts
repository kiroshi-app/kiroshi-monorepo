import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import { agentQueryKeys } from "./agent-query-keys"
import type { ScopedEvent } from "./contract"
import {
	changesPendingQuestions,
	firstQuestionByConversation,
	latestQuestionByBot,
	leavesQuestionsToTheHost,
	type PendingQuestion,
	pendingQuestionsAfter,
	pendingQuestionsOf,
	type SpaceQuestions,
} from "./pending-questions"
import { pendingQuestionsInSpace } from "./transport"

import { raiseReportedFailure } from "../failure-report"
import type { RosterController } from "../bots/roster-controller"
import type { ChatDriver } from "../chat/driver"

type PendingQuestionsInput = {
	driver: Pick<ChatDriver, "subscribe">
	roster: Pick<RosterController, "hostSpaceIdOf" | "spaceOfConversation">
	spaceRowId: string | null
}

const RAISED_IN = "use-pending-questions"

const NO_QUESTIONS: PendingQuestion[] = []

const unreachableAgent = () => ({
	title: i18n.t("chat:screen.notice.unavailable"),
})

const reportUnheard = () => {
	void raiseReportedFailure(unreachableAgent(), { raisedIn: RAISED_IN })
	return null
}

export const usePendingQuestions = ({
	driver,
	roster,
	spaceRowId,
}: PendingQuestionsInput): SpaceQuestions => {
	const queryClient = useQueryClient()
	const { data = NO_QUESTIONS } = useQuery({
		queryKey: agentQueryKeys.pendingQuestionsIn(spaceRowId),
		queryFn:
			spaceRowId === null
				? skipToken
				: async () =>
						pendingQuestionsOf(
							await pendingQuestionsInSpace(roster.hostSpaceIdOf(spaceRowId)),
						),
		gcTime: 0,
		meta: { failureNotice: unreachableAgent, raisedIn: RAISED_IN },
	})

	useEffect(() => {
		if (spaceRowId === null) {
			return
		}
		const queryKey = agentQueryKeys.pendingQuestionsIn(spaceRowId)
		const isInSpace = (conversationId: string) =>
			roster.spaceOfConversation(conversationId) === spaceRowId
		const isReading = () =>
			queryClient.getQueryState(queryKey)?.fetchStatus === "fetching"
		const reread = () =>
			queryClient
				.cancelQueries({ queryKey })
				.then(() => queryClient.refetchQueries({ queryKey }))
		const follow = (scoped: ScopedEvent) => {
			if (leavesQuestionsToTheHost(scoped)) {
				void reread()
				return
			}
			if (!changesPendingQuestions(scoped)) {
				return
			}
			if (isReading()) {
				void reread()
				return
			}
			queryClient.setQueryData<PendingQuestion[]>(queryKey, (questions) => {
				const next =
					questions && pendingQuestionsAfter(questions, scoped, isInSpace)
				return next === questions ? undefined : next
			})
		}
		const unsubscribe = driver.subscribe(follow).catch(reportUnheard)
		return () => {
			void unsubscribe.then((stop) => stop?.())
		}
	}, [driver, queryClient, roster, spaceRowId])

	return useMemo(
		() => ({
			spaceRowId,
			byConversation: firstQuestionByConversation(data),
			byBot: latestQuestionByBot(data),
		}),
		[spaceRowId, data],
	)
}
