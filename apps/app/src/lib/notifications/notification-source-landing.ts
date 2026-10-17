import type { NotificationTarget } from "./notification-port"
import type { NotificationSourceOptions } from "./notification-source"
import type { FailWith } from "./notification-source-failures"
import { createPendingLandings } from "./notification-source-pending"

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

const LOCAL_SIDE = "local"

const logMissionLanding = (
	outcome: string,
	{ missionId, spaceId, hostId }: MissionEvent,
) => {
	console.info(
		[
			`notifications: ${outcome}`,
			`mission: ${missionId}`,
			`space: ${spaceId ?? "none"}`,
			`side: ${hostId ?? LOCAL_SIDE}`,
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
	const pending = createPendingLandings(roster.subscribe)

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

	const landOnOfflineHost = (
		origin: MissionEvent,
		reason: unknown,
		isCurrent: () => boolean,
	) => {
		if (origin.hostId === THIS_COMPUTER || !isHostOffline(reason)) {
			throw reason
		}
		if (isCurrent()) {
			landOnSpace(joinedRowIdOf(origin.hostId))
			logMissionLanding("the host of the clicked mission is offline", origin)
		}
		return null
	}

	const openMissionOn = (
		rowId: string,
		origin: MissionEvent,
		mission: Mission,
	) => {
		const isHeld = () =>
			roster.spaceOfConversation(mission.originConversationId) === rowId
		const openThread = () => {
			roster.select(mission.botId)
			missions.open({
				missionId: mission.id,
				rowId: mission.botId,
				spaceId: rowId,
			})
		}

		const isHeldOnLanding = isHeld()
		landOnSpace(rowId)

		if (isHeldOnLanding) {
			return openThread()
		}

		pending.wait({
			isReady: isHeld,
			land: openThread,
			giveUp: () =>
				logMissionLanding("the roster never held the clicked mission", {
					...origin,
					spaceId: mission.spaceId,
				}),
		})
	}

	const openMission = async (missionId: string, isCurrent: () => boolean) => {
		const origin = originOf(missionId)
		const detail = await missions
			.read(origin)
			.catch((reason: unknown) => landOnOfflineHost(origin, reason, isCurrent))

		if (!detail || !isCurrent()) {
			return
		}

		const { mission } = detail
		const rowId = landingRowOf(origin.hostId, mission)

		if (rowId) {
			openMissionOn(rowId, origin, mission)
		}
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

	const activate = ({ kind, id }: NotificationTarget) => {
		const isCurrent = pending.claim()
		void windowRaised().catch(failWith("reveal"))

		if (kind === "mission") {
			return void openMission(id, isCurrent).catch(failWith("clicks"))
		}

		if (kind === "bot") {
			return landOnBot(id)
		}

		landOnConversation(id)
	}

	return { activate, dropPendingLanding: pending.drop }
}
