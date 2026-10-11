import type { ComponentPropsWithRef, ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { BotTitleBadge } from "@workspace/ui/components/bot-badge"
import { Icons } from "@workspace/ui/components/icons"
import type { RosterBot } from "@workspace/ui/components/roster"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import { formatDateTime, toRelativeTime } from "@workspace/ui/lib/time-format"
import { cn } from "@workspace/ui/lib/utils"

export type MessageFrom = "user" | "assistant"

export interface MessageProps
	extends Omit<ComponentPropsWithRef<"article">, "children"> {
	from: MessageFrom
	children: ReactNode
}

export type MessageAuthor = RosterBot & {
	isLead?: boolean
	isDeleted?: boolean
}

interface MessageAuthorProps extends ComponentPropsWithRef<"div"> {
	author: MessageAuthor
}

export type MessageContentProps = ComponentPropsWithRef<"div">
export type MessageHeaderProps = ComponentPropsWithRef<"div">
export type MessageFooterProps = ComponentPropsWithRef<"div">

interface MessageTimeProps {
	at: number
	now: number
	className?: string
}

interface MessageClockProps {
	at: number
	className?: string
}

interface SentTimeProps {
	at: number
	label: string
	className?: string
}

const DATE_AND_TIME: Intl.DateTimeFormatOptions = {
	dateStyle: "full",
	timeStyle: "short",
	hourCycle: "h23",
}

export const formatSentDate = (at: number) => formatDateTime(at, DATE_AND_TIME)

const DAY_MS = 86_400_000

const startOfLocalDay = (at: number) => new Date(at).setHours(0, 0, 0, 0)

const calendarDaysBetween = (at: number, now: number) =>
	Math.round((startOfLocalDay(now) - startOfLocalDay(at)) / DAY_MS)

const HOURS_AND_MINUTES: Intl.DateTimeFormatOptions = {
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
}

const formatClock = (at: number) => formatDateTime(at, HOURS_AND_MINUTES)

const capitalised = (label: string, language: string) =>
	label.charAt(0).toLocaleUpperCase(language) + label.slice(1)

const sentLabel = (at: number, now: number, language: string) => {
	const days = calendarDaysBetween(at, now)

	return days < 1
		? formatClock(at)
		: capitalised(toRelativeTime(now - days * DAY_MS, now), language)
}

export function Message({ from, children, className, ...props }: MessageProps) {
	const { t } = useTranslation("chat")

	return (
		<article
			data-slot="message"
			data-from={from}
			aria-label={props["aria-label"] ?? t(`transcript.message.${from}`)}
			className={cn("group/message flex w-full items-start gap-2", className)}
			{...props}
		>
			{children}
		</article>
	)
}

export function MessageContent({ className, ...props }: MessageContentProps) {
	return (
		<div
			data-slot="message-content"
			className={cn(
				"flex min-w-0 flex-1 flex-col items-start gap-1.5 text-sm leading-6",
				className,
			)}
			{...props}
		/>
	)
}

export function MessageHeader({ className, ...props }: MessageHeaderProps) {
	return (
		<div
			data-slot="message-header"
			className={cn(
				"flex items-center gap-1.5 px-1 text-xs leading-none text-muted-foreground",
				className,
			)}
			{...props}
		/>
	)
}

export function MessageAuthor({
	author,
	className,
	children,
	...props
}: MessageAuthorProps) {
	const { t } = useTranslation("chat")

	return (
		<MessageHeader
			data-slot="message-author"
			className={cn("min-w-0 gap-1", className)}
			{...props}
		>
			<span
				className={cn(
					"max-w-48 truncate font-semibold text-sm leading-5",
					author.isDeleted ? "text-muted-foreground" : "text-foreground",
				)}
			>
				{author.name}
			</span>
			<BotTitleBadge
				className={cn(
					"self-center",
					author.isDeleted && "bg-muted text-muted-foreground",
				)}
				title={author.title}
			/>
			{author.isLead ? (
				<>
					<Icons.Crown
						aria-hidden="true"
						className="size-3 shrink-0 self-center text-bot-badge-attention"
						data-slot="message-author-lead"
					/>
					<span className="sr-only">{t("transcript.author.lead")}</span>
				</>
			) : null}
			{author.isDeleted ? (
				<span
					data-slot="message-author-deleted"
					title={t("transcript.author.deleted")}
					className="inline-flex items-center self-center"
				>
					<Icons.Delete aria-hidden="true" className="size-3 shrink-0" />
					<span className="sr-only">{t("transcript.author.deleted")}</span>
				</span>
			) : null}
			{children}
		</MessageHeader>
	)
}

const SentTime = ({ at, label, className }: SentTimeProps) => (
	<TooltipHint content={formatSentDate(at)}>
		<time
			data-slot="message-time"
			dateTime={new Date(at).toISOString()}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: the full date tooltip opens on keyboard focus
			tabIndex={0}
			className={cn(
				"whitespace-nowrap tabular-nums outline-offset-2",
				className,
			)}
		>
			{label}
		</time>
	</TooltipHint>
)

export function MessageTime({ at, now, className }: MessageTimeProps) {
	const { i18n } = useTranslation()

	return (
		<SentTime
			at={at}
			label={sentLabel(at, now, i18n.language)}
			className={cn("text-xs leading-4", className)}
		/>
	)
}

export function MessageClock({ at, className }: MessageClockProps) {
	useTranslation()

	return <SentTime at={at} label={formatClock(at)} className={className} />
}

export function MessageFooter({ className, ...props }: MessageFooterProps) {
	return (
		<div
			data-slot="message-footer"
			className={cn(
				"flex min-h-5 items-center gap-1 px-1 text-xs text-muted-foreground",
				className,
			)}
			{...props}
		/>
	)
}
