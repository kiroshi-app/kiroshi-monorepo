import type {
	Mission,
	MissionChanged,
	MissionDetail,
	MissionState,
} from "./mission-contract"
import type { createMissionRunBegin } from "./mission-run-begin"
import { detailOf, type MissionRunBook } from "./mission-run-book"
import type { MissionRunDriverOptions } from "./mission-run-driver"
import type { MissionRunCause } from "./mission-run-prompt"
import {
	isSummonedMissionState,
	missionSummonsFor,
	type SummonedMissionState,
} from "./mission-summons"
import { toMissionConversation } from "./mission-thread-model"

import type { ConversationController } from "../conversations/conversation-controller"

type MissionRunTakeOptions = Pick<
	MissionRunDriverOptions,
	"store" | "runtimes" | "missions"
> & {
	book: MissionRunBook
	run: ReturnType<typeof createMissionRunBegin>
}

const CAUSE_OF_STATE: Partial<Record<MissionState, MissionRunCause>> = {
	done: "done",
	failed: "failed",
}

export const isTakenState = (state: MissionState) =>
	isSummonedMissionState(state) || Boolean(CAUSE_OF_STATE[state])

const carriesNoMessage = (thread: ConversationController) =>
	thread.getState().messages.length === 0

const isSummonsDue = (
	state: SummonedMissionState,
	thread: ConversationController,
) => state === "waiting_bot" || carriesNoMessage(thread)

export const createMissionRunTake = ({
	store,
	runtimes,
	missions,
	book,
	run,
}: MissionRunTakeOptions) => {
	const readBot = async (botId: string) => {
		try {
			const seated = (await store.bots()).find(({ id }) => id === botId)

			if (!seated) {
				throw new Error(`no bot answers ${botId}`)
			}

			return seated
		} catch (thrown) {
			throw new Error(`the mission bot could not be read: ${detailOf(thrown)}`)
		}
	}

	const summon = async (mission: Mission, state: SummonedMissionState) => {
		const bot = await readBot(mission.botId)
		const thread = runtimes.runtimeFor(mission.threadConversationId)
		await thread.open(toMissionConversation({ mission, bot }))

		if (isSummonsDue(state, thread)) {
			await thread.send(missionSummonsFor(state))
		}
	}

	const answerWhenAsked = async (mission: Mission) => {
		if (mission.state !== "waiting_bot") {
			return
		}

		try {
			await missions.answered(mission.id, mission.stateSeq)
		} catch (thrown) {
			book.raiseFailure(`the answer could not be recorded: ${detailOf(thrown)}`)
		}
	}

	const take = async ({
		mission,
		events,
	}: MissionDetail): Promise<MissionState | null> => {
		if (isSummonedMissionState(mission.state)) {
			await summon(mission, mission.state)
			await answerWhenAsked(mission)
			return mission.state
		}

		const cause = CAUSE_OF_STATE[mission.state]

		if (!cause) {
			return null
		}

		await run({ cause, mission, events })
		return mission.state
	}

	return async (changed: MissionChanged) => {
		if (book.isBusy(changed.missionId)) {
			book.kept.set(changed.missionId, changed)
			return
		}

		if (book.seqs.handled(changed.missionId, changed.stateSeq)) {
			return
		}

		if (!isTakenState(changed.state)) {
			book.seqs.remember(changed.missionId, changed.stateSeq)
			return
		}

		book.holding.add(changed.missionId)
		try {
			const detail = await book.readMission(changed.missionId)
			book.rememberThread(detail.mission)

			if (await take(detail)) {
				book.seqs.remember(changed.missionId, detail.mission.stateSeq)
			}
		} catch (thrown) {
			book.raiseFailure(detailOf(thrown))
		} finally {
			book.holding.delete(changed.missionId)
			book.takeAgain(changed.missionId)
		}
	}
}
