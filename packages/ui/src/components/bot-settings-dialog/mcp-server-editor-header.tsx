"use client"

import { useTranslation } from "react-i18next"

import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { ApplicationMark } from "@workspace/ui/components/plugin-settings/application-mark"
import { SETTINGS_TAG_CLASS } from "@workspace/ui/components/settings-styles"
import { Button, buttonVariants } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type McpServerEditorLayout = "dialog" | "page"

type McpServerEditorHeaderStyle = {
	root: string
	identity: string
	mark: "xsm" | "md"
	name: string
}

const MCP_SERVER_EDITOR_HEADER_STYLE = {
	dialog: {
		root: "flex shrink-0 items-center justify-between gap-2 border-border border-b px-5 py-3",
		identity: "flex min-w-0 items-center gap-2",
		mark: "xsm",
		name: "truncate font-medium text-foreground text-sm",
	},
	page: {
		root: "flex shrink-0 items-start justify-between gap-4",
		identity: "flex min-w-0 items-center gap-3",
		mark: "md",
		name: "wrap-break-word font-semibold text-2xl text-foreground tracking-[-0.01em]",
	},
} as const satisfies Record<McpServerEditorLayout, McpServerEditorHeaderStyle>

type McpServerEditorHeaderProps = {
	layout?: McpServerEditorLayout
	subtitle?: string
	mark?: string
	name: string
	isNameMonospace: boolean
	isUnsaved: boolean
	isWritten: boolean
	isPending: boolean
	defaultConfirming?: boolean
	onDelete?: () => void
	onSave: () => void
}

const McpServerEditorHeader = ({
	layout = "dialog",
	subtitle,
	mark,
	name,
	isNameMonospace,
	isUnsaved,
	isWritten,
	isPending,
	defaultConfirming,
	onDelete,
	onSave,
}: McpServerEditorHeaderProps) => {
	const { t } = useTranslation("bots")
	const style = MCP_SERVER_EDITOR_HEADER_STYLE[layout]
	const unsavedTag =
		isUnsaved && isWritten ? (
			<span className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}>
				{t("applications.unsaved")}
			</span>
		) : null
	const nameClass = cn(style.name, isNameMonospace && "font-mono")

	return (
		<div className={style.root}>
			<div className={style.identity}>
				<ApplicationMark mark={mark} size={style.mark} />
				{layout === "page" ? (
					<div className="flex min-w-0 flex-col">
						<h2 className={nameClass}>{name}</h2>
						<div className="flex min-w-0 items-center gap-2">
							{subtitle ? (
								<span className="truncate text-compact text-muted-foreground leading-4.5">
									{subtitle}
								</span>
							) : null}
							{unsavedTag}
						</div>
					</div>
				) : (
					<>
						<span className={nameClass}>{name}</span>
						{unsavedTag}
					</>
				)}
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{isWritten && onDelete ? (
					<ConfirmDialog
						confirmLabel={t("applications.delete.action")}
						defaultOpen={defaultConfirming}
						description={t("applications.delete.description")}
						onConfirm={onDelete}
						title={t("applications.delete.confirm.title", { name })}
						trigger={
							<>
								<Icons.Delete aria-hidden="true" className="size-3.5" />
								{t("applications.delete.action")}
							</>
						}
						triggerClassName={buttonVariants({
							variant: "destructive",
							size: "sm",
						})}
					/>
				) : null}
				<Button disabled={isPending} onClick={onSave} size="sm">
					{isWritten ? (
						<Icons.Check aria-hidden="true" className="size-3.5" />
					) : (
						<Icons.Add aria-hidden="true" className="size-3.5" />
					)}
					{isWritten ? t("applications.save") : t("applications.create")}
				</Button>
			</div>
		</div>
	)
}

export { McpServerEditorHeader, type McpServerEditorLayout }
