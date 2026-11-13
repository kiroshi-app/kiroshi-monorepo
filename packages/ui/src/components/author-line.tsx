"use client"

import {
	type ReactElement,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { BotTitleBadge } from "@workspace/ui/components/bot-badge"
import { hueStyle } from "@workspace/ui/components/hue-palette"
import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type AuthorLineTone = "agent" | "person" | "you" | "deleted"

type AuthorLineEnd = "stopped" | "failed"

type AuthorLineProps = {
	tone: AuthorLineTone
	name: string
	avatar: ReactNode
	hue?: number | null
	badge?: string
	time?: ReactNode
	end?: AuthorLineEnd
	onRetry?: () => void
	actions?: ReactNode
	isWriting?: boolean
	isSticky?: boolean
	renderIdentity?: (identity: ReactElement) => ReactNode
	className?: string
}

type AuthorLineNameProps = {
	tone: AuthorLineTone
	name: string
	hue?: number | null
}

type AuthorLineActionsProps = {
	actions: ReactNode
	isEndSide: boolean
	isOnOwnBubble: boolean
}

type AuthorLineFailedProps = {
	onRetry?: () => void
}

type AuthorLineQueuedProps = {
	onCancel?: () => void
}

const AUTHOR_LINE = "flex h-5 min-w-0 max-w-full items-center gap-2"

const GIVES_WAY_TO_THE_NAME = "min-w-0 max-w-max grow basis-0 truncate"

const AGENT_TITLE_BADGE =
	"rounded-[5px] bg-muted px-1.5 py-[3px] font-medium text-[11px] text-muted-foreground leading-3"

const TRANSCRIPT_VIEWPORT = '[data-slot="message-scroller-viewport"]'

const AUTHOR_LINE_STICKY =
	"sticky bottom-(--bubble-padding) z-10 self-stretch before:pointer-events-none before:absolute before:-inset-(--bubble-padding) before:-z-10 before:hidden before:border-shell-border before:border-t before:bg-card before:bg-[image:linear-gradient(var(--bubble-surface,var(--bubble)),var(--bubble-surface,var(--bubble)))] data-[stuck=true]:before:block"

const useStuckToBottom = (isSticky: boolean) => {
	const lineRef = useRef<HTMLDivElement>(null)
	const markerRef = useRef<HTMLSpanElement>(null)
	const [isStuck, setIsStuck] = useState(false)

	useEffect(() => {
		const line = lineRef.current
		const marker = markerRef.current
		if (!isSticky || !line || !marker) return

		const stuckInset = Number.parseFloat(getComputedStyle(line).bottom)
		if (!Number.isFinite(stuckInset)) return

		const root = marker.closest<HTMLElement>(TRANSCRIPT_VIEWPORT)
		const observer = new IntersectionObserver(
			([entry]) => {
				const edge =
					(entry.rootBounds?.bottom ?? window.innerHeight) - stuckInset
				setIsStuck(
					!entry.isIntersecting && entry.boundingClientRect.top >= edge,
				)
			},
			{ root, rootMargin: `0px 0px -${stuckInset}px 0px` },
		)
		observer.observe(marker)

		return () => observer.disconnect()
	}, [isSticky])

	return { lineRef, markerRef, isStuck }
}

const NAME_TONE = {
	agent: "text-primary",
	person: "text-soft-foreground",
	you: "text-user-bubble-foreground",
	deleted: "text-muted-foreground",
} as const satisfies Record<AuthorLineTone, string>

const REVEALS_WITH_BUBBLE =
	"hidden group-focus-within/bubble-content:flex group-hover/bubble-content:flex"

type AuthorLineDividerProps = {
	isOnOwnBubble?: boolean
}

const AuthorLineDivider = ({
	isOnOwnBubble = false,
}: AuthorLineDividerProps) => (
	<span
		aria-hidden="true"
		className={cn(
			"h-3 w-px shrink-0",
			isOnOwnBubble ? "bg-user-bubble-foreground/12" : "bg-foreground/12",
		)}
	/>
)

const AuthorLineName = ({ tone, name, hue }: AuthorLineNameProps) => {
	const isTinted = tone === "agent" && hue != null

	return (
		<span
			data-slot="author-line-name"
			data-hue={isTinted ? hue : undefined}
			style={isTinted ? hueStyle(hue) : undefined}
			className={cn(
				"min-w-0 truncate font-semibold text-compact leading-4",
				NAME_TONE[tone],
			)}
		>
			{name}
		</span>
	)
}

const AuthorLineActions = ({
	actions,
	isEndSide,
	isOnOwnBubble,
}: AuthorLineActionsProps) => (
	<span
		data-slot="author-line-actions"
		className={cn(
			"shrink-0 items-center gap-2 [&_button]:transition-none",
			isEndSide ? REVEALS_WITH_BUBBLE : "flex",
			isOnOwnBubble && "[&_button]:text-user-bubble-muted-foreground",
		)}
	>
		{isEndSide ? null : <AuthorLineDivider isOnOwnBubble={isOnOwnBubble} />}
		<span className="flex items-center gap-0.5">{actions}</span>
		{isEndSide ? <AuthorLineDivider isOnOwnBubble={isOnOwnBubble} /> : null}
	</span>
)

const AuthorLineFailed = ({ onRetry }: AuthorLineFailedProps) => {
	const { t } = useTranslation("chat")

	return (
		<>
			<AuthorLineDivider />
			<span
				data-slot="author-line-failed"
				className="min-w-0 truncate text-destructive text-xs leading-5"
			>
				{t("turn.footer.failed")}
			</span>
			{onRetry ? (
				<Button
					variant="ghost"
					onClick={onRetry}
					className="h-5.5 shrink-0 rounded-sm border-foreground/15 px-2 font-medium text-foreground text-xs"
				>
					{t("turn.retry")}
				</Button>
			) : null}
		</>
	)
}

const AuthorLineStopped = () => {
	const { t } = useTranslation("chat")

	return (
		<>
			<AuthorLineDivider />
			<span
				data-slot="author-line-stopped"
				className="shrink-0 text-soft-foreground text-xs leading-5"
			>
				{t("turn.footer.cancelled")}
			</span>
		</>
	)
}

const AuthorLineWriting = () => {
	const { t } = useTranslation("chat")

	return (
		<span
			data-slot="author-line-writing"
			className="shrink-0 text-muted-foreground text-xs leading-4"
		>
			{t("turn.footer.writing")}
		</span>
	)
}

const AuthorLine = ({
	tone,
	name,
	avatar,
	hue,
	badge,
	time,
	end,
	onRetry,
	actions,
	isWriting = false,
	isSticky = false,
	renderIdentity,
	className,
}: AuthorLineProps) => {
	const isEndSide = tone === "person" || tone === "you"
	const isOnOwnBubble = tone === "you"
	const shownTime =
		time && end !== "failed" && !isWriting ? (
			<span
				className={cn(
					"shrink-0 text-xs leading-4",
					isOnOwnBubble
						? "text-user-bubble-muted-foreground"
						: "text-muted-foreground",
				)}
			>
				{time}
			</span>
		) : null
	const actionRow =
		actions && !isWriting ? (
			<AuthorLineActions
				actions={actions}
				isEndSide={isEndSide}
				isOnOwnBubble={isOnOwnBubble}
			/>
		) : null
	const { lineRef, markerRef, isStuck } = useStuckToBottom(isSticky)
	const identity = (
		<span className="flex min-w-0 items-center gap-2">
			<span className="flex size-5 shrink-0 items-center justify-center">
				{avatar}
			</span>
			<AuthorLineName tone={tone} name={name} hue={hue} />
		</span>
	)

	return (
		<>
			<div
				ref={lineRef}
				data-slot="author-line"
				data-tone={tone}
				data-stuck={isSticky ? isStuck : undefined}
				className={cn(
					AUTHOR_LINE,
					isEndSide && "justify-end self-end",
					isSticky && AUTHOR_LINE_STICKY,
					className,
				)}
			>
				{isEndSide ? actionRow : null}
				{renderIdentity ? renderIdentity(identity) : identity}
				{tone === "agent" ? (
					<BotTitleBadge
						title={badge}
						variant="line"
						className={AGENT_TITLE_BADGE}
					/>
				) : null}
				{shownTime}
				{isWriting ? <AuthorLineWriting /> : null}
				{end === "stopped" ? <AuthorLineStopped /> : null}
				{end === "failed" ? <AuthorLineFailed onRetry={onRetry} /> : null}
				{isEndSide ? null : actionRow}
			</div>
			{isSticky ? (
				<span ref={markerRef} aria-hidden="true" className="-mt-2 block h-0" />
			) : null}
		</>
	)
}

const AuthorLineQueued = ({ onCancel }: AuthorLineQueuedProps) => {
	const { t } = useTranslation("chat")

	return (
		<div
			data-slot="author-line-queued"
			className="flex h-7 items-center gap-2 self-end rounded-[10px] bg-primary/35 ps-2.5 pe-1 text-foreground text-xs"
		>
			<span className="leading-5">{t("turn.footer.queued")}</span>
			{onCancel ? (
				<>
					<AuthorLineDivider />
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label={t("turn.cancel")}
						onClick={onCancel}
						className="rounded-sm"
					>
						<Icons.Close aria-hidden="true" className="size-3" />
					</Button>
				</>
			) : null}
		</div>
	)
}

export {
	AuthorLine,
	AuthorLineDivider,
	type AuthorLineEnd,
	AuthorLineName,
	type AuthorLineProps,
	AuthorLineQueued,
	type AuthorLineTone,
	GIVES_WAY_TO_THE_NAME,
}
