"use client"

import { useTranslation } from "react-i18next"

import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { ApplicationMark } from "@workspace/ui/components/plugin-settings/application-mark"
import { SETTINGS_TAG_CLASS } from "@workspace/ui/components/settings-styles"
import { Button, buttonVariants } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type McpServerEditorHeaderProps = {
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

	return (
		<div className="flex shrink-0 items-center justify-between gap-2 border-border border-b px-5 py-3">
			<div className="flex min-w-0 items-center gap-2">
				<ApplicationMark mark={mark} size="xsm" />
				<span
					className={cn(
						"truncate font-medium text-foreground text-sm",
						isNameMonospace && "font-mono",
					)}
				>
					{name}
				</span>
				{isUnsaved && isWritten ? (
					<span className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}>
						{t("applications.unsaved")}
					</span>
				) : null}
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

export { McpServerEditorHeader }
