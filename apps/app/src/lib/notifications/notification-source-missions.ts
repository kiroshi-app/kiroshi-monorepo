import { notifiesMission } from "./notification-policy"
import type { NotificationSourceOptions } from "./notification-source"
import type { Deliver, Reading } from "./notification-source-delivery"
import {
	isNotifiedMissionState,
	missionNotificationWordsFor,
} from "./notification-words"

import type { Mission, MissionChanged } from "../missions/mission-contract"
import {
	type MissionEvent,
	THIS_COMPUTER,
} from "../missions/mission-event-read"
import { createMissionStates } from "../missions/mission-states"
import { missionStateOf } from "../missions/missions-model"

type MissionThreadTrackingOptions = Pick<
	NotificationSourceOptions,
	"missions" | "switches"
> & {
	missionOrigins: Map<string, MissionEvent>
	currentFocus: () => boolean
	botNameOf: (botId: string) => string | undefined
	deliver: Deliver
}

export const createMissionThreadTracking = ({
	missions,
	switches,
	missionOrigins,
	currentFocus,
	botNameOf,
	deliver,
}: MissionThreadTrackingOptions) => {
	const missionStates = createMissionStates()

	const holdMissionOrigin = (mission: Mission, hostId: string | null) => {
		missionOrigins.set(mission.id, {
			missionId: mission.id,
			spaceId: mission.spaceId,
			hostId,
		})
	}

	const missionChanged = async (
		changed: MissionChanged,
		hostId: string | null,
	) => {
		const standing = {
			missionId: changed.missionId,
			state: missionStateOf(changed),
		}

		if (!missionStates.entered(standing)) {
			return
		}

		missionStates.remember(standing)

		const detail = await missions.read({ ...changed, hostId })

		if (!detail) {
			return
		}

		const { mission } = detail
		holdMissionOrigin(mission, hostId)

		const { state } = standing

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

	const catchUpOnMissionOrigins = async () => {
		for (const { mission } of await missions.board()) {
			holdMissionOrigin(mission, THIS_COMPUTER)
		}
	}

	return { missionChanged, catchUpOnMissionOrigins }
}
