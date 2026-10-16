import type { Mission, MissionChanged, MissionDetail } from "./mission-contract"
import type { MissionEvent } from "./mission-event-read"
import type { MissionRunDriverOptions } from "./mission-run-driver"
import { createMissionRunFailures } from "./mission-run-failure"
import type { MissionRunCall, MissionRunCause } from "./mission-run-prompt"
import { createMissionSeqs } from "./mission-seqs"

import type { RuntimeScope } from "../agent/contract"
import { isSameRuntimeScope } from "../chat/chat-state"

export type LiveMissionRun = {
	call: MissionRunCall
	scope: RuntimeScope
	deadline: ReturnType<typeof setTimeout>
}

type MissionRunBookOptions = Pick<
	MissionRunDriverOptions,
	"driver" | "missions" | "reportFailure"
> & {
	retake: (changed: MissionChanged) => void
}

export type MissionRunBook = ReturnType<typeof createMissionRunBook>

type MissionSpace = Pick<MissionChanged, "missionId" | "spaceId">

export const STATUS_CAUSE: MissionRunCause = "status"

export const isClosingRun = ({ call }: LiveMissionRun) =>
	call.cause !== STATUS_CAUSE

export const reporting = (command: string) => (reason: unknown) => {
	console.error(`mission run driver: ${command} failed`, reason)
}

export const createMissionRunBook = ({
	driver,
	missions,
	reportFailure,
	retake,
}: MissionRunBookOptions) => {
	const live = new Map<string, LiveMissionRun>()
	const kept = new Map<string, MissionChanged>()
	const missionIdOfThread = new Map<string, string>()
	const spaceIdOfMission = new Map<string, string>()
	const holding = new Set<string>()
	const seqs = createMissionSeqs()
	const failures = createMissionRunFailures(reportFailure)
	let isStopped = false

	const raiseFailure: typeof failures.raise = (failure) => {
		if (!isStopped) {
			failures.raise({
				...failure,
				spaceId: spaceIdOfMission.get(failure.missionId),
			})
		}
	}

	const isBusy = (missionId: string) =>
		holding.has(missionId) || live.has(missionId)

	const shutdownSession = (scope: RuntimeScope) => {
		void driver.shutdown(scope).catch(reporting("agent_shutdown"))
	}

	const takeAgain = (missionId: string) => {
		if (live.has(missionId)) {
			return
		}

		const changed = kept.get(missionId)
		kept.delete(missionId)

		if (changed && !isStopped) {
			retake(changed)
		}
	}

	const release = (held: LiveMissionRun) => {
		clearTimeout(held.deadline)
		live.delete(held.call.mission.id)
	}

	const forget = (held: LiveMissionRun) => {
		release(held)
		takeAgain(held.call.mission.id)
	}

	const end = (held: LiveMissionRun) => {
		forget(held)
		shutdownSession(held.scope)
	}

	const refuse = async (held: LiveMissionRun, reason: string) => {
		const { scope } = held
		forget(held)
		await driver.cancelTurn(scope).catch(reporting("agent_cancel_turn"))
		shutdownSession(scope)
		raiseFailure({ reason, missionId: held.call.mission.id })
	}

	const expire = async (missionId: string) => {
		const held = live.get(missionId)

		if (!held) {
			return
		}

		await refuse(held, "the mission run outlived its deadline")
	}

	const rememberSpace = ({ missionId, spaceId }: MissionSpace) => {
		if (spaceId) {
			spaceIdOfMission.set(missionId, spaceId)
		} else {
			spaceIdOfMission.delete(missionId)
		}
	}

	const readThrough = async <Read extends MissionDetail | null>(
		missionId: string,
		read: () => Promise<Read>,
	): Promise<Read> => {
		try {
			const detail = await read()
			if (detail) {
				rememberSpace({ missionId, spaceId: detail.mission.spaceId })
			}
			return detail
		} catch (thrown) {
			throw new Error("the mission could not be read", { cause: thrown })
		}
	}

	const readMission = (missionId: string) =>
		readThrough(missionId, () => missions.detail(missionId))

	const readMissionOfEvent = (event: MissionEvent) =>
		readThrough(event.missionId, () => missions.read(event))

	const rememberThread = (mission: Mission) => {
		missionIdOfThread.set(mission.threadConversationId, mission.id)
	}

	const runAt = (scope: RuntimeScope | null) =>
		[...live.values()].find((held) => isSameRuntimeScope(scope, held.scope))

	return {
		live,
		kept,
		missionIdOfThread,
		holding,
		seqs,
		isStopped: () => isStopped,
		stop: () => {
			isStopped = true
			failures.flushAll()
		},
		raiseFailure,
		isBusy,
		shutdownSession,
		takeAgain,
		release,
		end,
		refuse,
		expire,
		readMission,
		readMissionOfEvent,
		rememberSpace,
		rememberThread,
		runAt,
	}
}
