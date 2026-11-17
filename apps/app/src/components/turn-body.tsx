import { useContext } from "react"

import {
	type ImageMenuActions,
	imageMenuActionsFor,
} from "@workspace/ui/components/image-menu"
import { Markdown, type MarkdownProps } from "@workspace/ui/components/markdown"
import type { MarkdownAnswerActions } from "@workspace/ui/components/markdown/answer-actions"
import type { MarkdownAttachments } from "@workspace/ui/components/markdown/attachments"
import {
	type MessageAttachment,
	MessageAttachments,
} from "@workspace/ui/components/message-attachments"

import { LiveHtmlBlock } from "@/components/live-html-block"
import {
	type AnswerActions,
	AnswerActionsContext,
	type ThreadImage,
} from "@/lib/chat/answer-actions"
import {
	citedAttachmentOf,
	citesStoredAttachment,
	type MessageContent,
	resolveCitedImage,
} from "@/lib/chat/message-attachments"
import { answerTableSaverOf } from "@/lib/chat/save-answer-table"
import { showsLiveHtml } from "@/lib/host"
import { openAttachment } from "@/lib/links/open-attachment"
import { openWebPage } from "@/lib/links/open-web-page"
import { withHtmlBlock } from "@/lib/live-html/live-html-ui-shapes"

type LibraryReferences = Pick<
	MarkdownProps,
	"runs" | "renderRun" | "renderBoardLink"
>

type TurnBodyProps = MessageContent &
	LibraryReferences &
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

const attachmentOpener = (
	attachments: MessageAttachment[],
	{ openImage }: AnswerActions,
) => {
	const images = viewerImagesOf(attachments)
	return (id: string) => {
		const index = images.findIndex((image) => image.id === id)
		if (index === -1) {
			openAttachment(id)
			return
		}
		openImage(images, index)
	}
}

const openerOf = (
	attachments: MessageAttachment[],
	actions: AnswerActions | null,
) => (actions ? attachmentOpener(attachments, actions) : openAttachment)

const citedAttachmentOpener =
	(actions: AnswerActions | null) => (path: string) => {
		const attachment = citedAttachmentOf(path)
		if (attachment) {
			openerOf([attachment], actions)(path)
		}
	}

const citedAttachmentsOf = (
	text: string,
	actions: AnswerActions | null,
): MarkdownAttachments =>
	citesStoredAttachment(text)
		? {
				onOpenAttachment: citedAttachmentOpener(actions),
				resolveAttachment: resolveCitedImage,
			}
		: {}

export const TurnBody = ({
	attachments,
	text,
	answerActions,
	isWriting,
	runs,
	renderRun,
	renderBoardLink,
}: TurnBodyProps) => {
	const actions = useContext(AnswerActionsContext)

	return (
		<>
			<MessageAttachments
				imageMenu={
					actions ? attachmentImageMenu(attachments, actions) : undefined
				}
				items={attachments}
				onOpen={openerOf(attachments, actions)}
			/>
			{text ? (
				<Markdown
					answerActions={answerActions}
					isWriting={isWriting}
					renderBoardLink={renderBoardLink}
					renderRun={renderRun}
					runs={runs}
					{...citedAttachmentsOf(text, actions)}
				>
					{text}
				</Markdown>
			) : null}
		</>
	)
}

const renderLiveHtmlBlock = (source: string) => <LiveHtmlBlock html={source} />

const withLiveHtmlWhenWritten = (
	answerActions: MarkdownAnswerActions,
	isWriting: boolean,
) =>
	isWriting || !showsLiveHtml()
		? answerActions
		: withHtmlBlock(answerActions, renderLiveHtmlBlock)

type AnswerBodyProps = MessageContent &
	LibraryReferences & {
		agentName: string
		isWriting: boolean
	}

export const AnswerBody = ({
	attachments,
	text,
	agentName,
	isWriting,
	runs,
	renderRun,
	renderBoardLink,
}: AnswerBodyProps) => {
	const actions = useContext(AnswerActionsContext)

	if (!actions) {
		return (
			<TurnBody
				attachments={attachments}
				isWriting={isWriting}
				renderBoardLink={renderBoardLink}
				renderRun={renderRun}
				runs={runs}
				text={text}
			/>
		)
	}

	return (
		<TurnBody
			answerActions={withLiveHtmlWhenWritten(
				{
					agentName,
					onUseValues: actions.insert,
					onOpenImage: actions.openImage,
					onOpenWebPage: openWebPage,
					onDownloadTable: answerTableSaverOf(agentName),
					imageMenu: actions.imageActions,
					isSavingImage: actions.imageActions.isSavingImage,
				},
				isWriting,
			)}
			attachments={attachments}
			isWriting={isWriting}
			renderBoardLink={renderBoardLink}
			renderRun={renderRun}
			runs={runs}
			text={text}
		/>
	)
}
