import { i18n } from "@workspace/ui/lib/i18n"

import type { ReporterFacts, UnreportedFailureNotice } from "../failure-report"
import { isHostOffline } from "../host/host-offline"

type MissionRunFailure = {
	reason: string
	missionId: string
	spaceId?: string
	error?: unknown
}

export type ReportMissionRunFailure = (
	notice: UnreportedFailureNotice,
	facts: ReporterFacts,
) => void

type FailureBurst = {
	failure: MissionRunFailure
	count: number
	window: ReturnType<typeof setTimeout>
}

export const FAILURE_BURST_MS = 2_000

const UNEXPLAINED_REASON = "the mission run failed"

const UNSERIALIZABLE_ERROR = "an error that could not be serialized"

const SIDE: ReporterFacts["side"] = "local"

const fieldsOf = (thrown: unknown) =>
	thrown instanceof Error ? { ...thrown, message: thrown.message } : thrown

const detailOf = (thrown: unknown): string => {
	if (typeof thrown === "string") {
		return thrown
	}
	try {
		return JSON.stringify(fieldsOf(thrown)) ?? String(thrown)
	} catch {
		return UNSERIALIZABLE_ERROR
	}
}

export const failureOf = (
	thrown: unknown,
	missionId: string,
): MissionRunFailure =>
	thrown instanceof Error && thrown.cause !== undefined
		? { reason: thrown.message, error: thrown.cause, missionId }
		: { reason: UNEXPLAINED_REASON, error: thrown, missionId }

const causeOf = ({ reason, error }: MissionRunFailure) =>
	JSON.stringify([reason, error === undefined ? null : detailOf(error)])

const logLineOf = ({
	failure: { reason, error, missionId, spaceId },
	count,
}: FailureBurst) =>
	[
		`mission run driver: ${reason}`,
		error !== undefined && `error: ${detailOf(error)}`,
		`mission: ${missionId}`,
		spaceId && `space: ${spaceId}`,
		`side: ${SIDE}`,
		`count: ${count}`,
	]
		.filter(Boolean)
		.join(" | ")

export const createMissionRunFailures = (
	reportFailure: ReportMissionRunFailure,
) => {
	const bursts = new Map<string, FailureBurst>()

	const flush = (cause: string) => {
		const burst = bursts.get(cause)
		if (!burst) {
			return
		}
		clearTimeout(burst.window)
		bursts.delete(cause)
		if (isHostOffline(burst.failure.error)) {
			console.warn(logLineOf(burst))
			return
		}
		console.error(logLineOf(burst))
		reportFailure(
			{
				title: i18n.t("chat:missions.failure.run.title"),
				description: i18n.t("chat:missions.failure.run.description"),
				cause,
			},
			{
				side: SIDE,
				mission: burst.failure.missionId,
				...(burst.failure.spaceId ? { space: burst.failure.spaceId } : {}),
				count: burst.count,
			},
		)
	}

	const raise = (failure: MissionRunFailure) => {
		const cause = causeOf(failure)
		const burst = bursts.get(cause)
		if (burst) {
			burst.count += 1
			return
		}
		bursts.set(cause, {
			failure,
			count: 1,
			window: setTimeout(() => flush(cause), FAILURE_BURST_MS),
		})
	}

	const flushAll = () => {
		for (const cause of [...bursts.keys()]) {
			flush(cause)
		}
	}

	return { raise, flushAll }
}
