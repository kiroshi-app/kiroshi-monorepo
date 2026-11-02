"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

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
	isSticky?: boolean
	className?: string
}

type AuthorLineNameProps = {
	tone: AuthorLineTone
	name: string
	hue?: number | null
}

type AuthorLineBadgeProps = {
	badge: string
}

type AuthorLineActionsProps = {
	actions: ReactNode
	isOnOwnBubble: boolean
}

type AuthorLineFailedProps = {
	onRetry?: () => void
}

type AuthorLineQueuedProps = {
	onCancel?: () => void
}

const AUTHOR_LINE = "flex h-5 min-w-0 max-w-full items-center gap-2"

const AUTHOR_LINE_STICKY =
	"sticky bottom-0 -mx-4.5 -mb-4.5 h-13 rounded-b-2xl border-foreground/6 border-t bg-author-line-sticky px-4.5"

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
				"min-w-0 truncate font-semibold text-compact leading-5",
				NAME_TONE[tone],
			)}
		>
			{name}
		</span>
	)
}

const AuthorLineBadge = ({ badge }: AuthorLineBadgeProps) => (
	<span
		data-slot="author-line-role"
		className="shrink-0 rounded-sm bg-foreground/8 px-1.5 text-soft-foreground text-xs leading-5"
	>
		{badge}
	</span>
)

const AuthorLineActions = ({
	actions,
	isOnOwnBubble,
}: AuthorLineActionsProps) => (
	<span
		data-slot="author-line-actions"
		className={cn(
			"shrink-0 items-center gap-2",
			REVEALS_WITH_BUBBLE,
			isOnOwnBubble && "[&_button]:text-user-bubble-muted-foreground",
		)}
	>
		<AuthorLineDivider isOnOwnBubble={isOnOwnBubble} />
		<span className="flex items-center gap-0.5">{actions}</span>
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
	isSticky = false,
	className,
}: AuthorLineProps) => {
	const isEndSide = tone === "person" || tone === "you"
	const isOnOwnBubble = tone === "you"
	const shownTime =
		time && end !== "failed" ? (
			<span
				className={cn(
					"shrink-0 text-xs leading-5",
					isOnOwnBubble
						? "text-user-bubble-muted-foreground"
						: "text-muted-foreground",
				)}
			>
				{time}
			</span>
		) : null
	const actionRow = actions ? (
		<AuthorLineActions actions={actions} isOnOwnBubble={isOnOwnBubble} />
	) : null

	return (
		<div
			data-slot="author-line"
			data-tone={tone}
			className={cn(
				AUTHOR_LINE,
				isEndSide && "justify-end self-end",
				isSticky && AUTHOR_LINE_STICKY,
				className,
			)}
		>
			{isEndSide ? actionRow : null}
			<span className="flex size-5 shrink-0 items-center justify-center">
				{avatar}
			</span>
			<AuthorLineName tone={tone} name={name} hue={hue} />
			{badge && tone === "agent" ? <AuthorLineBadge badge={badge} /> : null}
			{shownTime}
			{end === "stopped" ? <AuthorLineStopped /> : null}
			{end === "failed" ? <AuthorLineFailed onRetry={onRetry} /> : null}
			{isEndSide ? null : actionRow}
		</div>
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
						className="size-5 rounded-sm"
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
	type AuthorLineEnd,
	AuthorLineName,
	type AuthorLineProps,
	AuthorLineQueued,
	type AuthorLineTone,
}
