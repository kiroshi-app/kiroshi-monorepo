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
	BotIdentityAvatar,
	BotSelectButton,
} from "@workspace/ui/components/bot-identity-avatar"
import { CompanionMenuHost } from "@workspace/ui/components/companion-menu"
import { useCompanionSelect } from "@workspace/ui/components/companion-select"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import { useMarkId } from "@workspace/ui/components/mark-context"
import {
	formatSentDate,
	Message,
	MessageAuthor,
	MessageContent,
	MessageFooter,
	MessageHeader,
	MessageTime,
} from "@workspace/ui/components/message"
import {
	MessageAction,
	MessageActions,
} from "@workspace/ui/components/message-actions"
import {
	MESSAGE_BUBBLE_INLINE_PADDING,
	MessageBubble,
	MessageBubbleContent,
	MessageBubbleGroup,
} from "@workspace/ui/components/message-bubble"
import { useMessageAnchor } from "@workspace/ui/components/message-highlight-context"
import {
	MessageQuote,
	type QuotedMessage,
} from "@workspace/ui/components/message-quote"
import { SharedMark } from "@workspace/ui/components/motion/shared-mark"
import type { RosterBot } from "@workspace/ui/components/roster"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@workspace/ui/components/ui/context-menu"
import { useCopyText } from "@workspace/ui/hooks/use-copy-text"
import { cn } from "@workspace/ui/lib/utils"

const TURN_AVATAR_SIZE = 40

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
	state?: UserTurnState
	run?: TurnRun
	sentAt?: number
	hasTimeLine?: boolean
	now?: number
	copyText?: string
	messageId?: string
	repliedTo?: QuotedMessage
	onReply?: () => void
	onPin?: () => void
	pinned?: boolean
	onRetry?: () => void
	onCancel?: () => void
	className?: string
}

type AssistantTurnProps = {
	children: ReactNode
	state?: TurnState
	run?: TurnRun
	sentAt?: number
	hasTimeLine?: boolean
	now?: number
	copyText?: string
	messageId?: string
	repliedTo?: QuotedMessage
	onReply?: () => void
	onPin?: () => void
	pinned?: boolean
	bare?: boolean
	fills?: boolean
	botId?: string
	author?: MessageAuthor
	cause?: TurnCause
	identity?: RosterBot
	carriesMark?: boolean
	footer?: ReactNode
	className?: string
}

type PersonTurnProps = {
	children: ReactNode
	name: string
	image?: string
	run?: TurnRun
	sentAt?: number
	hasTimeLine?: boolean
	now?: number
	copyText?: string
	messageId?: string
	repliedTo?: QuotedMessage
	onReply?: () => void
	onPin?: () => void
	pinned?: boolean
	className?: string
}

const TURN_FOOTER_KEY: Partial<
	Record<UserTurnState, `turn.footer.${"cancelled" | "failed" | "queued"}`>
> = {
	cancelled: "turn.footer.cancelled",
	failed: "turn.footer.failed",
	queued: "turn.footer.queued",
}

const HIGHLIGHT =
	"rounded-xl transition-colors duration-200 data-[highlighted]:bg-accent/40 motion-reduce:transition-none"

const RUN_RADIUS = {
	user: {
		single: "",
		first: "rounded-br-md",
		middle: "rounded-tr-md rounded-br-md",
		last: "rounded-tr-md",
	},
	assistant: {
		single: "",
		first: "rounded-bl-md",
		middle: "rounded-tl-md rounded-bl-md",
		last: "rounded-tl-md",
	},
} satisfies Record<"user" | "assistant", Record<TurnRun, string>>

interface TurnTimeLineProps {
	sentAt?: number
	now?: number
	className?: string
}

const TurnTimeLine = ({ sentAt, now, className }: TurnTimeLineProps) =>
	sentAt === undefined || now === undefined ? null : (
		<MessageFooter data-slot="message-time-line" className={className}>
			<MessageTime at={sentAt} now={now} />
		</MessageFooter>
	)

const opensRun = (run: TurnRun) => run === "single" || run === "first"

const closesRun = (run: TurnRun) => run === "single" || run === "last"

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
	alwaysVisible?: boolean
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
	sentAt?: number
	className?: string
	children: ReactNode
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
			alwaysVisible: pinned,
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
	return (
		<>
			{actions.map(
				({ key, label, icon: ActionIcon, onSelect, alwaysVisible }) => (
					<MessageAction
						key={key}
						label={label}
						onClick={onSelect}
						alwaysVisible={alwaysVisible}
					>
						<ActionIcon />
					</MessageAction>
				),
			)}
		</>
	)
}

function TurnActionMenu({ actions }: TurnActionListProps) {
	return (
		<>
			{actions.map(({ key, label, icon: ActionIcon, onSelect }, index) => (
				<Fragment key={key}>
					{actions[index - 1]?.key === "pin" ? <ContextMenuSeparator /> : null}
					<ContextMenuItem label={label} onClick={onSelect}>
						<ActionIcon aria-hidden="true" className="size-3.5" />
						{label}
					</ContextMenuItem>
				</Fragment>
			))}
		</>
	)
}

function turnMenuOf(actions: TurnAction[]) {
	return actions.length > 0 ? <TurnActionMenu actions={actions} /> : undefined
}

function TurnBody({ repliedTo, sentAt, className, children }: TurnBodyProps) {
	const content = (
		<MessageBubbleContent
			data-slot="message-bubble-content"
			className={cn("whitespace-pre-wrap", className)}
		>
			{children}
		</MessageBubbleContent>
	)
	const body =
		sentAt === undefined ? (
			content
		) : (
			<TooltipHint content={formatSentDate(sentAt)}>{content}</TooltipHint>
		)

	return repliedTo ? <MessageQuote {...repliedTo}>{body}</MessageQuote> : body
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
			className={cn("gap-1", messageId && HIGHLIGHT, className)}
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

function PendingSpinner() {
	return (
		<Icons.Loading
			aria-hidden="true"
			data-slot="turn-pending-spinner"
			className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
		/>
	)
}

function UserTurn({
	children,
	state = "complete",
	run = "single",
	sentAt,
	hasTimeLine = true,
	now,
	copyText,
	messageId,
	repliedTo,
	onReply,
	onPin,
	pinned = false,
	onRetry,
	onCancel,
	className,
}: UserTurnProps) {
	const { t } = useTranslation("chat")
	const queued = state === "queued"
	const footerKey = queued ? TURN_FOOTER_KEY.queued : undefined
	const anchor = useMessageAnchor(messageId)
	const actions = useTurnActions({ copyText, onReply, onPin, pinned })

	return (
		<Message
			from="user"
			{...anchor}
			className={cn(messageId && HIGHLIGHT, className)}
		>
			<MessageContent>
				<MessageBubble variant={queued ? "tint" : "solid"}>
					<MessageActions
						actions={
							<>
								{queued ? <PendingSpinner /> : null}
								{queued && onCancel ? (
									<MessageAction
										alwaysVisible
										label={t("turn.cancel")}
										onClick={onCancel}
									>
										<Icons.Close />
									</MessageAction>
								) : null}
								{state === "failed" && onRetry ? (
									<MessageAction
										alwaysVisible
										label={t("turn.retry")}
										onClick={onRetry}
									>
										<Icons.Retry />
									</MessageAction>
								) : null}
								<TurnActionButtons actions={actions} />
							</>
						}
						menu={turnMenuOf(actions)}
					>
						<TurnBody
							repliedTo={repliedTo}
							sentAt={sentAt}
							className={RUN_RADIUS.user[run]}
						>
							{children}
						</TurnBody>
					</MessageActions>
				</MessageBubble>
				<TurnTimeLine
					sentAt={hasTimeLine ? sentAt : undefined}
					now={now}
					className={MESSAGE_BUBBLE_INLINE_PADDING}
				/>
				{footerKey ? <MessageFooter>{t(footerKey)}</MessageFooter> : null}
			</MessageContent>
		</Message>
	)
}

interface TurnRunHeaderProps {
	author?: MessageAuthor
	cause?: TurnCause
	className?: string
}

const TurnRunHeader = ({ author, cause, className }: TurnRunHeaderProps) => {
	const { t } = useTranslation("chat")

	if (!cause) {
		return author ? (
			<MessageAuthor author={author} className={className} />
		) : null
	}

	const TriggerIcon = TRIGGER_SOURCE_ICON[cause.triggerSourceId] ?? Icons.Bell

	return (
		<MessageHeader
			data-slot="turn-cause"
			className={cn("min-w-0 gap-1", className)}
		>
			<span className="sr-only">
				{t(CAUSE_LABEL_KEY[cause.kind ?? "routine"])}
			</span>
			<TriggerIcon aria-hidden="true" className="size-3 shrink-0" />
			<span data-slot="turn-cause-title" className="truncate">
				{cause.routineTitle}
			</span>
		</MessageHeader>
	)
}

function AssistantTurn(props: AssistantTurnProps) {
	const {
		children,
		state = "complete",
		run = "single",
		sentAt,
		hasTimeLine = true,
		now,
		copyText,
		messageId,
		repliedTo,
		onReply,
		onPin,
		pinned = false,
		bare = false,
		fills = false,
		botId,
		author,
		cause,
		identity,
		carriesMark = false,
		footer,
		className,
	} = props
	const { t } = useTranslation("chat")
	const markedBotId = carriesMark ? (botId ?? author?.id) : undefined
	const markId = useMarkId(markedBotId)
	const footerKey = TURN_FOOTER_KEY[state]
	const shownFooter = footerKey ? t(footerKey) : footer
	const anchor = useMessageAnchor(messageId)
	const actions = useTurnActions({ copyText, onReply, onPin, pinned })
	const onSelectCompanion = useCompanionSelect()
	const gutterBot = identity ?? (closesRun(run) ? author : undefined)
	const mark = gutterBot ? (
		<BotIdentityAvatar
			blot={gutterBot.blot}
			image={gutterBot.image}
			name={gutterBot.name}
			seed={gutterBot.id}
			size={TURN_AVATAR_SIZE}
		/>
	) : null
	const control =
		gutterBot && onSelectCompanion ? (
			<BotSelectButton
				image={gutterBot.image}
				name={gutterBot.name}
				onSelect={() => onSelectCompanion(gutterBot.id)}
				size={TURN_AVATAR_SIZE}
			>
				{mark}
			</BotSelectButton>
		) : null

	return (
		<Message
			from="assistant"
			{...anchor}
			className={cn(messageId && HIGHLIGHT, className)}
		>
			<MessageContent
				className="grid gap-x-2 gap-y-0"
				style={{ gridTemplateColumns: `${TURN_AVATAR_SIZE}px 1fr` }}
			>
				{opensRun(run) ? (
					<TurnRunHeader
						author={author}
						cause={cause}
						className={cn(
							"col-start-2 row-start-1 pb-1",
							bare ? undefined : MESSAGE_BUBBLE_INLINE_PADDING,
						)}
					/>
				) : null}
				<CompanionMenuHost companionId={gutterBot?.id}>
					<span
						data-slot="message-gutter"
						aria-hidden={control ? undefined : "true"}
						className="col-start-1 row-start-2 self-end"
					>
						{mark ? (
							<SharedMark markId={markId}>{control ?? mark}</SharedMark>
						) : null}
					</span>
				</CompanionMenuHost>
				<MessageBubble
					variant={bare ? "bare" : "soft"}
					className={cn(
						"col-start-2 row-start-2 min-w-0",
						fills && "items-stretch",
					)}
				>
					<MessageActions
						actions={<TurnActionButtons actions={actions} />}
						menu={turnMenuOf(actions)}
					>
						<TurnBody
							repliedTo={repliedTo}
							sentAt={sentAt}
							className={cn(
								bare ? undefined : RUN_RADIUS.assistant[run],
								fills && "w-full",
							)}
						>
							{children}
						</TurnBody>
					</MessageActions>
				</MessageBubble>
				<TurnTimeLine
					sentAt={hasTimeLine ? sentAt : undefined}
					now={now}
					className={cn(
						"col-start-2 row-start-3 pt-1.5",
						bare ? undefined : MESSAGE_BUBBLE_INLINE_PADDING,
					)}
				/>
				{shownFooter ? (
					<MessageFooter className="col-start-2 row-start-4 pt-1.5">
						{shownFooter}
					</MessageFooter>
				) : null}
			</MessageContent>
		</Message>
	)
}

const PersonTurn = ({
	children,
	name,
	image,
	run = "single",
	sentAt,
	hasTimeLine = true,
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
		<Message
			from="assistant"
			aria-label={t("transcript.message.person", { name })}
			{...anchor}
			className={cn(messageId && HIGHLIGHT, className)}
		>
			<MessageContent
				className="grid gap-x-2 gap-y-0"
				style={{ gridTemplateColumns: `${TURN_AVATAR_SIZE}px 1fr` }}
			>
				{opensRun(run) ? (
					<MessageHeader
						data-slot="message-author"
						className={cn(
							"col-start-2 row-start-1 min-w-0 pb-1",
							MESSAGE_BUBBLE_INLINE_PADDING,
						)}
					>
						<span className="max-w-48 truncate font-medium text-foreground/80">
							{name}
						</span>
					</MessageHeader>
				) : null}
				<span
					data-slot="message-gutter"
					aria-hidden="true"
					className="col-start-1 row-start-2 self-end"
				>
					{closesRun(run) ? (
						<InitialsAvatar image={image} name={name} size={TURN_AVATAR_SIZE} />
					) : null}
				</span>
				<MessageBubble
					variant="soft"
					className="col-start-2 row-start-2 min-w-0"
				>
					<MessageActions
						actions={<TurnActionButtons actions={actions} />}
						menu={turnMenuOf(actions)}
					>
						<TurnBody
							repliedTo={repliedTo}
							sentAt={sentAt}
							className={RUN_RADIUS.assistant[run]}
						>
							{children}
						</TurnBody>
					</MessageActions>
				</MessageBubble>
				<TurnTimeLine
					sentAt={hasTimeLine ? sentAt : undefined}
					now={now}
					className={cn(
						"col-start-2 row-start-3 pt-1.5",
						MESSAGE_BUBBLE_INLINE_PADDING,
					)}
				/>
			</MessageContent>
		</Message>
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
