import { platform } from "@tauri-apps/plugin-os"

import {
	type FailureReport,
	type NoticeMessage,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"

import { scrubFailureText } from "./failure-text-scrubber"

import { hasTauriInternals } from "./host/tauri-internals"

export type FailureFacts = {
	raisedIn: string
	command?: string
	httpStatus?: number
	side?: FailureReport["side"]
}

type UnreportedFailureNotice = Omit<
	Parameters<typeof raiseFailureNotice>[0],
	"report"
>

let isThisMacAlone: () => boolean = () => false

export const reportLocalWhen = (isAlone: () => boolean) => {
	isThisMacAlone = isAlone
}

const sideOf = (side: FailureFacts["side"]): FailureFacts["side"] =>
	side ?? (isThisMacAlone() ? "local" : undefined)

const platformName = (): string | undefined =>
	hasTauriInternals() ? platform() : undefined

export const buildFailureReport = ({
	raisedIn,
	command,
	httpStatus,
	side,
}: FailureFacts): FailureReport => ({
	appVersion: __APP_VERSION__,
	platform: platformName(),
	raisedAt: new Date().toISOString(),
	command,
	httpStatus,
	side: sideOf(side),
	raisedIn,
})

export const raiseReportedFailure = (
	{ description, ...notice }: UnreportedFailureNotice,
	facts: FailureFacts,
): string =>
	raiseFailureNotice({
		...notice,
		description: description && scrubFailureText(description),
		report: buildFailureReport(facts),
	})

export const failureReporterIn =
	(raisedIn: string) =>
	(notice: NoticeMessage): string =>
		raiseReportedFailure(notice, { raisedIn })
