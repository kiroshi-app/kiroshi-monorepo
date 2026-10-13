"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useTranslation } from "react-i18next"

import {
	type BotSkillDraft,
	SKILL_CONTEXTS,
	SKILL_DESCRIPTION_LIMIT,
	SKILL_EFFORTS,
	SKILL_FLAG_DEFAULTS,
	toBundleName,
} from "@workspace/ui/components/bot-settings"
import { FIRST_SECTION } from "@workspace/ui/components/plugin-settings/skill-editor-rail"
import { SettingsField } from "@workspace/ui/components/settings-field"
import {
	SETTINGS_PANEL_CLASS,
	SettingsScrollingPanel,
} from "@workspace/ui/components/settings-rail"
import { SettingsSelect } from "@workspace/ui/components/settings-select"
import { SettingsSwitch } from "@workspace/ui/components/settings-switch"

type SkillPanelProps = {
	draft: BotSkillDraft
	patch: (fields: Partial<BotSkillDraft>) => void
}

type SkillTriggeringPanelProps = SkillPanelProps & {
	isNameErrorShown: boolean
	isOverBudget: boolean
	used: number
}

const toContextPatch = (value: string) => {
	const context = SKILL_CONTEXTS.find((it) => it === value)

	if (context === "fork") return { context }

	return { context, agent: undefined, isBackground: undefined }
}

const SkillInstructionsPanel = ({ draft, patch }: SkillPanelProps) => {
	const { t } = useTranslation("bots")

	return (
		<Tabs.Panel className={SETTINGS_PANEL_CLASS} value={FIRST_SECTION}>
			<SettingsField
				fill
				label={t("skills.body.label")}
				onValueChange={(value) => patch({ body: value })}
				placeholder={t("skills.body.placeholder")}
				value={draft.body}
			/>
			<SettingsField
				hint={t("skills.argumentHint.hint")}
				label={t("skills.argumentHint.label")}
				onValueChange={(value) => patch({ argumentHint: value })}
				placeholder={t("skills.argumentHint.placeholder")}
				value={draft.argumentHint ?? ""}
			/>
			<SettingsField
				label={t("skills.arguments.label")}
				onValueChange={(value) => patch({ arguments: value })}
				placeholder={t("skills.arguments.placeholder")}
				rows={2}
				value={draft.arguments ?? ""}
			/>
		</Tabs.Panel>
	)
}

const SkillTriggeringPanel = ({
	draft,
	patch,
	isNameErrorShown,
	isOverBudget,
	used,
}: SkillTriggeringPanelProps) => {
	const { t } = useTranslation("bots")

	return (
		<SettingsScrollingPanel value="triggering">
			<SettingsField
				error={isNameErrorShown ? t("skills.name.blank") : undefined}
				hint={t("skills.name.hint")}
				label={t("skills.name.label")}
				onValueChange={(value) => patch({ name: toBundleName(value) })}
				placeholder={t("skills.name.placeholder")}
				value={draft.name}
			/>
			<SettingsField
				label={t("skills.description.label")}
				onValueChange={(value) => patch({ description: value })}
				placeholder={t("skills.description.placeholder")}
				rows={2}
				value={draft.description}
			/>
			<SettingsField
				error={
					isOverBudget
						? t("skills.budget.over", {
								over: used - SKILL_DESCRIPTION_LIMIT,
							})
						: undefined
				}
				hint={t("skills.budget.label", {
					max: SKILL_DESCRIPTION_LIMIT,
					used,
				})}
				label={t("skills.whenToUse.label")}
				onValueChange={(value) => patch({ whenToUse: value })}
				placeholder={t("skills.whenToUse.placeholder")}
				rows={3}
				value={draft.whenToUse ?? ""}
			/>
			<SettingsSwitch
				checked={
					draft.isModelInvocationDisabled ??
					SKILL_FLAG_DEFAULTS.isModelInvocationDisabled
				}
				description={t("skills.modelInvocation.description")}
				label={t("skills.modelInvocation.label")}
				onCheckedChange={(next) => patch({ isModelInvocationDisabled: next })}
			/>
			<SettingsSwitch
				checked={draft.isUserInvocable ?? SKILL_FLAG_DEFAULTS.isUserInvocable}
				description={t("skills.userInvocable.description")}
				label={t("skills.userInvocable.label")}
				onCheckedChange={(next) => patch({ isUserInvocable: next })}
			/>
			<SettingsField
				hint={t("skills.paths.hint")}
				label={t("skills.paths.label")}
				onValueChange={(value) => patch({ paths: value })}
				placeholder={t("skills.paths.placeholder")}
				rows={3}
				value={draft.paths ?? ""}
			/>
			<SettingsSwitch
				checked={draft.isPreloaded ?? false}
				description={t("skills.preloaded.description")}
				label={t("skills.preloaded.label")}
				onCheckedChange={(next) => patch({ isPreloaded: next })}
			/>
		</SettingsScrollingPanel>
	)
}

const SkillExecutionPanel = ({ draft, patch }: SkillPanelProps) => {
	const { t } = useTranslation("bots")

	const effortOptions = [
		{ label: t("skills.effort.default"), value: "" },
		...SKILL_EFFORTS.map((effort) => ({
			label: t(`skills.effort.option.${effort}`),
			value: effort,
		})),
	]

	const contextOptions = [
		{ label: t("skills.context.default"), value: "" },
		...SKILL_CONTEXTS.map((context) => ({
			label: t(`skills.context.option.${context}`),
			value: context,
		})),
	]

	return (
		<SettingsScrollingPanel value="execution">
			<SettingsField
				hint={t("skills.model.hint")}
				label={t("skills.model.label")}
				onValueChange={(value) => patch({ model: value })}
				placeholder={t("skills.model.placeholder")}
				value={draft.model ?? ""}
			/>
			<SettingsSelect
				label={t("skills.effort.label")}
				onValueChange={(value) =>
					patch({ effort: SKILL_EFFORTS.find((it) => it === value) })
				}
				options={effortOptions}
				value={draft.effort ?? ""}
			/>
			<SettingsSelect
				hint={t("skills.context.hint")}
				label={t("skills.context.label")}
				onValueChange={(value) => patch(toContextPatch(value))}
				options={contextOptions}
				value={draft.context ?? ""}
			/>
			<SettingsField
				hint={t("skills.shell.hint")}
				label={t("skills.shell.label")}
				onValueChange={(value) => patch({ shell: value })}
				placeholder={t("skills.shell.placeholder")}
				value={draft.shell ?? ""}
			/>
			{draft.context === "fork" ? (
				<>
					<SettingsField
						hint={t("skills.agent.hint")}
						label={t("skills.agent.label")}
						onValueChange={(value) => patch({ agent: value })}
						placeholder={t("skills.agent.placeholder")}
						value={draft.agent ?? ""}
					/>
					<SettingsSwitch
						checked={draft.isBackground ?? SKILL_FLAG_DEFAULTS.isBackground}
						description={t("skills.background.description")}
						label={t("skills.background.label")}
						onCheckedChange={(next) => patch({ isBackground: next })}
					/>
				</>
			) : null}
		</SettingsScrollingPanel>
	)
}

const SkillToolsPanel = ({ draft, patch }: SkillPanelProps) => {
	const { t } = useTranslation("bots")

	return (
		<SettingsScrollingPanel value="tools">
			<SettingsField
				hint={t("skills.allowedTools.hint")}
				label={t("skills.allowedTools.label")}
				onValueChange={(value) => patch({ allowedTools: value })}
				placeholder={t("skills.allowedTools.placeholder")}
				rows={3}
				value={draft.allowedTools ?? ""}
			/>
			<SettingsField
				label={t("skills.disallowedTools.label")}
				onValueChange={(value) => patch({ disallowedTools: value })}
				placeholder={t("skills.disallowedTools.placeholder")}
				rows={3}
				value={draft.disallowedTools ?? ""}
			/>
			<SettingsField
				hint={t("skills.hooks.hint")}
				label={t("skills.hooks.label")}
				onValueChange={(value) => patch({ hooks: value })}
				placeholder={t("skills.hooks.placeholder")}
				rows={5}
				value={draft.hooks ?? ""}
			/>
		</SettingsScrollingPanel>
	)
}

const SkillAdvancedPanel = ({ draft, patch }: SkillPanelProps) => {
	const { t } = useTranslation("bots")

	return (
		<SettingsScrollingPanel value="advanced">
			<SettingsField
				label={t("skills.license.label")}
				onValueChange={(value) => patch({ license: value })}
				placeholder={t("skills.license.placeholder")}
				value={draft.license ?? ""}
			/>
			<SettingsField
				hint={t("skills.compatibility.hint")}
				label={t("skills.compatibility.label")}
				onValueChange={(value) => patch({ compatibility: value })}
				placeholder={t("skills.compatibility.placeholder")}
				value={draft.compatibility ?? ""}
			/>
			<SettingsField
				hint={t("skills.metadata.hint")}
				label={t("skills.metadata.label")}
				onValueChange={(value) => patch({ metadata: value })}
				placeholder={t("skills.metadata.placeholder")}
				rows={5}
				value={draft.metadata ?? ""}
			/>
		</SettingsScrollingPanel>
	)
}

export {
	SkillAdvancedPanel,
	SkillExecutionPanel,
	SkillInstructionsPanel,
	SkillToolsPanel,
	SkillTriggeringPanel,
}
