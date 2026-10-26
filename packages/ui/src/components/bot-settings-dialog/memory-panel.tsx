"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { SettingsField } from "@workspace/ui/components/settings-field"
import {
	FIELD_CONTROL_CLASS,
	FIELD_CONTROL_READONLY_CLASS,
	FIELD_LABEL_CLASS,
} from "@workspace/ui/components/settings-styles"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type MemoryPanelProps = {
	memory: string
	onSave: (memory: string) => void
	isTall?: boolean
}

const EMPTY_CLASS = cn(
	FIELD_CONTROL_CLASS,
	FIELD_CONTROL_READONLY_CLASS,
	"text-muted-foreground",
)

const MemoryPanel = ({ memory, onSave, isTall = false }: MemoryPanelProps) => {
	const { t } = useTranslation("bots")
	const [edit, setEdit] = useState({ base: memory, draft: memory })
	const [isClearing, setIsClearing] = useState(false)

	const draft = edit.base === memory ? edit.draft : memory
	const isSaved = draft === memory

	if (memory === "") {
		return (
			<div className="flex shrink-0 flex-col gap-1.5">
				<span className={FIELD_LABEL_CLASS}>{t("dialog.memory.label")}</span>
				<p className={EMPTY_CLASS}>{t("dialog.memory.empty")}</p>
			</div>
		)
	}

	return (
		<div className="flex shrink-0 flex-col gap-2">
			<SettingsField
				height={isTall ? "medium" : undefined}
				hint={t("dialog.memory.hint")}
				label={t("dialog.memory.label")}
				onValueChange={(next) => setEdit({ base: memory, draft: next })}
				rows={isTall ? undefined : 6}
				value={draft}
			/>

			<div className="flex items-center justify-end gap-2">
				<Button onClick={() => setIsClearing(true)} size="sm" variant="outline">
					{t("dialog.memory.clear.action")}
				</Button>
				<Button disabled={isSaved} onClick={() => onSave(draft)} size="sm">
					{t("dialog.memory.save")}
				</Button>
			</div>

			<ConfirmDialog
				confirmLabel={t("dialog.memory.clear.confirm")}
				description={t("dialog.memory.clear.description")}
				onConfirm={() => onSave("")}
				onOpenChange={setIsClearing}
				open={isClearing}
				title={t("dialog.memory.clear.title")}
			/>
		</div>
	)
}

export { MemoryPanel }
