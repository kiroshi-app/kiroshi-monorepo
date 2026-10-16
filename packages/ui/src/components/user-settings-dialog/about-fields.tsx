"use client"

import { Progress } from "@base-ui/react/progress"
import type { TFunction } from "i18next"
import { useId } from "react"
import { useTranslation } from "react-i18next"

import { type Icon, Icons } from "@workspace/ui/components/icons"
import { SettingsGroup } from "@workspace/ui/components/settings-group"
import {
	SettingsLinkRow,
	SettingsRow,
	SettingsRows,
} from "@workspace/ui/components/settings-row"
import { ToggleSwitch } from "@workspace/ui/components/toggle-switch"
import { Button } from "@workspace/ui/components/ui/button"
import { toRelativeTime } from "@workspace/ui/lib/time-format"
import { cn } from "@workspace/ui/lib/utils"

const UPDATE_CHANNELS = ["stable", "beta"] as const

type UpdateChannel = (typeof UPDATE_CHANNELS)[number]

type UpdateState =
	| { status: "upToDate"; checkedAt: number }
	| { status: "checking" }
	| { status: "available"; version: string }
	| { status: "downloading"; version: string; progress: number }
	| { status: "ready"; version: string; runningCompanions: number }
	| { status: "failed"; version: string }

const hasPendingUpdate = (update: UpdateState) =>
	update.status !== "upToDate" && update.status !== "checking"

type AboutFieldsProps = {
	version: string
	channel: UpdateChannel
	update: UpdateState
	showsWhatsNew: boolean
	onChannelChange: (channel: UpdateChannel) => void
	onShowsWhatsNewChange: (showsWhatsNew: boolean) => void
	onCheck: () => void
	onDownload: () => void
	onRestart: () => void
	onWhatsNew: () => void
	onReleaseNotes: () => void
	className?: string
}

type StatusTone = "muted" | "success" | "accent" | "destructive"

const TONE_CLASS: Record<StatusTone, string> = {
	muted: "text-muted-foreground",
	success: "text-success",
	accent: "text-sidebar-primary",
	destructive: "text-destructive",
}

type StatusLine = {
	icon: Icon
	tone: StatusTone
	isEmphasized?: boolean
	text: string
	hint?: string
}

const statusLineOf = (
	update: UpdateState,
	t: TFunction<"settings">,
): StatusLine => {
	switch (update.status) {
		case "upToDate":
			return {
				icon: Icons.Check,
				tone: "success",
				text: t("about.status.upToDate", {
					when: toRelativeTime(update.checkedAt, Date.now()),
				}),
			}
		case "checking":
			return {
				icon: Icons.Loading,
				tone: "muted",
				text: t("about.status.checking"),
			}
		case "available":
			return {
				icon: Icons.ArrowUp,
				tone: "accent",
				isEmphasized: true,
				text: t("about.status.available", { version: update.version }),
			}
		case "downloading":
			return {
				icon: Icons.Loading,
				tone: "accent",
				text: t("about.status.downloading", { version: update.version }),
			}
		case "ready": {
			const isHeld = update.runningCompanions > 0
			return {
				icon: Icons.Retry,
				tone: "accent",
				isEmphasized: true,
				text: t(isHeld ? "about.status.readyHeld" : "about.status.ready", {
					version: update.version,
				}),
				hint: isHeld
					? t("about.status.running", { count: update.runningCompanions })
					: undefined,
			}
		}
		case "failed":
			return {
				icon: Icons.Alert,
				tone: "destructive",
				isEmphasized: true,
				text: t("about.status.failed", { version: update.version }),
				hint: t("about.status.failedHint"),
			}
	}
}

type UpdateStatusProps = {
	update: UpdateState
	id: string
}

const UpdateStatus = ({ update, id }: UpdateStatusProps) => {
	const { t } = useTranslation("settings")
	const line = statusLineOf(update, t)
	const StatusIcon = line.icon

	return (
		<div
			className="flex flex-col gap-0.5"
			data-slot="about-update-status"
			id={id}
			role="status"
		>
			<span
				className={cn(
					"flex items-start gap-1.5",
					line.isEmphasized && cn("font-medium", TONE_CLASS[line.tone]),
				)}
			>
				<StatusIcon
					aria-hidden="true"
					className={cn(
						"pointer-events-none mt-0.5 size-3 shrink-0",
						StatusIcon === Icons.Loading &&
							"animate-spin motion-reduce:animate-none",
						TONE_CLASS[line.tone],
					)}
				/>
				{line.text}
			</span>
			{line.hint ? <span className="ps-4.5">{line.hint}</span> : null}
		</div>
	)
}

const ACTION_CLASS = "rounded-lg"

const DESTRUCTIVE_ACTION_CLASS = cn(ACTION_CLASS, "dark:bg-destructive/14")

const OUTLINE_ACTION_CLASS = cn(
	ACTION_CLASS,
	"bg-background shadow-xs dark:bg-background",
)

type UpdateActionProps = Pick<
	AboutFieldsProps,
	"update" | "onCheck" | "onDownload" | "onRestart"
> & { statusId: string }

const UpdateAction = ({
	update,
	statusId,
	onCheck,
	onDownload,
	onRestart,
}: UpdateActionProps) => {
	const { t, i18n } = useTranslation("settings")

	switch (update.status) {
		case "upToDate":
		case "checking":
			return (
				<Button
					className={OUTLINE_ACTION_CLASS}
					disabled={update.status === "checking"}
					onClick={onCheck}
					size="sm"
					variant="outline"
				>
					{t("about.action.check")}
				</Button>
			)
		case "available":
			return (
				<Button className={ACTION_CLASS} onClick={onDownload} size="sm">
					{t("about.action.download")}
				</Button>
			)
		case "downloading":
			return (
				<Progress.Root
					aria-labelledby={statusId}
					className="flex shrink-0 items-center gap-2.5"
					locale={i18n.language}
					value={update.progress}
				>
					<Progress.Track className="h-1 w-30 overflow-hidden rounded-full bg-border">
						<Progress.Indicator className="h-full bg-primary" />
					</Progress.Track>
					<Progress.Value className="w-8 text-end font-medium text-foreground text-xs" />
				</Progress.Root>
			)
		case "ready":
			return (
				<Button
					className={ACTION_CLASS}
					disabled={update.runningCompanions > 0}
					onClick={onRestart}
					size="sm"
				>
					{t("about.action.restart")}
				</Button>
			)
		case "failed":
			return (
				<Button
					className={DESTRUCTIVE_ACTION_CLASS}
					onClick={onDownload}
					size="sm"
					variant="destructive"
				>
					{t("about.action.downloadAgain")}
				</Button>
			)
	}
}

type ChannelControlProps = {
	channel: UpdateChannel
	onChannelChange: (channel: UpdateChannel) => void
	labelledBy: string
	describedBy: string
}

const ChannelControl = ({
	channel,
	onChannelChange,
	labelledBy,
	describedBy,
}: ChannelControlProps) => {
	const { t } = useTranslation("settings")
	const name = useId()

	return (
		<div
			aria-describedby={describedBy}
			aria-labelledby={labelledBy}
			className="flex shrink-0 gap-0.5 rounded-lg bg-muted p-0.5"
			role="radiogroup"
		>
			{UPDATE_CHANNELS.map((option) => (
				<label
					className="grid h-6 min-w-15 cursor-pointer place-items-center rounded-md px-2 font-medium text-muted-foreground text-xs has-checked:bg-background has-checked:text-foreground has-checked:shadow-[0_0_0_1px_rgb(0_0_0/6%),0_1px_2px_rgb(0_0_0/10%)] has-focus-visible:ring-2 has-focus-visible:ring-ring"
					key={option}
				>
					<input
						checked={channel === option}
						className="sr-only"
						name={name}
						onChange={() => onChannelChange(option)}
						type="radio"
						value={option}
					/>
					{t(`about.channel.option.${option}`)}
				</label>
			))}
		</div>
	)
}

const BetaNotice = () => {
	const { t } = useTranslation("settings")

	return (
		<div
			className="flex gap-2.5 rounded-xl border border-primary/30 bg-primary/8 p-3"
			data-slot="about-beta-notice"
		>
			<Icons.Info
				aria-hidden="true"
				className="pointer-events-none mt-0.5 size-4 shrink-0 text-sidebar-primary"
			/>
			<div className="flex min-w-0 flex-col gap-0.5 text-xs">
				<p className="font-medium text-foreground leading-5">
					{t("about.betaNotice.title")}
				</p>
				<p className="text-muted-foreground">
					{t("about.betaNotice.description")}
				</p>
			</div>
		</div>
	)
}

const AboutFields = ({
	version,
	channel,
	update,
	showsWhatsNew,
	onChannelChange,
	onShowsWhatsNewChange,
	onCheck,
	onDownload,
	onRestart,
	onWhatsNew,
	onReleaseNotes,
	className,
}: AboutFieldsProps) => {
	const { t } = useTranslation("settings")
	const id = useId()
	const ids = {
		status: `${id}-status`,
		channel: `${id}-channel`,
		channelDetail: `${id}-channel-detail`,
		whatsNew: `${id}-whats-new`,
		whatsNewDetail: `${id}-whats-new-detail`,
	}

	return (
		<div
			className={cn("flex flex-col gap-5 tabular-nums", className)}
			data-slot="about-fields"
		>
			<SettingsGroup grid="gap-2" label={t("about.updates.label")}>
				<SettingsRows>
					<SettingsRow
						detail={<UpdateStatus id={ids.status} update={update} />}
						title={t("about.version", { version })}
					>
						<UpdateAction
							onCheck={onCheck}
							onDownload={onDownload}
							onRestart={onRestart}
							statusId={ids.status}
							update={update}
						/>
					</SettingsRow>
					<SettingsRow
						detail={t("about.channel.description")}
						detailId={ids.channelDetail}
						title={t("about.channel.label")}
						titleId={ids.channel}
					>
						<ChannelControl
							channel={channel}
							describedBy={ids.channelDetail}
							labelledBy={ids.channel}
							onChannelChange={onChannelChange}
						/>
					</SettingsRow>
					<SettingsRow
						detail={t("about.whatsNew.description")}
						detailId={ids.whatsNewDetail}
						title={t("about.whatsNew.label")}
						titleId={ids.whatsNew}
					>
						<ToggleSwitch
							aria-describedby={ids.whatsNewDetail}
							aria-labelledby={ids.whatsNew}
							checked={showsWhatsNew}
							onCheckedChange={onShowsWhatsNewChange}
						/>
					</SettingsRow>
				</SettingsRows>
				{channel === "beta" ? <BetaNotice /> : null}
			</SettingsGroup>
			<SettingsGroup grid="gap-2" label={t("about.kiroshi.label")}>
				<SettingsRows>
					<SettingsLinkRow
						icon={Icons.Next}
						label={t("about.kiroshi.whatsNew", { version })}
						onClick={onWhatsNew}
					/>
					<SettingsLinkRow
						aria-label={t("about.kiroshi.releaseNotesName")}
						icon={Icons.ExternalLink}
						label={t("about.kiroshi.releaseNotes")}
						onClick={onReleaseNotes}
					/>
				</SettingsRows>
			</SettingsGroup>
		</div>
	)
}

export {
	AboutFields,
	type AboutFieldsProps,
	hasPendingUpdate,
	type UpdateChannel,
	type UpdateState,
}
