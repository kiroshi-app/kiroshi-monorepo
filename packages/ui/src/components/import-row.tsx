"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Icons } from "@workspace/ui/components/icons"
import { Checkbox } from "@workspace/ui/components/ui/checkbox"
import { cn } from "@workspace/ui/lib/utils"

type ImportRowKind = "companion" | "instructions" | "skill"

type ImportRowStatus = "done" | "pending" | "failed"

type ImportRowProps = {
	kind: ImportRowKind
	title: string
	detail: string
	hue?: number | null
	checked?: boolean
	isInKiroshi?: boolean
	status?: ImportRowStatus
	onCheckedChange?: (checked: boolean) => void
}

const COMPANION_SIZE = 28

const KIND_ICON = {
	instructions: Icons.File,
	skill: Icons.Skill,
} as const

const STATUS_ICON = {
	done: { Icon: Icons.Success, className: "text-success" },
	pending: {
		Icon: Icons.Loading,
		className: "animate-spin text-muted-foreground motion-reduce:animate-none",
	},
	failed: { Icon: Icons.AlertCircle, className: "text-destructive" },
} as const

type ImportRowStatusIconProps = {
	status: ImportRowStatus
}

const ImportRowStatusIcon = ({ status }: ImportRowStatusIconProps) => {
	const { t } = useTranslation("common")
	const { Icon, className } = STATUS_ICON[status]

	return (
		<span
			aria-label={t(`claudeImport.row.status.${status}`)}
			className="flex"
			role="img"
		>
			<Icon aria-hidden="true" className={cn("size-4", className)} />
		</span>
	)
}

type ImportRowMediaProps = Pick<ImportRowProps, "kind" | "title" | "hue">

const ImportRowMedia = ({ kind, title, hue }: ImportRowMediaProps) => {
	if (kind === "companion") {
		return <BotIdentityAvatar hue={hue} name={title} size={COMPANION_SIZE} />
	}

	const Icon = KIND_ICON[kind]
	return <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
}

const ImportRow = ({
	kind,
	title,
	detail,
	hue,
	checked = false,
	isInKiroshi = false,
	status,
	onCheckedChange,
}: ImportRowProps) => {
	const { t } = useTranslation("common")
	const titleId = useId()

	return (
		<div
			className="flex items-center gap-3.5 px-3.5 py-2.75"
			data-slot="import-row"
		>
			<span className="flex size-4.5 shrink-0 items-center justify-center">
				{status ? (
					<ImportRowStatusIcon status={status} />
				) : (
					<Checkbox
						aria-labelledby={titleId}
						checked={checked && !isInKiroshi}
						className="size-4.5 transition-none data-disabled:opacity-50"
						disabled={isInKiroshi}
						onCheckedChange={(next) => onCheckedChange?.(next)}
					/>
				)}
			</span>
			<span className="flex size-7 shrink-0 items-center justify-center">
				<ImportRowMedia hue={hue} kind={kind} title={title} />
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5 wrap-break-word">
				<span
					className={cn(
						"font-medium text-compact text-foreground leading-4.5",
						kind === "instructions" && "font-mono",
					)}
					id={titleId}
				>
					{title}
				</span>
				<span
					className={cn(
						"text-xs",
						status === "failed" ? "text-destructive" : "text-muted-foreground",
					)}
				>
					{isInKiroshi ? t("claudeImport.row.inKiroshi") : detail}
				</span>
			</span>
			<span className="shrink-0 text-muted-foreground text-xs">
				{t(`claudeImport.row.type.${kind}`)}
			</span>
		</div>
	)
}

export {
	ImportRow,
	type ImportRowKind,
	type ImportRowProps,
	type ImportRowStatus,
}
