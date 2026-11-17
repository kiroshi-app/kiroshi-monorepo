import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { describeFailure, type ReporterFacts } from "../failure-report"

export type ReportFailure = (
	notice: NoticeMessage,
	facts?: ReporterFacts,
) => void

type SpaceWriteRefusal = {
	raisedIn: string
	isOnScreen: (spaceRowId: string) => boolean
	reportFailure: ReportFailure
}

const logRefusalOffScreen = (
	raisedIn: string,
	spaceId: string,
	reason: unknown,
) => {
	console.warn(
		[
			`${raisedIn}: a write was refused in a Space not on screen`,
			`space: ${spaceId}`,
			`reason: ${describeFailure(reason)}`,
		].join(" | "),
	)
}

export const spaceWriteRefusalOf =
	({ raisedIn, isOnScreen, reportFailure }: SpaceWriteRefusal) =>
	(reason: unknown, spaceId: string | undefined) => {
		if (spaceId !== undefined && !isOnScreen(spaceId)) {
			logRefusalOffScreen(raisedIn, spaceId, reason)
			return
		}
		reportFailure(
			{ title: i18n.t("chat:screen.notice.failed") },
			{ reason, space: spaceId },
		)
	}
