import { useCallback, useMemo, useRef, useState } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import type { HomeSend } from "@/components/home-screen"
import {
	describeAttachmentError,
	NO_ATTACHMENTS,
	NO_DOCUMENTS,
} from "@/lib/chat/attachments"
import type {
	AttachmentStoreError,
	AttachmentsOwner,
} from "@/lib/chat/attachments-contract"
import {
	type AttachmentsController,
	ownerKey,
} from "@/lib/chat/attachments-controller"
import type { DraftsController } from "@/lib/chat/drafts-controller"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import type { Conversation } from "@/lib/conversations/store-contract"
import { failureReporterIn } from "@/lib/failure-report"
import { useControllerState } from "@/lib/use-controller"

export type HomeConversationStart = {
	startConversation: (botIds: string[]) => Promise<Conversation | null>
	discardConversation: (conversationId: string) => Promise<void>
	openConversation: (conversationId: string) => void
}

type HomeSendOptions = HomeConversationStart & {
	agentId: string
	spaceId: string | null
	attachments: AttachmentsController
	drafts: DraftsController
	runtimes: ConversationRuntimes
}

const reportUnsent = failureReporterIn("use-home-send")

const raiseUnsent = (reason?: unknown) => {
	void reportUnsent(
		{
			title: i18n.t("chat:home.failure.send.title"),
			description: i18n.t("chat:home.failure.send.description"),
		},
		{ reason },
	)
}

const raiseRefused = (refusal: AttachmentStoreError) => {
	void reportUnsent({
		title: i18n.t("chat:screen.attachmentsRefused"),
		description: describeAttachmentError(i18n.getFixedT(null, "chat"), refusal),
	})
}

export const useHomeSend = ({
	agentId,
	spaceId,
	attachments,
	drafts,
	runtimes,
	startConversation,
	discardConversation,
	openConversation,
}: HomeSendOptions): HomeSend => {
	const owner = useMemo<AttachmentsOwner>(
		() => ({ kind: "home", id: spaceId ?? "" }),
		[spaceId],
	)
	const homeKey = ownerKey(owner)
	const { staged, documents } = useControllerState(attachments)
	const isSendRunning = useRef(false)
	const [isSending, setIsSending] = useState(false)
	const [draft, setDraft] = useState(() => drafts.read(homeKey))

	const stage = useCallback(
		(files: File[]) => attachments.stage(owner, files),
		[attachments, owner],
	)

	const changeDraft = (next: string) => {
		setDraft(next)
		drafts.remember(homeKey, next)
	}

	const deliverTo = async (conversation: Conversation, text: string) => {
		await runtimes.runtimeFor(conversation.id).open(conversation)
		return attachments.submitTo(
			owner,
			{ kind: "conversation", id: conversation.id },
			text,
		)
	}

	const deliverOrDiscard = async (conversation: Conversation, text: string) => {
		try {
			const isSent = await deliverTo(conversation, text)
			if (!isSent) {
				await discardConversation(conversation.id)
			}
			return isSent
		} catch (reason) {
			await discardConversation(conversation.id)
			throw reason
		}
	}

	const sendInNewConversation = async (text: string) => {
		const conversation = await startConversation([agentId])
		if (!conversation) {
			return null
		}
		const isSent = await deliverOrDiscard(conversation, text)
		return isSent ? conversation.id : null
	}

	const takeRefusal = () => {
		const refusal = attachments.getState().refusals[homeKey] ?? null
		attachments.dismissRefusal(owner)
		return refusal
	}

	const raiseFailure = (reason?: unknown) => {
		const refusal = takeRefusal()
		if (refusal) {
			raiseRefused(refusal)
			return
		}
		raiseUnsent(reason)
	}

	const clearDraftIfUnchanged = (sentDraft: string) => {
		if (drafts.read(homeKey) === sentDraft) {
			changeDraft("")
		}
	}

	const openSent = async (text: string) => {
		const sentDraft = drafts.read(homeKey)
		const conversationId = await sendInNewConversation(text)
		if (!conversationId) {
			raiseFailure()
			return
		}
		clearDraftIfUnchanged(sentDraft)
		openConversation(conversationId)
	}

	const send = async (text: string) => {
		isSendRunning.current = true
		setIsSending(true)
		try {
			await openSent(text)
		} catch (reason) {
			console.error("home send:", reason)
			raiseFailure(reason)
		} finally {
			isSendRunning.current = false
			setIsSending(false)
		}
	}

	return {
		draft,
		onDraftChange: changeDraft,
		isSending,
		onSubmit: (text) => {
			if (!isSendRunning.current) {
				void send(text)
			}
		},
		onAttach: stage,
		onStageDocument: (document) => attachments.stageDocument(owner, document),
		attachments: [
			...(staged[homeKey] ?? NO_ATTACHMENTS),
			...(documents[homeKey] ?? NO_DOCUMENTS),
		],
		onRemoveAttachment: (id) => attachments.remove(owner, id),
	}
}
