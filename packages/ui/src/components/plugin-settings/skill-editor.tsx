"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
	type BotSkillDraft,
	isSkillDraftUnsaved,
	SKILL_DESCRIPTION_LIMIT,
	toSkillDescriptionLength,
} from "@workspace/ui/components/bot-settings"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { SkillEditorHeader } from "@workspace/ui/components/plugin-settings/skill-editor-header"
import {
	SkillAdvancedPanel,
	SkillExecutionPanel,
	SkillInstructionsPanel,
	SkillToolsPanel,
	SkillTriggeringPanel,
} from "@workspace/ui/components/plugin-settings/skill-editor-panels"
import {
	FIRST_SECTION,
	SkillEditorRail,
} from "@workspace/ui/components/plugin-settings/skill-editor-rail"
import {
	SkillFilesPanel,
	type SkillFilesPanelProps,
} from "@workspace/ui/components/plugin-settings/skill-files-panel"
import { SkillSystemView } from "@workspace/ui/components/plugin-settings/skill-system-view"
import { SettingsPushedPage } from "@workspace/ui/components/settings-pushed-page"
import { SETTINGS_PANEL_CLASS } from "@workspace/ui/components/settings-rail"
import { useFocusFirstInvalid } from "@workspace/ui/hooks/use-focus-first-invalid"
import { usePendingSubmit } from "@workspace/ui/hooks/use-pending-submit"

type SkillEditorProps = {
	draft: BotSkillDraft
	onDraftChange: (draft: BotSkillDraft) => void
	saved?: BotSkillDraft
	onBack: () => void
	onSave: () => unknown
	onDelete?: () => void
	files?: SkillFilesPanelProps
	isSystem?: boolean
	defaultSection?: string
	defaultConfirming?: boolean
	defaultLeaving?: boolean
	className?: string
}

const SkillEditor = ({
	draft,
	onDraftChange,
	saved,
	onBack,
	onSave,
	onDelete,
	files,
	isSystem = false,
	defaultSection,
	defaultConfirming,
	defaultLeaving,
	className,
}: SkillEditorProps) => {
	const { t } = useTranslation("bots")
	const [isLeaving, setLeaving] = useState(Boolean(defaultLeaving))
	const [section, setSection] = useState(defaultSection ?? FIRST_SECTION)
	const [hasTriedSaving, setTriedSaving] = useState(false)
	const { root, focusFirstInvalid } = useFocusFirstInvalid<HTMLDivElement>()
	const { isPending, run } = usePendingSubmit()

	const name = draft.name.trim() || t("skills.untitled")

	if (isSystem)
		return (
			<SkillSystemView
				className={className}
				draft={draft}
				name={name}
				onBack={onBack}
			/>
		)

	const isWritten = Boolean(saved)
	const isUnsaved = isSkillDraftUnsaved(draft, saved)
	const used = toSkillDescriptionLength(draft)
	const isOverBudget = used > SKILL_DESCRIPTION_LIMIT
	const isNameBlank = draft.name.trim().length === 0

	const patch = (fields: Partial<BotSkillDraft>) =>
		onDraftChange({ ...draft, ...fields })

	const leave = () => (isUnsaved ? setLeaving(true) : onBack())

	const save = () => {
		if (isNameBlank || isOverBudget) {
			setTriedSaving(true)
			setSection("triggering")
			focusFirstInvalid()
		} else {
			run(onSave)
		}
	}

	return (
		<SettingsPushedPage
			backLabel={t("skills.back")}
			className={className}
			isMeasured
			onBack={leave}
			onValueChange={setSection}
			value={section}
			rail={(iconsOnly) => (
				<SkillEditorRail hasFiles={Boolean(files)} iconsOnly={iconsOnly} />
			)}
		>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col" ref={root}>
				<SkillEditorHeader
					defaultConfirming={defaultConfirming}
					isPending={isPending}
					isUnsaved={isUnsaved}
					isWritten={isWritten}
					name={name}
					onDelete={onDelete}
					onSave={save}
				/>
				<SkillInstructionsPanel draft={draft} patch={patch} />
				<SkillTriggeringPanel
					draft={draft}
					isNameErrorShown={hasTriedSaving && isNameBlank}
					isOverBudget={isOverBudget}
					patch={patch}
					used={used}
				/>
				<SkillExecutionPanel draft={draft} patch={patch} />
				<SkillToolsPanel draft={draft} patch={patch} />
				{files ? (
					<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="files">
						<SkillFilesPanel {...files} />
					</Tabs.Panel>
				) : null}
				<SkillAdvancedPanel draft={draft} patch={patch} />
			</div>

			<ConfirmDialog
				confirmLabel={t("skills.leave.action")}
				description={t("skills.leave.description")}
				onConfirm={onBack}
				onOpenChange={setLeaving}
				open={isLeaving}
				title={t("skills.leave.title")}
			/>
		</SettingsPushedPage>
	)
}

export { SkillEditor, type SkillEditorProps }
