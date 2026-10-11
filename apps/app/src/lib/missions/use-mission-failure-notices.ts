import { useEffect, useRef } from "react"

import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import type { RefusedMessage } from "@/lib/conversations/conversation-controller"
import { raiseReportedFailure } from "@/lib/failure-report"

export const useMissionSendFailure = (refused: RefusedMessage | null): void => {
	const t = useChatCopy()
	const reportedId = useRef<string | null>(null)

	useEffect(() => {
		if (!refused || reportedId.current === refused.id) {
			return
		}
		reportedId.current = refused.id
		raiseReportedFailure(
			{
				title: t("missions.failure.send.title"),
				description: t("missions.failure.send.description"),
			},
			{ raisedIn: "use-mission-failure-notices" },
		)
	}, [refused, t])
}

export const useMissionReadFailure = (hasFailedToRead: boolean): void => {
	const t = useChatCopy()
	const wasFailing = useRef(false)

	useEffect(() => {
		const wasReported = wasFailing.current
		wasFailing.current = hasFailedToRead

		if (!hasFailedToRead || wasReported) {
			return
		}
		raiseReportedFailure(
			{
				title: t("missions.failure.read.title"),
				description: t("missions.failure.read.description"),
			},
			{ raisedIn: "use-mission-failure-notices" },
		)
	}, [hasFailedToRead, t])
}

export const useSpaceMissionsFailure = (
	hasFailed: boolean,
	reload: () => void,
): void => {
	const t = useChatCopy()
	const wasFailing = useRef(false)

	useEffect(() => {
		const wasReported = wasFailing.current
		wasFailing.current = hasFailed

		if (!hasFailed || wasReported) {
			return
		}
		raiseReportedFailure(
			{
				title: t("activity.failure.missions.title"),
				description: t("activity.failure.missions.description"),
				action: { label: t("notice.retry"), onPress: reload },
			},
			{ raisedIn: "use-mission-failure-notices" },
		)
	}, [hasFailed, reload, t])
}
