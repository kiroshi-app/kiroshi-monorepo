import {
	type FailureContext,
	type FailureReport,
	type FailureSpecs,
	type NoticeMessage,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"

import { readFailureLog } from "./failure-log"
import { readFailureSpecs } from "./failure-specs"
import { scrubFailureText } from "./failure-text-scrubber"

export type FailureCorrelation = Pick<
	FailureContext,
	"space" | "botId" | "botName" | "conversation" | "session" | "turn"
>

export type FailureFacts = FailureCorrelation & {
	raisedIn: string
	command?: string
	httpStatus?: number
	side?: FailureSpecs["side"]
}

type UnreportedFailureNotice = Omit<
	Parameters<typeof raiseFailureNotice>[0],
	"report"
>

const REPORT_READ_BUDGET = 500

let isThisMacAlone: () => boolean = () => false

export const reportLocalWhen = (isAlone: () => boolean) => {
	isThisMacAlone = isAlone
}

const sideOf = (side: FailureFacts["side"]): FailureFacts["side"] =>
	side ?? (isThisMacAlone() ? "local" : undefined)

const readOrLeaveOut = <Group>(
	read: () => Promise<Group>,
): Promise<Group | undefined> =>
	new Promise((resolve) => {
		const leaveOut = () => resolve(undefined)
		const budget = setTimeout(leaveOut, REPORT_READ_BUDGET)
		read()
			.then(resolve, leaveOut)
			.finally(() => clearTimeout(budget))
	})

const contextOf = ({
	raisedIn,
	command,
	httpStatus,
	space,
	botId,
	botName,
	conversation,
	session,
	turn,
}: FailureFacts): FailureContext => ({
	raisedAt: new Date().toISOString(),
	raisedIn,
	space,
	botId,
	botName: botName && scrubFailureText(botName),
	conversation,
	session,
	turn,
	command,
	httpStatus,
})

const specsOn = (
	specs: FailureSpecs | undefined,
	side: FailureFacts["side"],
): FailureSpecs | undefined =>
	specs && { ...specs, side: sideOf(side) ?? specs.side }

export const buildFailureReport = async (
	facts: FailureFacts,
): Promise<FailureReport> => {
	const context = contextOf(facts)
	const [specs, log] = await Promise.all([
		readOrLeaveOut(readFailureSpecs),
		readOrLeaveOut(readFailureLog),
	])
	return { specs: specsOn(specs, facts.side), context, log }
}

export const raiseReportedFailure = async (
	{ description, ...notice }: UnreportedFailureNotice,
	facts: FailureFacts,
): Promise<string> =>
	raiseFailureNotice({
		...notice,
		description: description && scrubFailureText(description),
		report: await buildFailureReport(facts),
	})

export const failureReporterIn =
	(raisedIn: string) =>
	(notice: NoticeMessage): Promise<string> =>
		raiseReportedFailure(notice, { raisedIn })
