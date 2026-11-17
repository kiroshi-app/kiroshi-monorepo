import { formatFailureSpecs } from "@workspace/ui/components/notice-surface"
import type { DiagnosticsFieldsProps } from "@workspace/ui/components/user-settings-dialog/diagnostics-fields"
import { i18n } from "@workspace/ui/lib/i18n"

import { commands } from "../bindings"
import { raiseReportedFailure } from "../failure-report"
import { readFailureSpecs } from "../failure-specs"
import { nameCallOnFailure } from "../host/failed-call"

type LogCommand = typeof commands.logReveal

const DIAGNOSTICS_RAISED_IN = "diagnostics-actions"

const reportFailure = (title: string, reason: unknown) =>
	raiseReportedFailure({ title }, { raisedIn: DIAGNOSTICS_RAISED_IN, reason })

const specsText = async () =>
	new Blob([formatFailureSpecs(await readFailureSpecs())], {
		type: "text/plain",
	})

const copyDiagnostics = () =>
	navigator.clipboard.write([new ClipboardItem({ "text/plain": specsText() })])

const answerOf = async (command: LogCommand) => {
	const result = await command()
	if (result.status === "error") {
		throw result.error
	}
}

const performLogCommand = (name: string, command: LogCommand) =>
	nameCallOnFailure(name, answerOf(command))

export const diagnosticsActions: DiagnosticsFieldsProps = {
	onDiagnosticsCopy: () => {
		copyDiagnostics().catch((reason: unknown) =>
			reportFailure(i18n.t("settings:diagnostics.copyFailed"), reason),
		)
	},
	onLogReveal: () => {
		performLogCommand("log_reveal", commands.logReveal).catch(
			(reason: unknown) =>
				reportFailure(i18n.t("settings:diagnostics.revealFailed"), reason),
		)
	},
	onLogClear: () =>
		performLogCommand("log_clear", commands.logClear).catch(
			(reason: unknown) => {
				void reportFailure(i18n.t("settings:diagnostics.clear.failed"), reason)
				throw reason
			},
		),
}
