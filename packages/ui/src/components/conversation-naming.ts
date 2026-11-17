import type { TFunction } from "i18next"

type ConversationNaming = "pending" | "arrived" | "failed"

const conversationLabelOf = (
	t: TFunction<["common", "chat"]>,
	name: string,
	naming: ConversationNaming | undefined,
) => {
	if (naming === "pending") return t("chat:conversationNaming.pending")
	if (naming === "failed") return t("chat:conversationSettings.untitled")
	return name
}

export { type ConversationNaming, conversationLabelOf }
