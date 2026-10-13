import { type LiveMissionRun, reporting } from "./mission-run-book"
import type { MissionRunDriverOptions } from "./mission-run-driver"

export const MISSION_TRIGGER_SOURCE = "mission"

type MissionReportWriterOptions = Pick<
	MissionRunDriverOptions,
	"store" | "chat" | "runtimes"
>

export const createMissionReportWriter = ({
	store,
	chat,
	runtimes,
}: MissionReportWriterOptions) => {
	const mainChatIdOf = (botId: string) =>
		store
			.mainChat(botId)
			.then(({ id }) => id)
			.catch((reason) => {
				reporting("conversation_main_chat")(reason)
				return null
			})

	const reporterOf = async (conversationId: string, botId: string) => {
		const mainChatId = await mainChatIdOf(botId)

		return mainChatId === conversationId
			? chat
			: runtimes.runtimeFor(conversationId)
	}

	return async ({ call, scope }: LiveMissionRun, text: string) => {
		const { mission } = call
		const conversationId = mission.originConversationId
		const reporter = await reporterOf(conversationId, mission.botId)

		return reporter.reportRun({
			conversationId,
			botId: mission.botId,
			runtimeSessionId: scope.runtimeSessionId,
			text,
			routineTitle: mission.ticket.externalId,
			triggerSourceId: MISSION_TRIGGER_SOURCE,
		})
	}
}
