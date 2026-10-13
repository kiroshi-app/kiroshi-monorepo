import {
	detailOf,
	type LiveMissionRun,
	type MissionRunBook,
	STATUS_CAUSE,
} from "./mission-run-book"
import type { MissionRunCall } from "./mission-run-prompt"
import { isClosed } from "./mission-run-settle"

import type { ScopedEvent, TransportError, TurnEnded } from "../agent/contract"
import { needsFreshSession } from "../chat/screen-model"

type MissionRunRouteOptions = {
	book: MissionRunBook
	run: (call: MissionRunCall) => Promise<boolean>
	settle: (held: LiveMissionRun, ended: TurnEnded) => Promise<void>
}

export const createMissionRunRoute = ({
	book,
	run,
	settle,
}: MissionRunRouteOptions) => {
	const fail = (held: LiveMissionRun, error: TransportError) => {
		if (!needsFreshSession(error)) {
			return
		}
		book.end(held)
		book.raiseFailure(`the mission run's session failed with ${error.kind}`)
	}

	const openStatusRun = async (threadConversationId: string) => {
		const missionId = book.missionIdOfThread.get(threadConversationId)

		if (
			missionId === undefined ||
			book.isStopped() ||
			book.isOnJoinedSpace() ||
			book.isBusy(missionId)
		) {
			return
		}

		book.holding.add(missionId)
		try {
			const { mission, events } = await book.readMission(missionId)

			if (isClosed(mission)) {
				return
			}

			await run({ cause: STATUS_CAUSE, mission, events })
		} catch (thrown) {
			book.raiseFailure(detailOf(thrown))
		} finally {
			book.holding.delete(missionId)
			book.takeAgain(missionId)
		}
	}

	return ({ scope, event }: ScopedEvent) => {
		const held = book.runAt(scope)

		if (!held) {
			if (scope && event.type === "turnEnded") {
				void openStatusRun(scope.conversationId)
			}
			return
		}

		switch (event.type) {
			case "turnEnded":
				return void settle(held, event.ended)
			case "failed":
				return fail(held, event.error)
			case "questionRequested":
				return void book.refuse(
					held,
					"a mission run cannot be asked a question",
				)
			case "permissionRequested":
				return void book.refuse(
					held,
					"a mission run cannot be asked a permission",
				)
			default:
				return
		}
	}
}
