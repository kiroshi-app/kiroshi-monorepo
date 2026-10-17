import type { NotificationTarget } from "./notification-port"
import type { NotificationSourceOptions } from "./notification-source"
import type { FailWith } from "./notification-source-failures"

import { isHostOffline } from "../host/host-offline"
import type { Mission } from "../missions/mission-contract"
import {
	type MissionEvent,
	THIS_COMPUTER,
} from "../missions/mission-event-read"
import {
	isJoinedRowId,
	joinedRowIdOf,
} from "../spaces/joined-spaces-controller"

type NotificationLandingOptions = Pick<
	NotificationSourceOptions,
	"chat" | "roster" | "spaces" | "joinedSpaces" | "missions" | "raiseWindow"
> & {
	missionOrigins: Map<string, MissionEvent>
	failWith: FailWith
}

const logOfflineMission = (
	{ missionId, spaceId }: MissionEvent,
	hostId: string,
) => {
	console.info(
		[
			"notifications: the host of the clicked mission is offline",
			`mission: ${missionId}`,
			`space: ${spaceId ?? "none"}`,
			`side: ${hostId}`,
		].join(" | "),
	)
}

export const createNotificationLanding = ({
	chat,
	roster,
	spaces,
	joinedSpaces,
	missions,
	missionOrigins,
	raiseWindow,
	failWith,
}: NotificationLandingOptions) => {
	const spaceOfBotThread = (botId: string) => {
		const { conversationId } = chat.stateFor(botId)
		return conversationId
			? roster.spaceOfConversation(conversationId)
			: undefined
	}

	const originOf = (missionId: string): MissionEvent =>
		missionOrigins.get(missionId) ?? {
			missionId,
			spaceId: null,
			hostId: THIS_COMPUTER,
		}

	const localRowOf = (mission: Mission) => {
		const rowId = roster.spaceOfConversation(mission.originConversationId)
		return rowId && !isJoinedRowId(rowId) ? rowId : undefined
	}

	const landingRowOf = (hostId: string | null, mission: Mission) =>
		hostId === THIS_COMPUTER
			? (localRowOf(mission) ?? mission.spaceId)
			: joinedRowIdOf(hostId)

	const isHeldJoinedRow = (rowId: string) =>
		joinedSpaces
			.getState()
			.joinedSpaces.some((joined) => joinedRowIdOf(joined.id) === rowId)

	const landOnSpace = (rowId: string) => {
		if (!isJoinedRowId(rowId) || isHeldJoinedRow(rowId)) {
			joinedSpaces.selectSpace(rowId)
		}
	}

	const landOnOfflineHost = (origin: MissionEvent, reason: unknown) => {
		if (origin.hostId === THIS_COMPUTER || !isHostOffline(reason)) {
			throw reason
		}
		landOnSpace(joinedRowIdOf(origin.hostId))
		logOfflineMission(origin, origin.hostId)
		return null
	}

	const openMission = async (missionId: string) => {
		const origin = originOf(missionId)
		const detail = await missions
			.read(origin)
			.catch((reason: unknown) => landOnOfflineHost(origin, reason))

		if (!detail) {
			return
		}

		const { mission } = detail
		const rowId = landingRowOf(origin.hostId, mission)

		if (!rowId) {
			return
		}

		if (roster.spaceOfConversation(mission.originConversationId) !== rowId) {
			return landOnSpace(rowId)
		}

		roster.select(mission.botId)
		landOnSpace(rowId)
		missions.open({ missionId, rowId: mission.botId, spaceId: rowId })
	}

	const windowRaised = (): Promise<void> => {
		try {
			return raiseWindow()
		} catch (reason) {
			return Promise.reject(reason)
		}
	}

	const landOnBot = (botId: string) => {
		const spaceId = spaceOfBotThread(botId)

		if (!spaceId) {
			return
		}

		roster.select(botId)
		spaces.select(roster.hostSpaceIdOf(spaceId))
	}

	const landOnConversation = (conversationId: string) => {
		const spaceId = roster.spaceOfConversation(conversationId)

		if (!spaceId) {
			return
		}

		roster.selectConversation(conversationId)
		spaces.select(roster.hostSpaceIdOf(spaceId))
	}

	return ({ kind, id }: NotificationTarget) => {
		void windowRaised().catch(failWith("reveal"))

		if (kind === "mission") {
			return void openMission(id).catch(failWith("clicks"))
		}

		if (kind === "bot") {
			return landOnBot(id)
		}

		landOnConversation(id)
	}
}
