import { i18n } from "@workspace/ui/lib/i18n"

import type { AttachmentsPort } from "./attachments-controller"
import type { ChatController } from "./chat-controller"
import type { ChatDriver } from "./driver"

import { failureReporterIn } from "../failure-report"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"

const reportUnsent = failureReporterIn("attachments-port")

export type AttachmentsHosts = {
	chat: Pick<ChatController, "storeAttachments" | "sendTo">
	driver: Pick<ChatDriver, "storeAttachments">
	runtimes: Pick<ConversationRuntimes, "heldFor">
}

export const createAttachmentsPort = ({
	chat,
	driver,
	runtimes,
}: AttachmentsHosts): AttachmentsPort => ({
	store: (owner, attachments) =>
		owner.kind === "bot"
			? chat.storeAttachments(owner.id, attachments)
			: driver.storeAttachments(owner.id, attachments),

	send: (owner, text, replyLinks, documents) => {
		if (owner.kind === "bot") {
			void chat
				.sendTo(owner.id, text, replyLinks, documents)
				.catch((reason: unknown) =>
					reportUnsent(
						{ title: i18n.t("chat:screen.notice.failed") },
						{ reason, botId: owner.id },
					),
				)
			return true
		}
		const runtime = runtimes.heldFor(owner.id)
		return runtime ? runtime.send(text, replyLinks, documents) : false
	},
})
