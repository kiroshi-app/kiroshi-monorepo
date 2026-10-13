"use client"

import { useTranslation } from "react-i18next"

import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { SETTINGS_TAG_CLASS } from "@workspace/ui/components/settings-styles"
import { Button, buttonVariants } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type SkillEditorHeaderProps = {
	name: string
	isUnsaved: boolean
	isWritten: boolean
	isPending: boolean
	onSave: () => void
	onDelete?: () => void
	defaultConfirming?: boolean
}

const SkillEditorHeader = ({
	name,
	isUnsaved,
	isWritten,
	isPending,
	onSave,
	onDelete,
	defaultConfirming,
}: SkillEditorHeaderProps) => {
	const { t } = useTranslation("bots")

	return (
		<div className="flex shrink-0 items-center justify-between gap-2 border-border border-b px-5 py-3">
			<div className="flex min-w-0 items-center gap-2">
				<span className="truncate font-medium text-foreground text-sm">
					{name}
				</span>
				{isUnsaved ? (
					<span className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}>
						{t("skills.unsaved")}
					</span>
				) : null}
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{isWritten && onDelete ? (
					<ConfirmDialog
						confirmLabel={t("skills.delete.action")}
						defaultOpen={defaultConfirming}
						description={t("skills.delete.description")}
						onConfirm={onDelete}
						title={t("skills.delete.confirm.title", { name })}
						trigger={
							<>
								<Icons.Delete aria-hidden="true" className="size-3.5" />
								{t("skills.delete.action")}
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
					{isWritten ? t("skills.save") : t("skills.create")}
				</Button>
			</div>
		</div>
	)
}

export { SkillEditorHeader }
