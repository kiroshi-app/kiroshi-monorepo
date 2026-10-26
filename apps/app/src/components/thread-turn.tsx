import { memo, type ReactNode } from "react"

import type { MessageAuthor } from "@workspace/ui/components/message"
import type { QuotedMessage } from "@workspace/ui/components/message-quote"
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

import { TurnBody } from "@/components/turn-body"
import type { ChatController } from "@/lib/chat/chat-controller"
import type { OutboxEntry } from "@/lib/chat/chat-state"
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
	author?: MessageAuthor
	cause?: TurnCause
	avatarFace?: ThreadFace
	card?: ReactNode
	quoted?: ReplyTarget
	pinned: boolean
	now: number
	toQuote: (target: ReplyTarget) => QuotedMessage
	onPin: (messageId: string, blockIndex: number) => void
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
	const content = card ?? <TurnBody attachments={attachments} text={text} />
	const repliedTo = quoted ? toQuote(quoted) : undefined
	const pin = () => {
		onPin(row.messageId, row.blockIndex)
	}
	const reply = () => {
		onReply({
			messageId: row.messageId,
			role: row.role,
			excerpt: text.trim(),
			authorBotId: row.authorBotId,
			authorAccountId: row.authorAccountId,
			authorName: row.authorName,
			writtenFrom: row.writtenFrom,
		})
	}

	if (person !== undefined) {
		return (
			<PersonTurn
				copyText={text}
				messageId={anchor}
				name={person}
				now={now}
				onPin={pin}
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
				messageId={anchor}
				name={readerName}
				now={now}
				onPin={pin}
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

	return (
		<AssistantTurn
			author={author}
			cause={cause}
			identity={avatarFace}
			bare={bare}
			framed={card !== undefined}
			botId={botId}
			carriesMark={carriesMark}
			copyText={card === undefined ? text : ""}
			messageId={anchor}
			now={now}
			onPin={pin}
			onReply={reply}
			pinned={pinned}
			repliedTo={repliedTo}
			run={run}
			sentAt={row.timestamp}
			state={state}
		>
			{content}
		</AssistantTurn>
	)
})

type QueuedTurnProps = {
	entry: OutboxEntry
	controller: ChatController
	readerName: string
	run?: TurnRun
}

export const QueuedTurn = memo(function QueuedTurn({
	entry,
	controller,
	readerName,
	run,
}: QueuedTurnProps) {
	const { text, attachments } = messageWithAttachments(entry.text)

	return (
		<UserTurn
			copyText={text}
			name={readerName}
			onCancel={() => {
				controller.discard(entry.id)
			}}
			run={run}
			state="queued"
		>
			<TurnBody attachments={attachments} text={text} />
		</UserTurn>
	)
})

type RefusedTurnProps = {
	message: RefusedMessage
	readerName: string
	repliedTo?: QuotedMessage
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
