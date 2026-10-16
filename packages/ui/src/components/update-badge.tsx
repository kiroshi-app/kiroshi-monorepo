"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	PopoverPanel,
	PopoverPanelContent,
	PopoverPanelTrigger,
} from "@workspace/ui/components/popover-panel"
import { ProgressRing } from "@workspace/ui/components/progress-ring"
import { ReleaseNotes } from "@workspace/ui/components/release-notes"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import { Button, buttonVariants } from "@workspace/ui/components/ui/button"
import { useOverflowsParent } from "@workspace/ui/hooks/use-overflows-parent"
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
	releaseNotes?: string
	releaseNotesUrl?: string
	progress?: number
	activeBotCount?: number
	onDownload?: () => void
	onRestart?: () => void
	onPostpone?: () => void
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

interface ReleaseNotesLinkProps {
	href: string
}

const ReleaseNotesLink = ({ href }: ReleaseNotesLinkProps) => {
	const { t } = useTranslation("common")
	const label = t("update.panel.releaseNotes")

	return (
		<TooltipHint content={label} side="right">
			<a
				data-slot="update-release-notes"
				aria-label={label}
				href={href}
				target="_blank"
				rel="noreferrer noopener"
				className={cn(
					buttonVariants({ variant: "ghost", size: "icon-sm" }),
					"ms-auto text-muted-foreground",
				)}
			>
				<Icons.ExternalLink />
			</a>
		</TooltipHint>
	)
}

interface UpdateNotesProps {
	body: string
}

const UpdateNotes = ({ body }: UpdateNotesProps) => {
	const { t } = useTranslation("common")
	const { overflows, contentRef } = useOverflowsParent()

	return (
		<div
			data-slot="update-notes"
			className="min-h-0 overflow-y-auto focus-visible:outline-offset-2"
			{...(overflows && {
				role: "region",
				"aria-label": t("update.panel.notes"),
				tabIndex: 0,
			})}
		>
			<div ref={contentRef}>
				<ReleaseNotes body={body} size="xs" />
			</div>
		</div>
	)
}

interface UpdateReadyProps {
	version?: string
	releaseNotes?: string
	releaseNotesUrl?: string
	activeBotCount: number
	onRestart?: () => void
	onPostpone?: () => void
	className?: string
}

const UpdateReady = ({
	version,
	releaseNotes,
	releaseNotesUrl,
	activeBotCount,
	onRestart,
	onPostpone,
	className,
}: UpdateReadyProps) => {
	const { t } = useTranslation("common")
	const [isOpen, setIsOpen] = useState(true)
	const isBlocked = activeBotCount > 0
	const title = t("update.panel.title")

	const postpone = () => {
		setIsOpen(false)
		onPostpone?.()
	}

	return (
		<PopoverPanel
			open={isOpen}
			onOpenChange={setIsOpen}
			placement="top-start"
			className={cn(BADGE_FRAME, BADGE_SIZE, className)}
		>
			<PopoverPanelTrigger>
				<Button
					data-slot="update-badge"
					data-status="ready"
					aria-label={t("update.badge.ready")}
					size="icon-sm"
					variant="default"
					className={BADGE_BUTTON}
				>
					<Icons.Restart />
				</Button>
			</PopoverPanelTrigger>
			<PopoverPanelContent
				aria-label={title}
				className="max-h-(--available-height)"
			>
				<div data-slot="update-panel" className="flex min-h-0 flex-col gap-3">
					<div className="flex flex-col gap-1">
						<p className="font-medium text-sm">{title}</p>
						{version ? (
							<p className="text-muted-foreground text-xs">
								{t("update.panel.version", { version })}
							</p>
						) : null}
					</div>
					{releaseNotes?.trim() ? <UpdateNotes body={releaseNotes} /> : null}
					{isBlocked ? (
						<p className="text-bot-badge-attention text-xs">
							{t("update.panel.botsBusy", { count: activeBotCount })}
						</p>
					) : null}
					<div className="flex items-center gap-2">
						<Button size="sm" disabled={isBlocked} onClick={onRestart}>
							{t("update.panel.restart")}
						</Button>
						<Button size="sm" variant="ghost" onClick={postpone}>
							{t("update.panel.postpone")}
						</Button>
						{releaseNotesUrl ? (
							<ReleaseNotesLink href={releaseNotesUrl} />
						) : null}
					</div>
				</div>
			</PopoverPanelContent>
		</PopoverPanel>
	)
}

const UpdateBadge = ({
	status,
	version,
	releaseNotes,
	releaseNotesUrl,
	progress = 0,
	activeBotCount = 0,
	onDownload,
	onRestart,
	onPostpone,
	className,
}: UpdateBadgeProps) => {
	if (status === "idle") return null

	if (status === "ready")
		return (
			<UpdateReady
				version={version}
				releaseNotes={releaseNotes}
				releaseNotesUrl={releaseNotesUrl}
				activeBotCount={activeBotCount}
				onRestart={onRestart}
				onPostpone={onPostpone}
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
