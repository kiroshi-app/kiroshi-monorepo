import { formatFailureSpecs } from "@workspace/ui/components/notice-surface"
import type { DiagnosticsFieldsProps } from "@workspace/ui/components/user-settings-dialog/diagnostics-fields"
import { i18n } from "@workspace/ui/lib/i18n"

import { commands } from "../bindings"
import { raiseReportedFailure } from "../failure-report"
import { readFailureSpecs } from "../failure-specs"

type LogCommand = typeof commands.logReveal

const DIAGNOSTICS_RAISED_IN = "diagnostics-actions"

const reportFailure = (title: string) =>
	raiseReportedFailure({ title }, { raisedIn: DIAGNOSTICS_RAISED_IN })

const specsText = async () =>
	new Blob([formatFailureSpecs(await readFailureSpecs())], {
		type: "text/plain",
	})

const copyDiagnostics = () =>
	navigator.clipboard.write([new ClipboardItem({ "text/plain": specsText() })])

const performLogCommand = async (command: LogCommand) => {
	const result = await command()
	if (result.status === "error") {
		throw new Error(`log ${result.error.kind}`)
	}
}

export const diagnosticsActions: DiagnosticsFieldsProps = {
	onDiagnosticsCopy: () => {
		copyDiagnostics().catch(() =>
			reportFailure(i18n.t("settings:diagnostics.copyFailed")),
		)
	},
	onLogReveal: () => {
		performLogCommand(commands.logReveal).catch(() =>
			reportFailure(i18n.t("settings:diagnostics.revealFailed")),
		)
	},
	onLogClear: () =>
		performLogCommand(commands.logClear).catch((reason: unknown) => {
			void reportFailure(i18n.t("settings:diagnostics.clear.failed"))
			throw reason
		}),
}
