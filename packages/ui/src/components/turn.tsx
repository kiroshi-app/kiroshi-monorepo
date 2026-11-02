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

const TURN_AVATAR_SIZE = 40

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
	repliedTo?: QuotedMessage
	onReply?: () => void
	onPin?: () => void
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
	repliedTo?: QuotedMessage
	onReply?: () => void
	onPin?: () => void
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
	repliedTo?: QuotedMessage
	onReply?: () => void
	onPin?: () => void
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
	key: "pin" | "reply" | "copy"
	label: string
	icon: Icon
	onSelect: () => void
}

interface TurnActionsInput {
	copyText?: string
	onReply?: () => void
	onPin?: () => void
	pinned: boolean
}

interface TurnActionListProps {
	actions: TurnAction[]
}

interface TurnBodyProps {
	repliedTo?: QuotedMessage
	foot: ReactNode
	className?: string
	children: ReactNode
}

interface NotSentProps {
	reason?: string
	onRetry?: () => void
}

function useTurnActions({
	copyText,
	onReply,
	onPin,
	pinned,
}: TurnActionsInput) {
	const { t } = useTranslation("chat")
	const { copied, copy } = useCopyText(copyText ?? "")
	const actions: TurnAction[] = []

	if (onPin) {
		actions.push({
			key: "pin",
			label: t(pinned ? "turn.unpin" : "turn.pin"),
			icon: pinned ? Icons.Unpin : Icons.Pin,
			onSelect: onPin,
		})
	}

	if (onReply) {
		actions.push({
			key: "reply",
			label: t("turn.reply"),
			icon: Icons.Reply,
			onSelect: onReply,
		})
	}

	if (copyText) {
		actions.push({
			key: "copy",
			label: copied ? t("turn.copied") : t("turn.copy"),
			icon: copied ? Icons.Check : Icons.Copy,
			onSelect: () => {
				void copy()
			},
		})
	}

	return actions
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

function TurnActionMenu({ actions }: TurnActionListProps) {
	return (
		<>
			{actions.map(({ key, label, icon: ActionIcon, onSelect }, index) => (
				<Fragment key={key}>
					{actions[index - 1]?.key === "pin" ? <ContextMenuSeparator /> : null}
					<MessageMenuItem label={label} onClick={onSelect}>
						<ActionIcon aria-hidden="true" />
						{label}
					</MessageMenuItem>
				</Fragment>
			))}
		</>
	)
}

function turnMenuOf(actions: TurnAction[]) {
	return actions.length > 0 ? <TurnActionMenu actions={actions} /> : undefined
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
			{repliedTo ? (
				<div className="flex flex-col gap-2">
					<MessageQuoteCard
						author={repliedTo.author}
						excerpt={repliedTo.excerpt}
						onJump={repliedTo.onJump}
					/>
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
			className={cn("gap-3", messageId && HIGHLIGHT, className)}
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
	const actions = useTurnActions({ copyText, onReply, onPin, pinned })
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
			actions={turnActionsOf(actions)}
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
		work,
		footer,
		className,
	} = props
	const { t } = useTranslation("chat")
	const anchor = useMessageAnchor(messageId)
	const markedBotId = carriesMark ? (botId ?? author?.id) : undefined
	const markId = useMarkId(markedBotId)
	const actions = useTurnActions({ copyText, onReply, onPin, pinned })
	const onSelectCompanion = useCompanionSelect()
	const face = identity ?? author
	const unwrapped = bare || framed
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
	const control =
		face && onSelectCompanion ? (
			<BotSelectButton
				image={face.image}
				name={face.name}
				onSelect={(modifiers) => onSelectCompanion(face.id, modifiers)}
				size={AUTHOR_AVATAR_SIZE}
			>
				{mark}
			</BotSelectButton>
		) : null
	const avatar = mark ? (
		<CompanionMenuHost companionId={face?.id}>
			<SharedMark markId={markId}>{control ?? mark}</SharedMark>
		</CompanionMenuHost>
	) : null
	const authorLine = face ? (
		<AuthorLine
			tone={author?.isDeleted ? "deleted" : "agent"}
			name={face.name}
			hue={face.blot}
			badge={(author ?? identity)?.title}
			avatar={avatar}
			time={sentTimeOf(sentAt, now)}
			end={end}
			onRetry={onRetry}
			actions={turnActionsOf(actions)}
			isSticky
		/>
	) : null
	const shownFooter = !face && end ? t(FOOTER_KEY[end]) : null

	return (
		<Message
			from="assistant"
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
				variant={unwrapped ? "bare" : "soft"}
				className={cn(
					"min-w-0",
					AGENT_BUBBLE_WIDTH,
					fills && "w-full items-stretch",
				)}
			>
				<MessageActions menu={turnMenuOf(actions)}>
					<TurnBody
						repliedTo={repliedTo}
						foot={work ?? authorLine}
						className={cn(framed && "py-0", fills && "w-full")}
					>
						{children}
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
	pinned = false,
	className,
}: PersonTurnProps) => {
	const { t } = useTranslation("chat")
	const anchor = useMessageAnchor(messageId)
	const actions = useTurnActions({ copyText, onReply, onPin, pinned })

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
									actions={turnActionsOf(actions)}
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
	AssistantTurn,
	PersonTurn,
	TURN_AVATAR_SIZE,
	type TurnCause,
	type TurnCauseKind,
	TurnGroup,
	type TurnRun,
	type TurnState,
	UserTurn,
}
