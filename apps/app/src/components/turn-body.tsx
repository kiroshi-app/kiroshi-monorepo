import { useContext } from "react"

import { Markdown, type MarkdownProps } from "@workspace/ui/components/markdown"
import { MessageAttachments } from "@workspace/ui/components/message-attachments"

import { AnswerActionsContext } from "@/lib/chat/answer-actions"
import type { MessageContent } from "@/lib/chat/message-attachments"
import { openAttachment } from "@/lib/links/open-attachment"
import { openWebPage } from "@/lib/links/open-web-page"

type TurnBodyProps = MessageContent &
	Pick<MarkdownProps, "answerActions" | "isWriting">

export const TurnBody = ({
	attachments,
	text,
	answerActions,
	isWriting,
}: TurnBodyProps) => (
	<>
		<MessageAttachments items={attachments} onOpen={openAttachment} />
		{text ? (
			<Markdown answerActions={answerActions} isWriting={isWriting}>
				{text}
			</Markdown>
		) : null}
	</>
)

type AnswerBodyProps = MessageContent & {
	agentName: string
	isWriting: boolean
}

export const AnswerBody = ({
	attachments,
	text,
	agentName,
	isWriting,
}: AnswerBodyProps) => {
	const actions = useContext(AnswerActionsContext)

	if (!actions) {
		return (
			<TurnBody attachments={attachments} isWriting={isWriting} text={text} />
		)
	}

	return (
		<TurnBody
			answerActions={{
				agentName,
				onPickOption: actions.insert,
				onUseValues: actions.insert,
				onOpenImage: actions.openImage,
				onOpenWebPage: openWebPage,
			}}
			attachments={attachments}
			isWriting={isWriting}
			text={text}
		/>
	)
}
