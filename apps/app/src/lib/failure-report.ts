import {
	type FailureContext,
	type FailureReport,
	type FailureSpecs,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"

import { readFailureLog } from "./failure-log"
import { readFailureSpecs } from "./failure-specs"
import { scrubFailureText } from "./failure-text-scrubber"

export type FailureCorrelation = Pick<
	FailureContext,
	| "space"
	| "mission"
	| "botId"
	| "botName"
	| "conversation"
	| "session"
	| "turn"
>

export type FailureFacts = FailureCorrelation & {
	raisedIn: string
	count?: number
	command?: string
	httpStatus?: number
	side?: FailureSpecs["side"]
}

export type UnreportedFailureNotice = Omit<
	Parameters<typeof raiseFailureNotice>[0],
	"report"
>

type FailureFields = {
	kind?: unknown
	message?: unknown
	detail?: unknown
	failure?: unknown
	operation?: unknown
	table?: unknown
}

const REPORT_READ_BUDGET = 500

const fieldsOf = (reason: unknown): FailureFields =>
	typeof reason === "object" && reason !== null ? reason : {}

const textOf = (value: unknown): string | undefined =>
	typeof value === "string" ? value : undefined

const isText = (part: unknown): part is string => typeof part === "string"

const placeOf = ({ operation, table }: FailureFields): string | undefined => {
	const parts = [operation, table].filter(isText)
	return parts.length > 0 ? `(${parts.join(" on ")})` : undefined
}

const sentenceOf = (fields: FailureFields): string | undefined => {
	const nested = fieldsOf(fields.failure)
	const said =
		textOf(fields.message) ?? textOf(fields.detail) ?? textOf(nested.detail)
	const parts = [fields.kind, said].filter(isText)
	if (parts.length === 0) {
		return undefined
	}
	const place = placeOf(nested) ?? placeOf(fields)
	return [parts.join(": "), place].filter(isText).join(" ")
}

const serialized = (reason: unknown): string => {
	try {
		return JSON.stringify(reason) ?? String(reason)
	} catch {
		return typeof reason
	}
}

export const describeFailure = (reason: unknown): string => {
	if (typeof reason === "string") {
		return reason
	}
	if (reason instanceof Error) {
		return reason.message
	}
	return sentenceOf(fieldsOf(reason)) ?? serialized(reason)
}

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
	side,
	space,
	mission,
	count,
	botId,
	botName,
	conversation,
	session,
	turn,
}: FailureFacts): FailureContext => ({
	raisedAt: new Date().toISOString(),
	raisedIn,
	side,
	space,
	mission,
	botId,
	botName: botName && scrubFailureText(botName),
	conversation,
	session,
	turn,
	command,
	httpStatus,
	count,
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

export type ReporterFacts = Omit<FailureFacts, "raisedIn">

export const failureReporterIn =
	(raisedIn: string) =>
	(
		notice: UnreportedFailureNotice,
		facts: ReporterFacts = {},
	): Promise<string> =>
		raiseReportedFailure(notice, { ...facts, raisedIn })
