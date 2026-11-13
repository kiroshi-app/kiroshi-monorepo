"use client"

import {
	Children,
	cloneElement,
	Fragment,
	isValidElement,
	type ReactElement,
	type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"

import {
	AuthorLine,
	type AuthorLineEnd,
	AuthorLineQueued,
} from "@workspace/ui/components/author-line"
import {
	BotIdentityAvatar,
	BotSelectButton,
} from "@workspace/ui/components/bot-identity-avatar"
import { CompanionMenuHost } from "@workspace/ui/components/companion-menu"
import { useCompanionSelect } from "@workspace/ui/components/companion-select"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import { useMarkId } from "@workspace/ui/components/mark-context"
import { MarkdownSizeContext } from "@workspace/ui/components/markdown/size"
import {
	Message,
	MessageAuthor,
	MessageClock,
	MessageFooter,
	MessageHeader,
	MessageTime,
} from "@workspace/ui/components/message"
import {
	MessageAction,
	MessageActions,
	MessageMenuItem,
} from "@workspace/ui/components/message-actions"
import {
	MessageBubble,
	MessageBubbleContent,
	MessageBubbleGroup,
} from "@workspace/ui/components/message-bubble"
import { useMessageAnchor } from "@workspace/ui/components/message-highlight-context"
import {
	MessageQuoteCard,
	type QuotedMessage,
} from "@workspace/ui/components/message-quote"
import { MessageSideContext } from "@workspace/ui/components/message-side-context"
import { SharedMark } from "@workspace/ui/components/motion/shared-mark"
import type { RosterBot } from "@workspace/ui/components/roster"
import { Button } from "@workspace/ui/components/ui/button"
import { ContextMenuSeparator } from "@workspace/ui/components/ui/context-menu"
import { useCopyText } from "@workspace/ui/hooks/use-copy-text"
import { cn } from "@workspace/ui/lib/utils"

const AUTHOR_AVATAR_SIZE = 20

type TurnState = "streaming" | "complete" | "cancelled" | "failed"

type UserTurnState = TurnState | "queued"

type TurnRun = "single" | "first" | "middle" | "last"

type InjectedTurnProps = { run?: TurnRun; carriesMark?: boolean }

type TurnCauseKind = "routine" | "mission"

type TurnCause = {
	routineTitle: string
	triggerSourceId: string
	kind?: TurnCauseKind
}

const CAUSE_LABEL_KEY = {
	routine: "transcript.cause.label",
	mission: "transcript.cause.mission",
} as const satisfies Record<TurnCauseKind, string>

const TRIGGER_SOURCE_ICON: Record<string, Icon> = {
	schedule: Icons.Calendar,
	"file-watch": Icons.File,
	"local-webhook": Icons.Web,
}

interface TurnGroupProps {
	carriesMark?: boolean
	messageId?: string
	children: ReactNode
	className?: string
}

interface UserTurnProps {
	children: ReactNode
	name?: string
	state?: UserTurnState
	run?: TurnRun
	sentAt?: number
	now?: number
	copyText?: string
	messageId?: string
	repliedTo?: readonly QuotedMessage[]
	onReply?: () => void
	onPin?: () => void
	onSaveAsDocument?: () => void
	pinned?: boolean
	onRetry?: () => void
	onCancel?: () => void
	failureReason?: string
	className?: string
}

type AssistantTurnProps = {
	children: ReactNode
	state?: TurnState
	run?: TurnRun
	sentAt?: number
	now?: number
	copyText?: string
	messageId?: string
	repliedTo?: readonly QuotedMessage[]
	onReply?: () => void
	onPin?: () => void
	onSaveAsDocument?: () => void
	onRetry?: () => void
	pinned?: boolean
	bare?: boolean
	framed?: boolean
	fills?: boolean
	botId?: string
	author?: MessageAuthor
	cause?: TurnCause
	identity?: RosterBot
	carriesMark?: boolean
	isWriting?: boolean
	work?: ReactNode
	footer?: ReactNode
	className?: string
}

type PersonTurnProps = {
	children: ReactNode
	name: string
	image?: string
	run?: TurnRun
	sentAt?: number
	now?: number
	copyText?: string
	messageId?: string
	repliedTo?: readonly QuotedMessage[]
	onReply?: () => void
	onPin?: () => void
	onSaveAsDocument?: () => void
	pinned?: boolean
	className?: string
}

const AUTHOR_LINE_END: Partial<Record<TurnState, AuthorLineEnd>> = {
	cancelled: "stopped",
	failed: "failed",
}

const HIGHLIGHT =
	"rounded-xl transition-colors duration-200 data-[highlighted]:bg-accent/40 motion-reduce:transition-none"

const ROW_BLEEDS_TO_TRANSCRIPT_EDGE = "-mx-6 w-auto px-6"

const ROW_HIGHLIGHT =
	"transition-colors duration-200 data-[highlighted]:bg-accent/40 motion-reduce:transition-none"

const TURN_ROW = "flex flex-col gap-1.5"

const AGENT_BUBBLE_WIDTH = "max-w-145"

const AGENT_REPLY_WIDTH = "w-full max-w-full items-stretch"

const AGENT_ANSWER_TYPE = "text-base leading-7"

const BUBBLELESS_REPLIES_APART = "[&>[data-bubbleless]+[data-bubbleless]]:mt-5"

const FRAMED_CARD_MIN_WIDTH = "min-w-[min(--spacing(90),100%)]"

const PEOPLE_BUBBLE_WIDTH = "max-w-120"

const FOOTER_KEY = {
	stopped: "turn.footer.cancelled",
	failed: "turn.footer.failed",
} as const satisfies Record<AuthorLineEnd, string>

const sentTimeOf = (sentAt?: number, now?: number) => {
	if (sentAt === undefined) return undefined
	return now === undefined ? (
		<MessageClock at={sentAt} />
	) : (
		<MessageTime at={sentAt} now={now} className="leading-5" />
	)
}

function runPositionFor(index: number, length: number): TurnRun {
	if (length === 1) return "single"
	if (index === 0) return "first"
	return index === length - 1 ? "last" : "middle"
}

interface TurnAction {
	key: "pin" | "reply" | "copy" | "save-as-document"
	label: string
	icon: Icon
	onSelect: () => void
}

interface TurnActionsInput {
	copyText?: string
	onReply?: () => void
	onPin?: () => void
	onSaveAsDocument?: () => void
	pinned: boolean
}

interface TurnActions {
	buttons: TurnAction[]
	menuGroups: TurnAction[][]
}

interface TurnActionListProps {
	actions: TurnAction[]
}

interface TurnActionMenuProps {
	groups: TurnAction[][]
}

interface TurnBodyProps {
	repliedTo?: readonly QuotedMessage[]
	foot: ReactNode
	className?: string
	children: ReactNode
}

interface NotSentProps {
	reason?: string
	onRetry?: () => void
}

const isTurnAction = (action: TurnAction | undefined): action is TurnAction =>
	action !== undefined

function useTurnActions({
	copyText,
	onReply,
	onPin,
	onSaveAsDocument,
	pinned,
}: TurnActionsInput): TurnActions {
	const { t } = useTranslation("chat")
	const { copied, copy } = useCopyText(copyText ?? "")

	const pinAction: TurnAction | undefined = onPin && {
		key: "pin",
		label: t(pinned ? "turn.unpin" : "turn.pin"),
		icon: pinned ? Icons.Unpin : Icons.Pin,
		onSelect: onPin,
	}
	const replyAction: TurnAction | undefined = onReply && {
		key: "reply",
		label: t("turn.reply"),
		icon: Icons.Reply,
		onSelect: onReply,
	}
	const copyAction: TurnAction | undefined = copyText
		? {
				key: "copy",
				label: copied ? t("turn.copied") : t("turn.copy"),
				icon: copied ? Icons.Check : Icons.Copy,
				onSelect: () => {
					void copy()
				},
			}
		: undefined
	const saveAsDocumentAction: TurnAction | undefined = onSaveAsDocument && {
		key: "save-as-document",
		label: t("turn.saveAsDocument"),
		icon: Icons.File,
		onSelect: onSaveAsDocument,
	}

	return {
		buttons: [pinAction, replyAction, copyAction].filter(isTurnAction),
		menuGroups: [[replyAction, copyAction, pinAction], [saveAsDocumentAction]]
			.map((group) => group.filter(isTurnAction))
			.filter((group) => group.length > 0),
	}
}

function TurnActionButtons({ actions }: TurnActionListProps) {
	if (actions.length === 0) return null

	return (
		<>
			{actions.map(({ key, label, icon: ActionIcon, onSelect }) => (
				<MessageAction key={key} label={label} onClick={onSelect}>
					<ActionIcon />
				</MessageAction>
			))}
		</>
	)
}

function TurnActionMenu({ groups }: TurnActionMenuProps) {
	return (
		<>
			{groups.map((group, index) => (
				<Fragment key={group[0]?.key}>
					{index > 0 ? <ContextMenuSeparator /> : null}
					{group.map(({ key, label, icon: ActionIcon, onSelect }) => (
						<MessageMenuItem key={key} label={label} onClick={onSelect}>
							<ActionIcon aria-hidden="true" />
							{label}
						</MessageMenuItem>
					))}
				</Fragment>
			))}
		</>
	)
}

function turnMenuOf({ menuGroups }: TurnActions) {
	return menuGroups.length > 0 ? (
		<TurnActionMenu groups={menuGroups} />
	) : undefined
}

function turnActionsOf(actions: TurnAction[]) {
	return actions.length > 0 ? <TurnActionButtons actions={actions} /> : null
}

function TurnBody({ repliedTo, foot, className, children }: TurnBodyProps) {
	return (
		<MessageBubbleContent
			data-slot="message-bubble-content"
			tabIndex={0}
			foot={foot}
			className={cn("whitespace-pre-wrap", className)}
		>
			{repliedTo?.length ? (
				<div className="flex flex-col gap-2">
					<div className="flex flex-col gap-1">
						{repliedTo.map((quoted, index) => (
							<MessageQuoteCard
								author={quoted.author}
								excerpt={quoted.excerpt}
								isExcerpt={quoted.isExcerpt}
								// biome-ignore lint/suspicious/noArrayIndexKey: a sender may reply twice to the same message, so the place in the list is the only identity
								key={index}
								onJump={quoted.onJump}
							/>
						))}
					</div>
					<div>{children}</div>
				</div>
			) : (
				children
			)}
		</MessageBubbleContent>
	)
}

function TurnGroup({
	carriesMark = false,
	messageId,
	children,
	className,
}: TurnGroupProps) {
	const turns = Children.toArray(children).filter(isValidElement)
	const anchor = useMessageAnchor(messageId)

	return (
		<MessageBubbleGroup
			data-slot="chat-turn-group"
			{...anchor}
			className={cn(
				"gap-3",
				BUBBLELESS_REPLIES_APART,
				messageId && HIGHLIGHT,
				className,
			)}
		>
			{turns.map((turn, index) => {
				const row = turn as ReactElement<InjectedTurnProps>
				const closes = index === turns.length - 1
				return cloneElement(row, {
					run: row.props.run ?? runPositionFor(index, turns.length),
					carriesMark: row.props.carriesMark ?? (carriesMark && closes),
				})
			})}
		</MessageBubbleGroup>
	)
}

const NotSent = ({ reason, onRetry }: NotSentProps) => {
	const { t } = useTranslation("chat")

	return (
		<div
			data-slot="turn-not-sent"
			className="flex items-center justify-end gap-3"
		>
			<Icons.AlertCircle
				aria-hidden="true"
				className="size-4 shrink-0 text-destructive"
			/>
			<p className="min-w-0 text-compact text-destructive leading-5">
				{reason ? t("turn.notSentBecause", { reason }) : t("turn.notSent")}
			</p>
			{onRetry ? (
				<Button variant="outline" onClick={onRetry} className="rounded-lg">
					<Icons.Retry aria-hidden="true" className="size-3.5" />
					{t("turn.retry")}
				</Button>
			) : null}
		</div>
	)
}

function UserTurn({
	children,
	name,
	state = "complete",
	sentAt,
	now,
	copyText,
	messageId,
	repliedTo,
	onReply,
	onPin,
	onSaveAsDocument,
	pinned = false,
	onRetry,
	onCancel,
	failureReason,
	className,
}: UserTurnProps) {
	const { t } = useTranslation("chat")
	const anchor = useMessageAnchor(messageId)
	const isQueued = state === "queued"
	const isNotSent = state === "failed"
	const actions = useTurnActions({
		copyText,
		onReply,
		onPin,
		onSaveAsDocument,
		pinned,
	})
	const foot = isQueued ? (
		<AuthorLineQueued onCancel={onCancel} />
	) : (
		<AuthorLine
			tone="you"
			name={t("turn.you")}
			avatar={
				<InitialsAvatar name={name} size={AUTHOR_AVATAR_SIZE} isOnOwnBubble />
			}
			time={sentTimeOf(sentAt, now)}
			actions={turnActionsOf(actions.buttons.toReversed())}
			isSticky
		/>
	)

	return (
		<MessageSideContext.Provider value="end">
			<Message
				from="user"
				{...anchor}
				className={cn(
					TURN_ROW,
					"items-end",
					ROW_BLEEDS_TO_TRANSCRIPT_EDGE,
					ROW_HIGHLIGHT,
					className,
				)}
			>
				<MessageBubble
					variant={isQueued ? "tint" : "solid"}
					className={cn(PEOPLE_BUBBLE_WIDTH, isNotSent && "opacity-80")}
				>
					<MessageActions menu={turnMenuOf(actions)}>
						<TurnBody repliedTo={repliedTo} foot={foot}>
							{children}
						</TurnBody>
					</MessageActions>
				</MessageBubble>
				{isNotSent ? (
					<NotSent reason={failureReason} onRetry={onRetry} />
				) : null}
			</Message>
		</MessageSideContext.Provider>
	)
}

interface TurnRunHeaderProps {
	author?: MessageAuthor
	cause?: TurnCause
	className?: string
	children?: ReactNode
}

const TurnRunHeader = ({
	author,
	cause,
	className,
	children,
}: TurnRunHeaderProps) => {
	const { t } = useTranslation("chat")

	if (cause) {
		const TriggerIcon = TRIGGER_SOURCE_ICON[cause.triggerSourceId] ?? Icons.Bell

		return (
			<MessageHeader
				data-slot="turn-cause"
				className={cn("min-w-0 gap-1", className)}
			>
				<span className="sr-only">
					{t(CAUSE_LABEL_KEY[cause.kind ?? "routine"])}
				</span>
				<TriggerIcon
					aria-hidden="true"
					className="size-3 shrink-0 self-center"
				/>
				<span data-slot="turn-cause-title" className="truncate">
					{cause.routineTitle}
				</span>
				{children}
			</MessageHeader>
		)
	}

	if (author) {
		return (
			<MessageAuthor author={author} className={className}>
				{children}
			</MessageAuthor>
		)
	}

	return children ? (
		<MessageHeader className={className}>{children}</MessageHeader>
	) : null
}

function AssistantTurn(props: AssistantTurnProps) {
	const {
		children,
		state = "complete",
		sentAt,
		now,
		copyText,
		messageId,
		repliedTo,
		onReply,
		onPin,
		onSaveAsDocument,
		onRetry,
		pinned = false,
		bare = false,
		framed = false,
		fills = false,
		botId,
		author,
		cause,
		identity,
		carriesMark = false,
		isWriting = false,
		work,
		footer,
		className,
	} = props
	const { t } = useTranslation("chat")
	const anchor = useMessageAnchor(messageId)
	const markedBotId = carriesMark ? (botId ?? author?.id) : undefined
	const markId = useMarkId(markedBotId)
	const actions = useTurnActions({
		copyText,
		onReply,
		onPin,
		onSaveAsDocument,
		pinned,
	})
	const onSelectCompanion = useCompanionSelect()
	const face = identity ?? author
	const paintsOwnSurface = framed && fills
	const unwrapped = bare || paintsOwnSurface
	const isBubbleless = !unwrapped && !framed
	const wrappedVariant = isBubbleless ? "ghost" : "soft"
	const end = AUTHOR_LINE_END[state]
	const mark = face ? (
		<BotIdentityAvatar
			hue={face.blot}
			image={face.image}
			name={face.name}
			seed={face.id}
			size={AUTHOR_AVATAR_SIZE}
		/>
	) : null
	const renderIdentity = (block: ReactElement) => (
		<CompanionMenuHost companionId={face?.id}>
			{face && onSelectCompanion ? (
				<span className="flex min-w-0">
					<BotSelectButton
						image={face.image}
						name={face.name}
						onSelect={(modifiers) => onSelectCompanion(face.id, modifiers)}
						size={AUTHOR_AVATAR_SIZE}
					>
						{block}
					</BotSelectButton>
				</span>
			) : (
				block
			)}
		</CompanionMenuHost>
	)
	const authorLine = face ? (
		<AuthorLine
			tone={author?.isDeleted ? "deleted" : "agent"}
			name={face.name}
			hue={face.blot}
			badge={(author ?? identity)?.title}
			avatar={<SharedMark markId={markId}>{mark}</SharedMark>}
			time={sentTimeOf(sentAt, now)}
			end={end}
			onRetry={onRetry}
			actions={turnActionsOf(actions.buttons)}
			isWriting={isWriting}
			isSticky
			renderIdentity={renderIdentity}
		/>
	) : null
	const shownFooter = !face && end ? t(FOOTER_KEY[end]) : null

	return (
		<Message
			from="assistant"
			data-bubbleless={isBubbleless || undefined}
			{...anchor}
			className={cn(
				TURN_ROW,
				"items-start",
				ROW_BLEEDS_TO_TRANSCRIPT_EDGE,
				ROW_HIGHLIGHT,
				className,
			)}
		>
			{cause ? <TurnRunHeader cause={cause} /> : null}
			<MessageBubble
				variant={unwrapped ? "bare" : wrappedVariant}
				className={cn(
					"min-w-0",
					fills || isBubbleless ? AGENT_REPLY_WIDTH : AGENT_BUBBLE_WIDTH,
				)}
			>
				<MessageActions menu={turnMenuOf(actions)}>
					<TurnBody
						repliedTo={repliedTo}
						foot={work ?? authorLine}
						className={cn(
							isBubbleless && AGENT_ANSWER_TYPE,
							paintsOwnSurface && "py-0",
							framed && !fills && FRAMED_CARD_MIN_WIDTH,
							fills && "w-full",
						)}
					>
						<MarkdownSizeContext value={isBubbleless ? "answer" : "chat"}>
							{children}
						</MarkdownSizeContext>
					</TurnBody>
				</MessageActions>
			</MessageBubble>
			{footer || shownFooter ? (
				<MessageFooter>{footer ?? shownFooter}</MessageFooter>
			) : null}
		</Message>
	)
}

const PersonTurn = ({
	children,
	name,
	image,
	sentAt,
	now,
	copyText,
	messageId,
	repliedTo,
	onReply,
	onPin,
	onSaveAsDocument,
	pinned = false,
	className,
}: PersonTurnProps) => {
	const { t } = useTranslation("chat")
	const anchor = useMessageAnchor(messageId)
	const actions = useTurnActions({
		copyText,
		onReply,
		onPin,
		onSaveAsDocument,
		pinned,
	})

	return (
		<MessageSideContext.Provider value="end">
			<Message
				from="assistant"
				aria-label={t("transcript.message.person", { name })}
				{...anchor}
				className={cn(
					TURN_ROW,
					"items-end",
					ROW_BLEEDS_TO_TRANSCRIPT_EDGE,
					ROW_HIGHLIGHT,
					className,
				)}
			>
				<MessageBubble variant="soft" className={PEOPLE_BUBBLE_WIDTH}>
					<MessageActions menu={turnMenuOf(actions)}>
						<TurnBody
							repliedTo={repliedTo}
							foot={
								<AuthorLine
									tone="person"
									name={name}
									avatar={
										<InitialsAvatar
											name={name}
											image={image}
											size={AUTHOR_AVATAR_SIZE}
										/>
									}
									time={sentTimeOf(sentAt, now)}
									actions={turnActionsOf(actions.buttons.toReversed())}
									isSticky
								/>
							}
						>
							{children}
						</TurnBody>
					</MessageActions>
				</MessageBubble>
			</Message>
		</MessageSideContext.Provider>
	)
}

export {
	AGENT_BUBBLE_WIDTH,
	AssistantTurn,
	AUTHOR_AVATAR_SIZE,
	PersonTurn,
	type TurnCause,
	type TurnCauseKind,
	TurnGroup,
	type TurnRun,
	type TurnState,
	UserTurn,
}
