import { useMemo, useRef, useState } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import type { HomeSend } from "@/components/home-screen"
import type { AttachmentsOwner } from "@/lib/chat/attachments-contract"
import type { AttachmentsController } from "@/lib/chat/attachments-controller"
import type { DraftsController } from "@/lib/chat/drafts-controller"
import { useAttachments } from "@/lib/chat/use-attachments"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import type { Conversation } from "@/lib/conversations/store-contract"
import { failureReporterIn } from "@/lib/failure-report"

export type HomeConversationStart = {
	startConversation: (botIds: string[]) => Promise<Conversation | null>
	openConversation: (conversationId: string) => void
}

type HomeSendOptions = HomeConversationStart & {
	agentId: string
	attachments: AttachmentsController
	drafts: DraftsController
	runtimes: ConversationRuntimes
}

const NO_DROP_ZONE = { current: null }

const reportUnsent = failureReporterIn("use-home-send")

const raiseUnsent = () => {
	void reportUnsent({
		title: i18n.t("chat:home.failure.send.title"),
		description: i18n.t("chat:home.failure.send.description"),
	})
}

export const useHomeSend = ({
	agentId,
	attachments,
	drafts,
	runtimes,
	startConversation,
	openConversation,
}: HomeSendOptions): HomeSend => {
	const owner = useMemo<AttachmentsOwner>(
		() => ({ kind: "bot", id: agentId }),
		[agentId],
	)
	const staged = useAttachments(attachments, owner, true, NO_DROP_ZONE)
	const isSending = useRef(false)
	const [draft, setDraft] = useState(() => drafts.read(agentId))

	const changeDraft = (next: string) => {
		setDraft(next)
		drafts.remember(agentId, next)
	}

	const sendInNewConversation = async (text: string) => {
		const conversation = await startConversation([agentId])
		if (!conversation) {
			return null
		}
		await runtimes.runtimeFor(conversation.id).open(conversation)
		const isSent = await attachments.submitTo(
			owner,
			{ kind: "conversation", id: conversation.id },
			text,
		)
		return isSent ? conversation.id : null
	}

	const openSent = async (text: string) => {
		const conversationId = await sendInNewConversation(text)
		if (!conversationId) {
			raiseUnsent()
			return
		}
		changeDraft("")
		openConversation(conversationId)
	}

	const send = async (text: string) => {
		isSending.current = true
		try {
			await openSent(text)
		} catch (reason) {
			console.error("home send:", reason)
			raiseUnsent()
		} finally {
			isSending.current = false
		}
	}

	return {
		draft,
		onDraftChange: changeDraft,
		onSubmit: (text) => {
			if (!isSending.current) {
				void send(text)
			}
		},
		onAttach: staged.stage,
		attachments: [...staged.items, ...staged.documents],
		onRemoveAttachment: staged.remove,
	}
}
