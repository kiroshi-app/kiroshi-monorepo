import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { ReporterFacts } from "../failure-report"
import type {
	AgentEvent,
	ChatMessage,
	RuntimeScope,
	ScopedEvent,
} from "../agent/contract"
import type { ChatDriver } from "../chat/driver"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { TranscriptStore } from "../conversations/store-port"

export type ReportRelayOptions = {
	driver: Pick<ChatDriver, "subscribe">
	store: Pick<TranscriptStore, "mainChat">
	runtimes: Pick<ConversationRuntimes, "runtimeFor">
	reportFailure: (notice: NoticeMessage, facts?: ReporterFacts) => void
}

const SEPARATOR = "\u0000"

const scopeKeyOf = ({
	conversationId,
	botId,
	runtimeSessionId,
}: RuntimeScope) => [conversationId, botId, runtimeSessionId].join(SEPARATOR)

const isUnknownBot = (thrown: unknown): boolean =>
	typeof thrown === "object" &&
	thrown !== null &&
	"kind" in thrown &&
	thrown.kind === "unknownBot"

const isFromThisComputer = (hostId?: string | null) => !hostId

export const startReportRelay = ({
	driver,
	store,
	runtimes,
	reportFailure,
}: ReportRelayOptions): (() => void) => {
	const endedRuns = new Set<string>()

	const logSkipped = (thrown: unknown) => {
		console.warn(
			"report relay: skipped a report of an agent this computer does not hold",
			thrown,
		)
	}

	const raiseFailure = (thrown: unknown) => {
		console.error("report relay:", thrown)
		reportFailure(
			{
				title: i18n.t("chat:transcript.mention.unresolved.title", { count: 1 }),
			},
			{ reason: thrown },
		)
	}

	const isMainChat = async ({ conversationId, botId }: RuntimeScope) =>
		(await store.mainChat(botId)).id === conversationId

	const relay = async (scope: RuntimeScope, message: ChatMessage) => {
		try {
			if (await isMainChat(scope)) {
				return
			}
			await runtimes
				.runtimeFor(scope.conversationId)
				.relayRunReport(scope, message)
		} catch (thrown) {
			if (isUnknownBot(thrown)) {
				logSkipped(thrown)
				return
			}
			raiseFailure(thrown)
		}
	}

	const noteRunEnded = (scope: RuntimeScope, event: AgentEvent) => {
		if (event.type === "turnEnded" && event.ended.structuredOutput) {
			endedRuns.add(scopeKeyOf(scope))
		}
	}

	const take = ({ scope, event }: ScopedEvent, hostId?: string | null) => {
		if (!scope || !isFromThisComputer(hostId)) {
			return
		}
		noteRunEnded(scope, event)
		if (
			event.type !== "messageCompleted" ||
			!endedRuns.delete(scopeKeyOf(scope))
		) {
			return
		}
		void relay(scope, event.message)
	}

	const listening = driver.subscribe(take).catch((reason) => {
		raiseFailure(reason)
		return () => undefined
	})

	return () => {
		void listening.then((stop) => stop())
	}
}
