import type { AttachmentsPort } from "./attachments-controller"
import type { ChatController } from "./chat-controller"
import type { ChatDriver } from "./driver"

import type { ConversationRuntimes } from "../conversations/conversation-runtimes"

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

	send: (owner, text, replyLinks) => {
		if (owner.kind === "bot") {
			void chat.sendTo(owner.id, text, replyLinks)
			return true
		}
		const runtime = runtimes.heldFor(owner.id)
		if (!runtime) {
			return false
		}
		void runtime.send(text, replyLinks)
		return true
	},
})
