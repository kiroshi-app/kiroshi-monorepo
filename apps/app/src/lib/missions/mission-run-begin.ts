import { detailOf, type MissionRunBook, reporting } from "./mission-run-book"
import type { MissionRunDriverOptions } from "./mission-run-driver"
import { MISSION_RUN_OUTPUT_SCHEMA } from "./mission-run-output"
import { type MissionRunCall, missionRunPromptFor } from "./mission-run-prompt"

export const RUN_DEADLINE_MS = 30 * 60_000

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

	const begin = async (call: MissionRunCall) => {
		const { id } = call.mission
		try {
			const scope = await openScope(call)
			book.live.set(id, {
				call,
				scope,
				deadline: setTimeout(() => void book.expire(id), RUN_DEADLINE_MS),
			})
			await driver.startOrResumeSession(
				scope,
				undefined,
				undefined,
				MISSION_RUN_OUTPUT_SCHEMA,
			)
			await driver.submitPrompt(scope, missionRunPromptFor(call))
		} catch (thrown) {
			const held = book.live.get(id)
			if (held) {
				book.end(held)
			}
			throw new Error(`the mission run could not start: ${detailOf(thrown)}`)
		}
	}

	return async (call: MissionRunCall) => {
		const rosterBlock = await rosterBlockOf(call)
		await begin({ ...call, rosterBlock })
	}
}
