import { notifiesMission } from "./notification-policy"
import type { NotificationSourceOptions } from "./notification-source"
import type { Deliver, Reading } from "./notification-source-delivery"
import {
	isNotifiedMissionState,
	missionNotificationWordsFor,
} from "./notification-words"

import type { Mission, MissionChanged } from "../missions/mission-contract"
import type { MissionEvent } from "../missions/mission-event-read"
import { createMissionStates } from "../missions/mission-states"

type MissionThreadTrackingOptions = Pick<
	NotificationSourceOptions,
	"missions" | "switches"
> & {
	missionThreads: Map<string, Mission>
	missionOrigins: Map<string, MissionEvent>
	currentFocus: () => boolean
	botNameOf: (botId: string) => string | undefined
	deliver: Deliver
}

const THIS_COMPUTER = null

export const createMissionThreadTracking = ({
	missions,
	switches,
	missionThreads,
	missionOrigins,
	currentFocus,
	botNameOf,
	deliver,
}: MissionThreadTrackingOptions) => {
	const missionStates = createMissionStates()

	const holdMissionThread = (mission: Mission, hostId: string | null) => {
		missionOrigins.set(mission.id, {
			missionId: mission.id,
			spaceId: mission.spaceId,
			hostId,
		})

		if (mission.closedAt === null) {
			missionThreads.set(mission.threadConversationId, mission)
			return
		}

		missionThreads.delete(mission.threadConversationId)
	}

	const missionChanged = async (
		changed: MissionChanged,
		hostId: string | null,
	) => {
		if (!missionStates.entered(changed)) {
			return
		}

		missionStates.remember(changed)

		const detail = await missions.read({ ...changed, hostId })

		if (!detail) {
			return
		}

		const { mission } = detail
		holdMissionThread(mission, hostId)

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
			holdMissionThread(mission, THIS_COMPUTER)
		}
	}

	return { missionChanged, catchUpOnMissionThreads }
}
