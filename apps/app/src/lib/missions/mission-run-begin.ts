import {
	type LiveMissionRun,
	type MissionRunBook,
	reporting,
} from "./mission-run-book"
import type { MissionRunDriverOptions } from "./mission-run-driver"
import { MISSION_RUN_OUTPUT_SCHEMA } from "./mission-run-output"
import { type MissionRunCall, missionRunPromptFor } from "./mission-run-prompt"

export const RUN_DEADLINE_MS = 30 * 60_000

const failedStart = (thrown: unknown) =>
	new Error("the mission run could not start", { cause: thrown })

const logAlreadyRunning = (missionId: string) => {
	console.info(
		`mission run driver: another window runs the mission | mission: ${missionId}`,
	)
}

type MissionRunBeginOptions = Pick<
	MissionRunDriverOptions,
	"driver" | "store" | "missions"
> & {
	book: MissionRunBook
	now: () => number
}

export const createMissionRunBegin = ({
	driver,
	store,
	missions,
	book,
	now,
}: MissionRunBeginOptions) => {
	const rosterBlockOf = async ({ mission }: MissionRunCall) => {
		try {
			return await missions.rosterBlock(
				mission.originConversationId,
				mission.botId,
			)
		} catch (thrown) {
			reporting("conversation_roster_block")(thrown)
			return null
		}
	}

	const openScope = async (call: MissionRunCall) => {
		const opened = await store.openRuntimeSession(
			call.mission.originConversationId,
			call.mission.botId,
			now(),
			null,
			null,
		)
		return {
			conversationId: opened.conversationId,
			botId: opened.botId,
			runtimeSessionId: opened.id,
			epoch: opened.seq,
		}
	}

	const claimRun = async (missionId: string) => {
		try {
			return await missions.claimRun(missionId)
		} catch (thrown) {
			throw new Error("the mission run could not be claimed", {
				cause: thrown,
			})
		}
	}

	const tokenOf = async (missionId: string) => {
		const claim = await claimRun(missionId)

		if (claim.kind === "claimed") {
			return claim.token
		}

		logAlreadyRunning(missionId)
		return null
	}

	const openClaimedScope = async (call: MissionRunCall, token: string) => {
		try {
			return await openScope(call)
		} catch (thrown) {
			book.releaseClaim(token)
			throw failedStart(thrown)
		}
	}

	const begin = async (call: MissionRunCall, token: string) => {
		const { id } = call.mission
		const scope = await openClaimedScope(call, token)
		const held: LiveMissionRun = {
			call,
			scope,
			token,
			deadline: setTimeout(() => void book.expire(id), RUN_DEADLINE_MS),
		}
		book.live.set(id, held)

		if (book.isStopped()) {
			return book.end(held)
		}

		try {
			await driver.startOrResumeSession(
				scope,
				undefined,
				undefined,
				MISSION_RUN_OUTPUT_SCHEMA,
			)
			await driver.submitPrompt(scope, missionRunPromptFor(call))
		} catch (thrown) {
			if (book.live.get(id) === held) {
				book.end(held)
			}
			throw failedStart(thrown)
		}
	}

	return async (call: MissionRunCall) => {
		const token = await tokenOf(call.mission.id)

		if (token === null) {
			return
		}

		const rosterBlock = await rosterBlockOf(call)
		await begin({ ...call, rosterBlock }, token)
	}
}
