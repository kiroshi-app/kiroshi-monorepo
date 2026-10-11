import {
	type ComponentPropsWithRef,
	createContext,
	type ReactNode,
	useContext,
} from "react"
import { useTranslation } from "react-i18next"

import { BotTitleBadge } from "@workspace/ui/components/bot-badge"
import { Icons } from "@workspace/ui/components/icons"
import { MessageSideContext } from "@workspace/ui/components/message-side-context"
import type { RosterBot } from "@workspace/ui/components/roster"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import { formatDateTime, toRelativeTime } from "@workspace/ui/lib/time-format"
import { cn } from "@workspace/ui/lib/utils"

export type MessageFrom = "user" | "assistant"

interface MessageContextValue {
	from: MessageFrom
}

const MessageContext = createContext<MessageContextValue>({
	from: "assistant",
})

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

const sentAgo = (at: number, now: number) =>
	now - at < DAY_MS
		? toRelativeTime(Math.min(at, now), now)
		: toRelativeTime(now - calendarDaysBetween(at, now) * DAY_MS, now)

export function Message({ from, children, className, ...props }: MessageProps) {
	const { t } = useTranslation("chat")

	return (
		<MessageSideContext.Provider value={from === "user" ? "end" : "start"}>
			<MessageContext.Provider value={{ from }}>
				<article
					data-slot="message"
					data-from={from}
					aria-label={props["aria-label"] ?? t(`transcript.message.${from}`)}
					className={cn(
						"group/message flex w-full items-start gap-2",
						from === "user" ? "flex-row-reverse" : "flex-row",
						className,
					)}
					{...props}
				>
					{children}
				</article>
			</MessageContext.Provider>
		</MessageSideContext.Provider>
	)
}

export function MessageContent({ className, ...props }: MessageContentProps) {
	const { from } = useContext(MessageContext)

	return (
		<div
			data-slot="message-content"
			className={cn(
				"flex min-w-0 flex-1 flex-col gap-1.5 text-sm leading-6",
				from === "user" ? "items-end" : "items-start",
				className,
			)}
			{...props}
		/>
	)
}

export function MessageHeader({ className, ...props }: MessageHeaderProps) {
	const { from } = useContext(MessageContext)

	return (
		<div
			data-slot="message-header"
			className={cn(
				"flex items-center gap-1.5 px-1 text-xs leading-none text-muted-foreground",
				from === "user" ? "justify-end" : "justify-start",
				className,
			)}
			{...props}
		/>
	)
}

export function MessageAuthor({
	author,
	className,
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
					"max-w-48 truncate font-medium",
					author.isDeleted ? "text-muted-foreground" : "text-foreground/80",
				)}
			>
				{author.name}
			</span>
			<BotTitleBadge
				className={cn(author.isDeleted && "bg-muted text-muted-foreground")}
				title={author.title}
			/>
			{author.isLead ? (
				<>
					<Icons.Crown
						aria-hidden="true"
						className="size-3 shrink-0 text-bot-badge-attention"
						data-slot="message-author-lead"
					/>
					<span className="sr-only">{t("transcript.author.lead")}</span>
				</>
			) : null}
			{author.isDeleted ? (
				<span
					data-slot="message-author-deleted"
					title={t("transcript.author.deleted")}
					className="inline-flex items-center"
				>
					<Icons.Delete aria-hidden="true" className="size-3 shrink-0" />
					<span className="sr-only">{t("transcript.author.deleted")}</span>
				</span>
			) : null}
		</MessageHeader>
	)
}

export function MessageTime({ at, now }: MessageTimeProps) {
	useTranslation()

	return (
		<TooltipHint content={formatSentDate(at)}>
			<time
				data-slot="message-time"
				dateTime={new Date(at).toISOString()}
				className="whitespace-nowrap tabular-nums"
			>
				{sentAgo(at, now)}
			</time>
		</TooltipHint>
	)
}

export function MessageFooter({ className, ...props }: MessageFooterProps) {
	const { from } = useContext(MessageContext)

	return (
		<div
			data-slot="message-footer"
			className={cn(
				"flex min-h-5 items-center gap-1 px-1 text-xs text-muted-foreground",
				from === "user" ? "justify-end" : "justify-start",
				className,
			)}
			{...props}
		/>
	)
}
