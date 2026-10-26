"use client"

import {
	Children,
	cloneElement,
	createContext,
	Fragment,
	isValidElement,
	type ReactElement,
	type ReactNode,
	useContext,
} from "react"
import { useTranslation } from "react-i18next"

import {
	BotIdentityAvatar,
	BotSelectButton,
} from "@workspace/ui/components/bot-identity-avatar"
import { CompanionMenuHost } from "@workspace/ui/components/companion-menu"
import { useCompanionSelect } from "@workspace/ui/components/companion-select"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import {
	AvatarFrame,
	displayNameOf,
	initialsOf,
} from "@workspace/ui/components/initials-avatar"
import { useMarkId } from "@workspace/ui/components/mark-context"
import {
	Message,
	MessageAuthor,
	MessageClock,
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
import { MessageSideContext } from "@workspace/ui/components/message-side-context"
import { SharedMark } from "@workspace/ui/components/motion/shared-mark"
import type { RosterBot } from "@workspace/ui/components/roster"
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
	pinned?: boolean
	bare?: boolean
	framed?: boolean
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

const ROW_BLEEDS_TO_TRANSCRIPT_EDGE = "-mx-6 w-auto px-6"

const ROW_HIGHLIGHT =
	"transition-colors duration-200 data-[highlighted]:bg-accent/40 motion-reduce:transition-none"

const RUN_ROW_PADDING = {
	single: "pt-2 pb-1",
	first: "pt-2 pb-0.5",
	middle: "py-0.5",
	last: "pt-0.5 pb-1",
} satisfies Record<TurnRun, string>

const RUN_RADIUS = {
	single: "",
	first: "rounded-bl-md",
	middle: "rounded-tl-md rounded-bl-md",
	last: "rounded-tl-md",
} satisfies Record<TurnRun, string>

const TurnRunContext = createContext<TurnRun>("single")

const useTurnRunRadius = () => RUN_RADIUS[useContext(TurnRunContext)]

const READER_RUN_RADIUS = {
	single: "",
	first: "rounded-ee-md",
	middle: "rounded-se-md rounded-ee-md",
	last: "rounded-se-md",
} satisfies Record<TurnRun, string>

const TURN_ROW_GRID = "grid grid-cols-[auto_minmax(0,1fr)] gap-y-1"

const READER_ROW_GRID = "grid grid-cols-[minmax(0,1fr)] gap-y-1"

const READER_COLUMN = "items-end"

const TURN_GUTTER = "flex w-10 shrink-0 justify-end"

const TURN_AVATAR_GUTTER = cn(TURN_GUTTER, "self-end")

const TURN_HOVER_TIME =
	"text-[11px]/4 text-muted-foreground opacity-0 group-focus-within/message:opacity-100 group-hover/message:opacity-100"

const TURN_GUTTER_TIME = cn("pt-3.5", TURN_HOVER_TIME)

const TURN_HEAD = "h-5 items-baseline gap-1.5 self-stretch"

const PERSON_INITIALS =
	"grid size-full place-items-center bg-person-avatar font-medium text-foreground text-sm uppercase leading-none"

const opensRun = (run: TurnRun) => run === "single" || run === "first"

const closesRun = (run: TurnRun) => run === "single" || run === "last"

const sentTimeOf = (sentAt?: number, now?: number) =>
	sentAt === undefined || now === undefined ? null : (
		<MessageTime at={sentAt} now={now} />
	)

interface TurnGutterTimeProps {
	sentAt?: number
}

const TurnGutterTime = ({ sentAt }: TurnGutterTimeProps) => (
	<span
		data-slot="message-gutter"
		aria-hidden={sentAt === undefined ? "true" : undefined}
		className={cn(TURN_GUTTER, TURN_GUTTER_TIME)}
	>
		{sentAt === undefined ? null : <MessageClock at={sentAt} />}
	</span>
)

interface PersonGutterProps {
	name?: string
	image?: string
}

const PersonGutter = ({ name, image }: PersonGutterProps) => (
	<span
		data-slot="message-gutter"
		aria-hidden="true"
		className={TURN_AVATAR_GUTTER}
	>
		<AvatarFrame
			image={image}
			shape="round"
			size={TURN_AVATAR_SIZE}
			slot="user-avatar"
		>
			<span className={PERSON_INITIALS}>{initialsOf(displayNameOf(name))}</span>
		</AvatarFrame>
	</span>
)

type TurnRowProps = {
	run: TurnRun
	messageId?: string
	sentAt?: number
	avatar: ReactNode
	head: ReactNode
	footer?: ReactNode
	children: ReactNode
	className?: string
	"aria-label"?: string
}

const TurnRow = ({
	run,
	messageId,
	sentAt,
	avatar,
	head,
	footer,
	children,
	className,
	...labelled
}: TurnRowProps) => {
	const anchor = useMessageAnchor(messageId)
	const opens = opensRun(run)
	const closes = closesRun(run)

	return (
		<Message
			from="assistant"
			{...labelled}
			{...anchor}
			className={cn(
				TURN_ROW_GRID,
				ROW_BLEEDS_TO_TRANSCRIPT_EDGE,
				ROW_HIGHLIGHT,
				RUN_ROW_PADDING[run],
				className,
			)}
		>
			{opens ? (
				<MessageContent className="col-start-2">{head}</MessageContent>
			) : null}
			{closes ? avatar : <TurnGutterTime sentAt={opens ? undefined : sentAt} />}
			<MessageContent>{children}</MessageContent>
			{footer ? (
				<MessageContent className="col-start-2">{footer}</MessageContent>
			) : null}
		</Message>
	)
}

interface PersonHeadProps {
	name?: string
	sentAt?: number
	now?: number
}

const PersonHead = ({ name, sentAt, now }: PersonHeadProps) => {
	const shownName = displayNameOf(name)

	return (
		<MessageAuthor
			author={{ id: shownName, name: shownName }}
			className={cn(TURN_HEAD, MESSAGE_BUBBLE_INLINE_PADDING)}
		>
			{sentTimeOf(sentAt, now)}
		</MessageAuthor>
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

function TurnBody({ repliedTo, className, children }: TurnBodyProps) {
	const body = (
		<MessageBubbleContent
			data-slot="message-bubble-content"
			className={cn("whitespace-pre-wrap", className)}
		>
			{children}
		</MessageBubbleContent>
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
			className={cn("gap-0", messageId && HIGHLIGHT, className)}
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
	const anchor = useMessageAnchor(messageId)
	const queued = state === "queued"
	const footerKey = queued ? TURN_FOOTER_KEY.queued : undefined
	const actions = useTurnActions({ copyText, onReply, onPin, pinned })
	const opens = opensRun(run)
	const headTime = opens ? sentTimeOf(sentAt, now) : null

	return (
		<MessageSideContext.Provider value="end">
			<Message
				from="user"
				{...anchor}
				className={cn(
					READER_ROW_GRID,
					ROW_BLEEDS_TO_TRANSCRIPT_EDGE,
					ROW_HIGHLIGHT,
					RUN_ROW_PADDING[run],
					className,
				)}
			>
				{headTime ? (
					<MessageContent className={READER_COLUMN}>
						<MessageHeader
							className={cn(
								TURN_HEAD,
								MESSAGE_BUBBLE_INLINE_PADDING,
								"justify-end",
							)}
						>
							{headTime}
						</MessageHeader>
					</MessageContent>
				) : null}
				<MessageContent className={READER_COLUMN}>
					<MessageBubble variant={queued ? "tint" : "solid"}>
						<MessageActions
							actions={
								<>
									{!opens && sentAt !== undefined ? (
										<MessageClock at={sentAt} className={TURN_HOVER_TIME} />
									) : null}
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
								className={READER_RUN_RADIUS[run]}
							>
								{children}
							</TurnBody>
						</MessageActions>
					</MessageBubble>
				</MessageContent>
				{footerKey ? (
					<MessageContent className={READER_COLUMN}>
						<MessageFooter>{t(footerKey)}</MessageFooter>
					</MessageContent>
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
		run = "single",
		sentAt,
		now,
		copyText,
		messageId,
		repliedTo,
		onReply,
		onPin,
		pinned = false,
		bare = false,
		framed = false,
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
	const actions = useTurnActions({ copyText, onReply, onPin, pinned })
	const onSelectCompanion = useCompanionSelect()
	const gutterBot = identity ?? author
	const unwrapped = bare || framed
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
		<TurnRow
			run={run}
			messageId={messageId}
			sentAt={sentAt}
			className={className}
			avatar={
				<CompanionMenuHost companionId={gutterBot?.id}>
					<span
						data-slot="message-gutter"
						aria-hidden={control ? undefined : "true"}
						className={TURN_AVATAR_GUTTER}
					>
						{mark ? (
							<SharedMark markId={markId}>{control ?? mark}</SharedMark>
						) : null}
					</span>
				</CompanionMenuHost>
			}
			head={
				<TurnRunHeader
					author={author ?? identity}
					cause={cause}
					className={cn(
						TURN_HEAD,
						unwrapped ? "px-0" : MESSAGE_BUBBLE_INLINE_PADDING,
					)}
				>
					{sentTimeOf(sentAt, now)}
				</TurnRunHeader>
			}
			footer={
				shownFooter ? <MessageFooter>{shownFooter}</MessageFooter> : undefined
			}
		>
			<MessageBubble
				variant={unwrapped ? "bare" : "soft"}
				className={cn("min-w-0", fills && "items-stretch")}
			>
				<MessageActions
					actions={<TurnActionButtons actions={actions} />}
					menu={turnMenuOf(actions)}
				>
					<TurnBody
						repliedTo={repliedTo}
						className={cn(
							unwrapped ? undefined : RUN_RADIUS[run],
							framed && "py-0",
							fills && "w-full",
						)}
					>
						<TurnRunContext.Provider value={run}>
							{children}
						</TurnRunContext.Provider>
					</TurnBody>
				</MessageActions>
			</MessageBubble>
		</TurnRow>
	)
}

const PersonTurn = ({
	children,
	name,
	image,
	run = "single",
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
	const actions = useTurnActions({ copyText, onReply, onPin, pinned })

	return (
		<TurnRow
			aria-label={t("transcript.message.person", { name })}
			run={run}
			messageId={messageId}
			sentAt={sentAt}
			className={className}
			avatar={<PersonGutter name={name} image={image} />}
			head={<PersonHead name={name} sentAt={sentAt} now={now} />}
		>
			<MessageBubble variant="soft" className="min-w-0">
				<MessageActions
					actions={<TurnActionButtons actions={actions} />}
					menu={turnMenuOf(actions)}
				>
					<TurnBody repliedTo={repliedTo} className={RUN_RADIUS[run]}>
						{children}
					</TurnBody>
				</MessageActions>
			</MessageBubble>
		</TurnRow>
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
	useTurnRunRadius,
}
