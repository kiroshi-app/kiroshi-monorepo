import { i18n } from "@workspace/ui/lib/i18n"

import { failureReporterIn } from "@/lib/failure-report"

const reportFailure = failureReporterIn("copy-selection")

export const copySelection = (text: string) => {
	navigator.clipboard
		.writeText(text)
		.catch((reason: unknown) =>
			reportFailure(
				{ title: i18n.t("chat:missions.menu.failed.copy") },
				{ reason },
			),
		)
}
