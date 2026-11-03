import { i18n } from "@workspace/ui/lib/i18n"

import { openInBrowser } from "./use-external-links"

import { failureReporterIn } from "../failure-report"

const reportFailure = failureReporterIn("open-web-page")

export const openWebPage = (url: string) => {
	void openInBrowser(url).catch(() =>
		reportFailure({ title: i18n.t("chat:answerBlock.webPage.openFailed") }),
	)
}
