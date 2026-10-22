"use client"

import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { ProgressRing } from "@workspace/ui/components/progress-ring"
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
				variant="default"
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

export { UpdateBadge, type UpdateBadgeProps, type UpdateBadgeStatus }
