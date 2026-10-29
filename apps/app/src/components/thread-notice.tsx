import type { ReactNode } from "react"

import { Notice } from "@workspace/ui/components/notice"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { describeAttachmentError } from "@/lib/chat/attachments"
import type { AttachmentStoreError } from "@/lib/chat/attachments-contract"

type ThreadNoticeProps = {
	refusal: AttachmentStoreError | null
	onDismissRefusal: () => void
	children?: ReactNode
}

export const ThreadNotice = ({
	refusal,
	onDismissRefusal,
	children,
}: ThreadNoticeProps) => {
	const t = useChatCopy()

	if (!refusal) {
		return <>{children}</>
	}

	return (
		<Notice
			description={describeAttachmentError(t, refusal)}
			onDismiss={onDismissRefusal}
			title={t("screen.attachmentsRefused")}
			tone="warning"
		/>
	)
}

type PinsNoticeProps = {
	onDismiss: () => void
}

export const PinsNotice = ({ onDismiss }: PinsNoticeProps) => {
	const t = useChatCopy()

	return (
		<Notice
			description={t("pinned.unavailable.description")}
			onDismiss={onDismiss}
			title={t("pinned.unavailable.title")}
			tone="warning"
		/>
	)
}
