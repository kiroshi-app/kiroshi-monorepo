"use client"

import { type ReactNode, useId } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { ProgressRing } from "@workspace/ui/components/progress-ring"
import {
	SIDEBAR_GLYPH_BOX,
	SIDEBAR_ROW_INSET,
} from "@workspace/ui/components/sidebar-menu-row"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
import { cn } from "@workspace/ui/lib/utils"

type UpdateBadgeStatus =
	| "idle"
	| "available"
	| "downloading"
	| "ready"
	| "error"

interface UpdateBadgeProps {
	status: UpdateBadgeStatus
	version?: string
	progress?: number
	activeBotCount?: number
	onDownload?: () => void
	onRestart?: () => void
	className?: string
}

const BADGE_SIZE = "size-9"

const BADGE_FRAME = "inline-flex items-center justify-center"

const BADGE_BUTTON = "rounded-full"

interface UpdateActionProps {
	status: Extract<UpdateBadgeStatus, "available" | "downloading" | "error">
	progress: number
	onDownload?: () => void
	className?: string
}

const UpdateAction = ({
	status,
	progress,
	onDownload,
	className,
}: UpdateActionProps) => {
	const { t } = useTranslation("common")
	const isDownloading = status === "downloading"
	const label = t(`update.badge.${status}`)
	const button = (
		<TooltipButton
			data-slot="update-badge"
			data-status={status}
			aria-label={status === "error" ? t("update.badge.retry") : label}
			tooltip={label}
			tooltipSide="right"
			size="icon-sm"
			variant={status === "error" ? "destructive" : "default"}
			disabled={isDownloading}
			onClick={onDownload}
			className={BADGE_BUTTON}
		>
			{status === "error" ? <Icons.Retry /> : <Icons.ArrowUp />}
		</TooltipButton>
	)

	if (!isDownloading)
		return (
			<span className={cn(BADGE_FRAME, BADGE_SIZE, className)}>{button}</span>
		)

	return (
		<ProgressRing
			aria-label={label}
			className={cn(BADGE_SIZE, className)}
			data-slot="update-badge-ring"
			value={progress}
		>
			{button}
		</ProgressRing>
	)
}

interface UpdateReadyProps {
	version?: string
	activeBotCount: number
	onRestart?: () => void
	className?: string
}

const UpdateReady = ({
	version,
	activeBotCount,
	onRestart,
	className,
}: UpdateReadyProps) => {
	const { t } = useTranslation("common")
	const isBlocked = activeBotCount > 0
	const versionLabel = version
		? t("update.badge.readyVersion", { version })
		: t("update.badge.ready")
	const label = isBlocked
		? t("update.badge.botsBusy", { count: activeBotCount })
		: versionLabel

	return (
		<span className={cn(BADGE_FRAME, BADGE_SIZE, className)}>
			<TooltipButton
				data-slot="update-badge"
				data-status="ready"
				aria-label={label}
				tooltip={label}
				tooltipSide="right"
				size="icon-sm"
				disabled={isBlocked}
				focusableWhenDisabled
				onClick={onRestart}
				className={cn(BADGE_BUTTON, "data-disabled:opacity-50")}
			>
				<Icons.Restart />
			</TooltipButton>
		</span>
	)
}

const UpdateBadge = ({
	status,
	version,
	progress = 0,
	activeBotCount = 0,
	onDownload,
	onRestart,
	className,
}: UpdateBadgeProps) => {
	if (status === "idle") return null

	if (status === "ready")
		return (
			<UpdateReady
				version={version}
				activeBotCount={activeBotCount}
				onRestart={onRestart}
				className={className}
			/>
		)

	return (
		<UpdateAction
			status={status}
			progress={progress}
			onDownload={onDownload}
			className={className}
		/>
	)
}

const UPDATE_ROW = cn(
	SIDEBAR_ROW_INSET,
	"flex w-full min-w-0 items-center gap-2 rounded-control bg-update-row text-start font-medium text-sm",
)

const UPDATE_ROW_PRESSABLE =
	"hover:bg-rail-item-selected focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"

const UPDATE_ROW_FAILED =
	"bg-update-failed-surface text-update-failed hover:bg-update-failed-surface"

const UPDATE_DISC_BOX = cn(SIDEBAR_GLYPH_BOX, "aspect-square w-auto shrink-0")

const UPDATE_DISC = cn(
	UPDATE_DISC_BOX,
	"grid place-items-center rounded-full bg-foreground text-on-foreground [&_svg]:size-3 [&_svg]:stroke-[2.5]",
)

const UPDATE_DISC_FAILED = "bg-update-failed text-update-failed-foreground"

const UPDATE_RING = cn(
	UPDATE_DISC_BOX,
	"[&_circle]:stroke-[3.6] [&_circle:first-child]:stroke-update-track [&_circle:last-child]:stroke-foreground",
)

const UPDATE_LABEL = "min-w-0 flex-1 truncate"

const UPDATE_BLOCKED = "items-start"

const UPDATE_BLOCKED_TEXT = "flex min-w-0 flex-1 flex-col gap-0.5"

const UPDATE_BLOCKED_REASON = "font-normal text-muted-foreground text-xs"

type UpdatePressRowProps = {
	icon: ReactNode
	label: string
	isFailed?: boolean
	onPress?: () => void
	className?: string
}

const UpdatePressRow = ({
	icon,
	label,
	isFailed = false,
	onPress,
	className,
}: UpdatePressRowProps) => (
	<button
		className={cn(
			UPDATE_ROW,
			UPDATE_ROW_PRESSABLE,
			isFailed ? UPDATE_ROW_FAILED : "text-foreground",
			className,
		)}
		data-slot="update-row"
		onClick={onPress}
		type="button"
	>
		<span
			aria-hidden="true"
			className={cn(UPDATE_DISC, isFailed && UPDATE_DISC_FAILED)}
		>
			{icon}
		</span>
		<span className={UPDATE_LABEL}>{label}</span>
	</button>
)

const UpdateRow = ({
	status,
	version,
	progress = 0,
	activeBotCount = 0,
	onDownload,
	onRestart,
	className,
}: UpdateBadgeProps) => {
	const { t } = useTranslation("common")
	const labelId = useId()

	if (status === "idle") return null

	if (status === "available")
		return (
			<UpdatePressRow
				className={className}
				icon={<Icons.ArrowUp />}
				label={t("update.badge.available")}
				onPress={onDownload}
			/>
		)

	if (status === "error")
		return (
			<UpdatePressRow
				className={className}
				icon={<Icons.UpdateRetry />}
				isFailed
				label={t("update.badge.error")}
				onPress={onDownload}
			/>
		)

	if (status === "downloading")
		return (
			<div
				className={cn(UPDATE_ROW, "text-muted-foreground", className)}
				data-slot="update-row"
			>
				<ProgressRing
					aria-labelledby={labelId}
					className={UPDATE_RING}
					value={progress}
				/>
				<span className={UPDATE_LABEL} id={labelId}>
					{t("update.badge.downloading")}
				</span>
			</div>
		)

	const readyLabel = version
		? t("update.badge.readyVersion", { version })
		: t("update.badge.ready")

	if (activeBotCount === 0)
		return (
			<UpdatePressRow
				className={className}
				icon={<Icons.UpdateRestart />}
				label={readyLabel}
				onPress={onRestart}
			/>
		)

	return (
		<div
			className={cn(UPDATE_ROW, UPDATE_BLOCKED, className)}
			data-slot="update-row"
		>
			<span aria-hidden="true" className={cn(UPDATE_DISC, "opacity-50")}>
				<Icons.UpdateRestart />
			</span>
			<span className={UPDATE_BLOCKED_TEXT}>
				<span className="text-update-blocked-foreground">{readyLabel}</span>
				<span className={UPDATE_BLOCKED_REASON}>
					{t("update.badge.botsBusy", { count: activeBotCount })}
				</span>
			</span>
		</div>
	)
}

export {
	UPDATE_DISC,
	UPDATE_DISC_FAILED,
	UPDATE_RING,
	UpdateBadge,
	type UpdateBadgeProps,
	type UpdateBadgeStatus,
	UpdateRow,
}
