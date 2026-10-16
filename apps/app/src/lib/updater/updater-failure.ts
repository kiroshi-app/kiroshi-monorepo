import { i18n } from "@workspace/ui/lib/i18n"

import { raiseReportedFailure } from "../failure-report"

export const updaterFailureNotice = () => ({
	title: i18n.t("chat:screen.notice.failed"),
})

export const raiseUpdaterFailure = (raisedIn: string) => () => {
	raiseReportedFailure(updaterFailureNotice(), { raisedIn })
}
