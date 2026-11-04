import { memo, type ReactNode, useContext } from "react"

import type { MessageAuthor } from "@workspace/ui/components/message"
import type { QuotedMessage } from "@workspace/ui/components/message-quote"
import { MessageSelection } from "@workspace/ui/components/message-selection"
import {
	AssistantTurn,
	PersonTurn,
	type TurnCause,
	TurnGroup,
	type TurnRun,
	type TurnState,
	UserTurn,
} from "@workspace/ui/components/turn"
import { probeRender } from "@workspace/ui/lib/render-probe"

import {
	ThreadDocumentCards,
	ThreadDocumentsContext,
} from "@/components/thread-documents"
import { AnswerBody, TurnBody } from "@/components/turn-body"
import { copySelection } from "@/lib/chat/copy-selection"
import { messageWithAttachments } from "@/lib/chat/message-attachments"
import type { ReplyTarget, TranscriptRow } from "@/lib/chat/screen-model"
import { usePersonOf } from "@/lib/chat/thread-authorship"
import type { ThreadFace } from "@/lib/chat/thread-contract"
import type { RefusedMessage } from "@/lib/conversations/conversation-controller"

type ThreadTurnProps = {
	row: TranscriptRow
	readerName: string
	anchor: string
	state: TurnState
	run?: TurnRun
	carriesMark?: boolean
	bare?: boolean
	botId?: string
	botName?: string
	author?: MessageAuthor
	cause?: TurnCause
	avatarFace?: ThreadFace
	card?: ReactNode
	quoted?: ReplyTarget[]
	pinned: boolean
	now: number
	toQuote: (target: ReplyTarget) => QuotedMessage
	onPin: (messageId: string) => void
	onReply: (target: ReplyTarget) => void
	onRetry?: (messageId: string) => void
}

export const ThreadTurn = memo(function ThreadTurn({
	row,
	readerName,
	anchor,
	state,
	run,
	carriesMark,
	bare,
	botId,
	botName,
	author,
	cause,
	avatarFace,
	card,
	quoted,
	pinned,
	now,
	toQuote,
	onPin,
	onReply,
	onRetry,
}: ThreadTurnProps) {
	probeRender("ThreadTurn", anchor)
	const personOf = usePersonOf()
	const person = row.role === "user" ? personOf(row) : undefined
	const { text, attachments } = messageWithAttachments(row.text)
	const repliedTo = quoted?.map(toQuote)
	const pin = () => {
		onPin(row.messageId)
	}
	const target: ReplyTarget = {
		messageId: row.messageId,
		role: row.role,
		excerpt: text.trim(),
		authorBotId: row.authorBotId,
		authorAccountId: row.authorAccountId,
		authorName: row.authorName,
		writtenFrom: row.writtenFrom,
	}
	const saveAsDocument = useContext(ThreadDocumentsContext)?.saveAsDocument
	const isSaveable =
		card === undefined && state !== "streaming" && row.text.trim() !== ""
	const onSaveAsDocument =
		saveAsDocument && isSaveable
			? () => saveAsDocument(row.messageId)
			: undefined
	const reply = () => {
		onReply(target)
	}
	const replyToSelection = (selected: string) => {
		onReply({ ...target, excerpt: selected, isExcerpt: true })
	}
	const selectable = (body: ReactNode) =>
		card ?? (
			<MessageSelection onCopy={copySelection} onReply={replyToSelection}>
				{body}
			</MessageSelection>
		)
	const cards =
		row.documents.length > 0 ? (
			<ThreadDocumentCards names={row.documents} />
		) : null
	const withCards = (body: ReactNode) => (
		<>
			{body}
			{cards}
		</>
	)
	const content = selectable(<TurnBody attachments={attachments} text={text} />)

	if (person !== undefined) {
		return (
			<PersonTurn
				copyText={text}
				footer={cards}
				messageId={anchor}
				name={person}
				now={now}
				onPin={pin}
				onSaveAsDocument={onSaveAsDocument}
				onReply={reply}
				pinned={pinned}
				repliedTo={repliedTo}
				run={run}
				sentAt={row.timestamp}
			>
				{content}
			</PersonTurn>
		)
	}

	if (row.role === "user") {
		return (
			<UserTurn
				copyText={text}
				footer={cards}
				messageId={anchor}
				name={readerName}
				now={now}
				onPin={pin}
				onSaveAsDocument={onSaveAsDocument}
				onReply={reply}
				onRetry={onRetry ? () => onRetry(row.messageId) : undefined}
				pinned={pinned}
				repliedTo={repliedTo}
				run={run}
				sentAt={row.timestamp}
				state={state}
			>
				{content}
			</UserTurn>
		)
	}

	const isDocumentPost =
		card === undefined && cards !== null && row.text.trim() === ""
	const answer = isDocumentPost
		? cards
		: withCards(
				selectable(
					<AnswerBody
						agentName={author?.name ?? row.authorName ?? botName ?? ""}
						attachments={attachments}
						isWriting={state === "streaming"}
						text={text}
					/>,
				),
			)
	const isFramed = card !== undefined || isDocumentPost

	return (
		<AssistantTurn
			author={author}
			cause={cause}
			identity={avatarFace}
			bare={bare}
			framed={isFramed}
			botId={botId}
			carriesMark={carriesMark}
			copyText={isFramed ? "" : text}
			messageId={anchor}
			now={now}
			onPin={pin}
			onSaveAsDocument={onSaveAsDocument}
			onReply={reply}
			pinned={pinned}
			repliedTo={repliedTo}
			run={run}
			sentAt={row.timestamp}
			state={state}
		>
			{answer}
		</AssistantTurn>
	)
})

type RefusedTurnProps = {
	message: RefusedMessage
	readerName: string
	repliedTo?: QuotedMessage[]
	onSendAgain: (messageId: string) => void
}

export const RefusedTurn = ({
	message,
	readerName,
	repliedTo,
	onSendAgain,
}: RefusedTurnProps) => (
	<TurnGroup>
		<UserTurn
			copyText={message.text}
			name={readerName}
			onRetry={() => onSendAgain(message.id)}
			repliedTo={repliedTo}
			state="failed"
		>
			<TurnBody {...messageWithAttachments(message.text)} />
		</UserTurn>
	</TurnGroup>
)
