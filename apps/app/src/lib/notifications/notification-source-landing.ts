import type { NotificationTarget } from "./notification-port"
import type { NotificationSourceOptions } from "./notification-source"
import type { FailWith } from "./notification-source-failures"

type NotificationLandingOptions = Pick<
	NotificationSourceOptions,
	"chat" | "roster" | "spaces" | "missions" | "raiseWindow"
> & {
	missionSpaces: Map<string, string | null>
	failWith: FailWith
}

export const createNotificationLanding = ({
	chat,
	roster,
	spaces,
	missions,
	missionSpaces,
	raiseWindow,
	failWith,
}: NotificationLandingOptions) => {
	const spaceOfBotThread = (botId: string) => {
		const { conversationId } = chat.stateFor(botId)
		return conversationId
			? roster.spaceOfConversation(conversationId)
			: undefined
	}

	const openMission = async (missionId: string) => {
		const detail = await missions.read({
			missionId,
			spaceId: missionSpaces.get(missionId) ?? null,
		})

		if (!detail) {
			return
		}

		const { mission } = detail
		const spaceId = roster.spaceOfConversation(mission.originConversationId)

		if (!spaceId) {
			return
		}

		roster.select(mission.botId)
		spaces.select(roster.hostSpaceIdOf(spaceId))
		missions.open({ missionId, rowId: mission.botId, spaceId })
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
