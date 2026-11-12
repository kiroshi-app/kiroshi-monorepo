import { useQuery } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import { botQueryKeys } from "./bot-query-keys"

import type { AgentCommand } from "../agent/contract"
import type { TranscriptStore } from "../conversations/store-port"

const NO_COMMANDS: AgentCommand[] = []

const REREAD_ON_EVERY_MOUNT = 0

export const useBotCommands = (
	store: Pick<TranscriptStore, "botCommands">,
	botId: string,
): AgentCommand[] => {
	const { data } = useQuery({
		queryKey: botQueryKeys.commandsOf(botId),
		queryFn: () => store.botCommands(botId),
		staleTime: REREAD_ON_EVERY_MOUNT,
		meta: {
			failureNotice: () => ({ title: i18n.t("chat:screen.notice.failed") }),
			raisedIn: "use-bot-commands",
		},
	})

	return data ?? NO_COMMANDS
}
