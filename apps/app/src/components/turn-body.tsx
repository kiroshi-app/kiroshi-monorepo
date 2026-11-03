import { useContext } from "react"

import { Markdown } from "@workspace/ui/components/markdown"
import { MessageAttachments } from "@workspace/ui/components/message-attachments"
import { QuotableAnswer } from "@workspace/ui/components/quotable-answer"

import { AnswerActionsContext } from "@/lib/chat/answer-actions"
import type { MessageContent } from "@/lib/chat/message-attachments"
import { openAttachment } from "@/lib/links/open-attachment"

export const TurnBody = ({ attachments, text }: MessageContent) => (
	<>
		<MessageAttachments items={attachments} onOpen={openAttachment} />
		{text ? <Markdown>{text}</Markdown> : null}
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
	const body = (
		<>
			<MessageAttachments items={attachments} onOpen={openAttachment} />
			{text ? (
				<Markdown
					answerActions={
						actions
							? {
									agentName,
									onPickOption: actions.insert,
									onUseValues: actions.insert,
									onOpenImage: actions.openImage,
								}
							: undefined
					}
					isWriting={isWriting}
				>
					{text}
				</Markdown>
			) : null}
		</>
	)

	if (!actions) return body

	return (
		<QuotableAnswer
			onQuote={(quote) => actions.quote({ agentName, text: quote })}
		>
			{body}
		</QuotableAnswer>
	)
}
