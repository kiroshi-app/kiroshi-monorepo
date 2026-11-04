import { useContext } from "react"

import {
	type ImageMenuActions,
	imageMenuActionsFor,
} from "@workspace/ui/components/image-menu"
import { Markdown, type MarkdownProps } from "@workspace/ui/components/markdown"
import {
	type MessageAttachment,
	MessageAttachments,
} from "@workspace/ui/components/message-attachments"

import {
	type AnswerActions,
	AnswerActionsContext,
	type ThreadImage,
} from "@/lib/chat/answer-actions"
import type { MessageContent } from "@/lib/chat/message-attachments"
import { openAttachment } from "@/lib/links/open-attachment"
import { openWebPage } from "@/lib/links/open-web-page"

type TurnBodyProps = MessageContent &
	Pick<MarkdownProps, "answerActions" | "isWriting">

const viewerImagesOf = (attachments: MessageAttachment[]): ThreadImage[] =>
	attachments.flatMap(({ id, name, previewUrl }) =>
		previewUrl ? [{ id, name, src: previewUrl, detail: "", path: id }] : [],
	)

const attachmentImageMenu = (
	attachments: MessageAttachment[],
	{ openImage, imageActions }: AnswerActions,
): ImageMenuActions<string> => {
	const images = viewerImagesOf(attachments)
	const imageOf = (id: string) =>
		images[images.findIndex((image) => image.id === id)]
	return imageMenuActionsFor(
		{
			...imageActions,
			onOpenInViewer: (image) => openImage(images, images.indexOf(image)),
		},
		imageOf,
	)
}

export const TurnBody = ({
	attachments,
	text,
	answerActions,
	isWriting,
}: TurnBodyProps) => {
	const actions = useContext(AnswerActionsContext)

	return (
		<>
			<MessageAttachments
				imageMenu={
					actions ? attachmentImageMenu(attachments, actions) : undefined
				}
				items={attachments}
				onOpen={openAttachment}
			/>
			{text ? (
				<Markdown answerActions={answerActions} isWriting={isWriting}>
					{text}
				</Markdown>
			) : null}
		</>
	)
}

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
				imageMenu: actions.imageActions,
			}}
			attachments={attachments}
			isWriting={isWriting}
			text={text}
		/>
	)
}
