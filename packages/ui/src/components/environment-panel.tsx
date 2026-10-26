"use client"

import { type FormEvent, useState } from "react"
import { useTranslation } from "react-i18next"

import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { DialogSurface } from "@workspace/ui/components/dialog-surface"
import { Icons } from "@workspace/ui/components/icons"
import {
	ListSkeleton,
	SkeletonBar,
} from "@workspace/ui/components/list-skeleton"
import { Notice } from "@workspace/ui/components/notice"
import { SettingsField } from "@workspace/ui/components/settings-field"
import {
	SETTINGS_EMPTY_CLASS,
	SETTINGS_TAG_CLASS,
} from "@workspace/ui/components/settings-styles"
import { Button } from "@workspace/ui/components/ui/button"
import {
	Dialog,
	DialogDescription,
	DialogTitle,
} from "@workspace/ui/components/ui/dialog"
import { useSkeletonTiming } from "@workspace/ui/hooks/use-skeleton-timing"
import { cn } from "@workspace/ui/lib/utils"

const ENVIRONMENT_SCOPES = ["user", "space", "bot", "server"] as const

type EnvironmentScope = (typeof ENVIRONMENT_SCOPES)[number]

type EnvironmentEntry = {
	name: string
	definedIn: EnvironmentScope
	servedFrom: EnvironmentScope
	overrides?: EnvironmentScope
	isUnset?: boolean
}

const ENVIRONMENT_NAME = /^[A-Z_][A-Z0-9_]*$/

const isEnvironmentName = (name: string) => ENVIRONMENT_NAME.test(name)

type EnvironmentWrite = {
	name: string
	value: string
}

type EnvironmentSection = {
	entries: EnvironmentEntry[]
	isPending?: boolean
	hasFailedToRead?: boolean
	onSet: (write: EnvironmentWrite) => void | Promise<void>
	onDelete: (name: string) => void | Promise<void>
}

type EnvironmentPanelProps = EnvironmentSection & {
	scope: EnvironmentScope
}

type EnvironmentWriteDialogProps = {
	written: string
	onSet: (write: EnvironmentWrite) => void | Promise<void>
	onClose: () => void
}

const NEW_NAME = ""

const SECRET_ACTION_CLASS =
	"in-data-companion-page:size-7 in-data-companion-page:text-muted-foreground"

const SECRET_SKELETON_LIST =
	"gap-2 [--skeleton-title:--spacing(27)] [--skeleton-sub:--spacing(51)] [&>:nth-child(3n+2)]:[--skeleton-title:--spacing(31)] [&>:nth-child(3n+2)]:[--skeleton-sub:--spacing(59)] [&>:nth-child(3n)]:[--skeleton-title:--spacing(23)] [&>:nth-child(3n)]:[--skeleton-sub:--spacing(54.5)]"

const EnvironmentWriteDialog = ({
	written,
	onSet,
	onClose,
}: EnvironmentWriteDialogProps) => {
	const { t } = useTranslation("bots")
	const [name, setName] = useState(written)
	const [value, setValue] = useState("")
	const [isRefused, setRefused] = useState(false)
	const [hasFailed, setFailed] = useState(false)
	const [isWriting, setWriting] = useState(false)
	const isReplacing = written !== NEW_NAME

	const submit = async (event: FormEvent) => {
		event.preventDefault()
		const typed = name.trim()

		if (!isEnvironmentName(typed)) {
			setRefused(true)
			return
		}

		setRefused(false)
		setFailed(false)
		setWriting(true)

		try {
			await onSet({ name: typed, value })
			onClose()
		} catch {
			setFailed(true)
		} finally {
			setWriting(false)
		}
	}

	return (
		<Dialog onOpenChange={(open) => (open ? undefined : onClose())} open>
			<DialogSurface className="w-100">
				<DialogTitle className="font-semibold">
					{isReplacing
						? t("secrets.set.replace.title")
						: t("secrets.set.add.title")}
				</DialogTitle>
				<DialogDescription>
					{isReplacing
						? t("secrets.set.replace.description", { name: written })
						: t("secrets.set.add.description")}
				</DialogDescription>

				<form className="flex flex-col gap-4" onSubmit={submit}>
					<SettingsField
						error={isRefused ? t("secrets.set.name.invalid") : undefined}
						hint={t("secrets.set.name.hint")}
						label={t("secrets.set.name.label")}
						onValueChange={(next) => {
							setName(next)
							setRefused(false)
						}}
						placeholder={t("secrets.set.name.placeholder")}
						readOnly={isReplacing}
						value={name}
					/>
					<SettingsField
						hint={t("secrets.set.value.hint")}
						label={t("secrets.set.value.label")}
						kind="password"
						onValueChange={setValue}
						value={value}
					/>

					{hasFailed ? (
						<p className="text-destructive text-xs" role="alert">
							{t("secrets.set.failed")}
						</p>
					) : null}

					<div className="flex justify-end">
						<Button disabled={isWriting} size="sm" type="submit">
							<Icons.Check aria-hidden="true" className="size-3.5" />
							{t("secrets.set.submit")}
						</Button>
					</div>
				</form>
			</DialogSurface>
		</Dialog>
	)
}

type EnvironmentRowProps = {
	entry: EnvironmentEntry
	scope: EnvironmentScope
	onReplace: () => void
	onRemove: () => void
}

const EnvironmentRow = ({
	entry,
	scope,
	onReplace,
	onRemove,
}: EnvironmentRowProps) => {
	const { t } = useTranslation("bots")
	const isOwned = entry.definedIn === scope
	const isServedElsewhere = entry.servedFrom !== entry.definedIn
	const hasNoValue = entry.isUnset && !isServedElsewhere
	const overriddenBy = !entry.isUnset && isOwned && entry.servedFrom !== scope
	const overriding =
		!entry.isUnset && entry.servedFrom === scope ? entry.overrides : undefined
	const defined = t(`secrets.scope.${entry.definedIn}`)

	return (
		<li className="flex items-center gap-3 rounded-xl border border-border py-2 pr-2 pl-3 in-data-companion-page:rounded-control">
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate font-medium font-mono text-foreground text-sm">
					{entry.name}
				</span>
				<span className="truncate text-muted-foreground text-xs">
					{hasNoValue
						? t("secrets.row.noValue", { defined })
						: t("secrets.row.scopes", {
								defined,
								served: t(`secrets.scope.${entry.servedFrom}`),
							})}
				</span>
			</span>

			{hasNoValue ? (
				<span className={cn(SETTINGS_TAG_CLASS, "text-foreground")}>
					{t("secrets.row.needsValue")}
				</span>
			) : null}
			{entry.isUnset && isServedElsewhere ? (
				<span className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}>
					{t("secrets.row.unsetHere")}
				</span>
			) : null}

			{overriddenBy ? (
				<span className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}>
					{t("secrets.row.overridden", {
						scope: t(`secrets.scope.${entry.servedFrom}`),
					})}
				</span>
			) : null}
			{overriding ? (
				<span className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}>
					{t("secrets.row.overriding", {
						scope: t(`secrets.scope.${overriding}`),
					})}
				</span>
			) : null}

			{isOwned ? (
				<span className="flex shrink-0 items-center gap-1 in-data-companion-page:w-16 in-data-companion-page:justify-end">
					<Button
						aria-label={t("secrets.row.replace", { name: entry.name })}
						className={SECRET_ACTION_CLASS}
						onClick={onReplace}
						size="icon-xs"
						variant="ghost"
					>
						<Icons.Edit aria-hidden="true" className="size-3.5" />
					</Button>
					<Button
						aria-label={t("secrets.row.remove", { name: entry.name })}
						className={SECRET_ACTION_CLASS}
						onClick={onRemove}
						size="icon-xs"
						variant="ghost"
					>
						<Icons.Delete aria-hidden="true" className="size-3.5" />
					</Button>
				</span>
			) : null}
		</li>
	)
}

const SecretRowSkeleton = () => (
	<div className="flex min-h-14 flex-col justify-center gap-0.5 rounded-xl border border-border py-2 ps-3 pe-2 in-data-companion-page:rounded-control">
		<div className="flex h-5 items-center">
			<SkeletonBar className="w-(--skeleton-title)" />
		</div>
		<div className="flex h-4 items-center">
			<SkeletonBar className="w-(--skeleton-sub)" isFaint />
		</div>
	</div>
)

const EnvironmentPanel = ({
	scope,
	entries,
	isPending = false,
	hasFailedToRead,
	onSet,
	onDelete,
}: EnvironmentPanelProps) => {
	const { t } = useTranslation("bots")
	const [written, setWritten] = useState<string | null>(null)
	const [removed, setRemoved] = useState<string | null>(null)
	const phase = useSkeletonTiming(isPending)
	const isAwaiting = phase === "delay" || phase === "skeleton"

	const writeDialog =
		written === null ? null : (
			<EnvironmentWriteDialog
				onClose={() => setWritten(null)}
				onSet={onSet}
				written={written}
			/>
		)

	const removeDialog =
		removed === null ? null : (
			<ConfirmDialog
				confirmLabel={t("secrets.remove.action")}
				description={t("secrets.remove.description")}
				failureLabel={t("secrets.remove.failed")}
				onConfirm={() => onDelete(removed)}
				onOpenChange={() => setRemoved(null)}
				open
				title={t("secrets.remove.title", { name: removed })}
			/>
		)

	const failureNotice = hasFailedToRead ? (
		<Notice
			description={t("secrets.unreadable.description")}
			title={t("secrets.unreadable.title")}
		/>
	) : null

	if (!isAwaiting && entries.length === 0 && hasFailedToRead) {
		return failureNotice
	}

	if (!isAwaiting && entries.length === 0) {
		return (
			<>
				<div className={SETTINGS_EMPTY_CLASS}>
					<Icons.Shield
						aria-hidden="true"
						className="size-8 text-muted-foreground"
					/>
					<div className="flex flex-col gap-1">
						<span className="font-medium text-foreground text-sm">
							{t("secrets.empty.title")}
						</span>
						<p className="max-w-xs text-muted-foreground text-sm">
							{t("secrets.empty.description")}
						</p>
					</div>
					<Button onClick={() => setWritten(NEW_NAME)} size="sm">
						<Icons.Add aria-hidden="true" className="size-3.5" />
						{t("secrets.add")}
					</Button>
				</div>
				{writeDialog}
			</>
		)
	}

	return (
		<>
			{failureNotice}

			<div className="flex shrink-0 items-start justify-between gap-3">
				<p className="max-w-sm text-muted-foreground text-xs leading-relaxed">
					{t("secrets.notice")}
				</p>
				<Button
					onClick={() => setWritten(NEW_NAME)}
					size="sm"
					variant="outline"
				>
					<Icons.Add aria-hidden="true" className="size-3.5" />
					{t("secrets.add")}
				</Button>
			</div>

			{isAwaiting ? (
				<div
					aria-busy="true"
					className="flex min-h-0 flex-1 flex-col"
					data-slot="secrets-pending"
				>
					{phase === "skeleton" ? (
						<ListSkeleton
							className={SECRET_SKELETON_LIST}
							row={<SecretRowSkeleton />}
						/>
					) : null}
				</div>
			) : (
				<ul className="flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-0">
					{entries.map((entry) => (
						<EnvironmentRow
							entry={entry}
							key={entry.name}
							onRemove={() => setRemoved(entry.name)}
							onReplace={() => setWritten(entry.name)}
							scope={scope}
						/>
					))}
				</ul>
			)}

			{writeDialog}
			{removeDialog}
		</>
	)
}

export {
	type EnvironmentEntry,
	EnvironmentPanel,
	type EnvironmentSection,
	type EnvironmentWrite,
}
