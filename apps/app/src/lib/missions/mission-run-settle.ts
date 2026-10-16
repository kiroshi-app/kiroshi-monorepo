import type { Mission } from "./mission-contract"
import {
	detailOf,
	isClosingRun,
	type LiveMissionRun,
	type MissionRunBook,
} from "./mission-run-book"
import type { MissionRunDriverOptions } from "./mission-run-driver"
import type { createMissionReportWriter } from "./mission-run-report"

import type { TurnEnded } from "../agent/contract"
import { readRunReport } from "../routines/run-output"

type MissionRunSettleOptions = Pick<MissionRunDriverOptions, "missions"> & {
	book: MissionRunBook
	writeReport: ReturnType<typeof createMissionReportWriter>
}

export const isClosed = (settled: Mission | null): settled is Mission =>
	settled !== null && settled.closedAt !== null

export const createMissionRunSettle = ({
	missions,
	book,
	writeReport,
}: MissionRunSettleOptions) => {
	const readSettledMission = async (missionId: string) => {
		try {
			const { mission } = await book.readMission(missionId)
			return mission
		} catch (thrown) {
			book.raiseFailure(detailOf(thrown))
			return null
		}
	}

	const recordReport = async (
		missionId: string,
		reportedTurnId: string | null,
	) => {
		try {
			await missions.reported(missionId, reportedTurnId)
		} catch (thrown) {
			book.raiseFailure(`the report could not be recorded: ${detailOf(thrown)}`)
		}
	}

	const recordWhenOwed = async (
		settled: Mission | null,
		reportedTurnId: string | null,
	) => {
		if (!isClosed(settled)) {
			return
		}

		await recordReport(settled.id, reportedTurnId)
	}

	const settleNothingReported = async (
		held: LiveMissionRun,
		settled: Mission | null,
	) => {
		if (!isClosingRun(held)) {
			return book.raiseFailure("the status mission run reported nothing")
		}

		if (!isClosed(settled)) {
			return
		}

		book.raiseFailure("the closing mission run reported nothing")
		await recordReport(settled.id, null)
	}

	const endOn = async (held: LiveMissionRun) => {
		const { id } = held.call.mission
		book.release(held)
		book.holding.add(id)
		book.shutdownSession(held.scope)

		const settled = isClosingRun(held) ? await readSettledMission(id) : null

		if (isClosed(settled)) {
			book.seqs.remember(settled.id, settled.stateSeq)
		}

		book.holding.delete(id)
		book.takeAgain(id)
		return settled
	}

	return async (held: LiveMissionRun, ended: TurnEnded) => {
		const settled = await endOn(held)

		if (ended.outcome !== "completed") {
			return book.raiseFailure(`the mission run's turn was ${ended.outcome}`)
		}

		const report = readRunReport(ended.structuredOutput)

		if (!report) {
			book.raiseFailure("the mission run ended with no structured output")
			return recordWhenOwed(settled, null)
		}

		if (report.outcome === "nothing") {
			return settleNothingReported(held, settled)
		}

		try {
			const reportedTurnId = await writeReport(held, report.text)
			await recordWhenOwed(settled, reportedTurnId)
		} catch (thrown) {
			book.raiseFailure(`the report could not be written: ${detailOf(thrown)}`)
		}
	}
}
