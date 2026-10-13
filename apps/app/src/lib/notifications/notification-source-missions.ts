import { notifiesMission } from "./notification-policy"
import type { NotificationSourceOptions } from "./notification-source"
import type { Deliver, Reading } from "./notification-source-delivery"
import {
	isNotifiedMissionState,
	missionNotificationWordsFor,
} from "./notification-words"

import type { Mission, MissionChanged } from "../missions/mission-contract"
import { createMissionStates } from "../missions/mission-states"

type MissionThreadTrackingOptions = Pick<
	NotificationSourceOptions,
	"missions" | "switches"
> & {
	missionThreads: Map<string, Mission>
	currentFocus: () => boolean
	botNameOf: (botId: string) => string | undefined
	deliver: Deliver
}

export const createMissionThreadTracking = ({
	missions,
	switches,
	missionThreads,
	currentFocus,
	botNameOf,
	deliver,
}: MissionThreadTrackingOptions) => {
	const missionStates = createMissionStates()

	const holdMissionThread = (mission: Mission) => {
		if (mission.closedAt === null) {
			missionThreads.set(mission.threadConversationId, mission)
			return
		}

		missionThreads.delete(mission.threadConversationId)
	}

	const missionChanged = async (changed: MissionChanged) => {
		if (!missionStates.entered(changed)) {
			return
		}

		missionStates.remember(changed)

		const { mission } = await missions.detail(changed.missionId)
		holdMissionThread(mission)

		const { state } = changed

		if (!isNotifiedMissionState(state)) {
			return
		}

		const reading: Reading = {
			switches: switches(),
			hasFocus: currentFocus(),
		}

		if (!notifiesMission({ state, ...reading })) {
			return
		}

		const name = botNameOf(mission.botId)

		if (!name) {
			return
		}

		deliver(
			[
				{
					target: { kind: "mission", id: mission.id },
					...missionNotificationWordsFor({
						name,
						ticket: mission.ticket.externalId,
						state,
					}),
				},
			],
			reading,
		)
	}

	const catchUpOnMissionThreads = async () => {
		for (const { mission } of await missions.board()) {
			holdMissionThread(mission)
		}
	}

	return { missionChanged, catchUpOnMissionThreads }
}
