import { raiseTransientNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { commands } from "@/lib/bindings"
import { failureReporterIn } from "@/lib/failure-report"

const reportFailure = failureReporterIn("save-answer-table")

const TABLE_FILE_NAME = "table.csv"

const fileSlugOf = (agentName: string): string =>
	agentName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")

const tableFileNameOf = (agentName: string): string => {
	const slug = fileSlugOf(agentName)
	return slug ? `${slug}-${TABLE_FILE_NAME}` : TABLE_FILE_NAME
}

const fileNameOf = (path: string): string => path.split(/[\\/]/).at(-1) ?? path

const savedPathOf = async (
	fileName: string,
	csv: string,
): Promise<string | null> => {
	const answer = await commands.saveCsvFile(fileName, csv)
	if (answer.status === "error") throw answer.error
	return answer.data
}

const raiseTableSaved = (path: string | null) => {
	if (path === null) return

	raiseTransientNotice({
		type: "success",
		title: i18n.t("chat:table.saved", { name: fileNameOf(path) }),
	})
}

const reportTableNotSaved = () =>
	reportFailure({ title: i18n.t("chat:table.saveFailed") })

export const answerTableSaverOf = (agentName: string) => (csv: string) => {
	void savedPathOf(tableFileNameOf(agentName), csv).then(
		raiseTableSaved,
		reportTableNotSaved,
	)
}
