"use client"

import { useTranslation } from "react-i18next"

import {
	BOT_PERMISSION_MODES,
	BOT_PERMISSION_RULE_LISTS,
	type BotPermissionRuleList,
	type BotPermissions,
	isPermissionRule,
	readBotPermissionMode,
} from "@workspace/ui/components/bot-settings"
import { SettingsListField } from "@workspace/ui/components/settings-list-field"
import { SettingsSelect } from "@workspace/ui/components/settings-select"

type PermissionsPanelProps = {
	permissions: BotPermissions
	onPermissionsChange: (permissions: BotPermissions) => void
}

const PermissionsPanel = ({
	permissions,
	onPermissionsChange,
}: PermissionsPanelProps) => {
	const { t } = useTranslation("bots")

	const patch = (fields: Partial<BotPermissions>) =>
		onPermissionsChange({ ...permissions, ...fields })

	const modeCopy = t as (key: `approvals.mode.option.${string}`) => string

	const modeOptions = BOT_PERMISSION_MODES.map((mode) => ({
		label: modeCopy(`approvals.mode.option.${mode}.label`),
		value: mode,
	}))

	const ruleList = (list: BotPermissionRuleList) => (
		<SettingsListField
			addLabel={t("approvals.rule.add")}
			emptyLabel={t(`approvals.rule.${list}.empty`)}
			hint={t(`approvals.rule.${list}.hint`)}
			invalidMessage={t("approvals.rule.invalid")}
			isItemValid={isPermissionRule}
			items={permissions[list]}
			key={list}
			label={t(`approvals.rule.${list}.label`)}
			onItemsChange={(rules) => patch({ [list]: rules })}
			placeholder={t("approvals.rule.placeholder")}
			removeLabel={(rule) => t("approvals.rule.remove", { rule })}
		/>
	)

	return (
		<>
			<SettingsSelect
				hint={modeCopy(
					`approvals.mode.option.${readBotPermissionMode(permissions.defaultMode)}.hint`,
				)}
				label={t("approvals.mode.label")}
				onValueChange={(mode) =>
					patch({ defaultMode: readBotPermissionMode(mode) })
				}
				options={modeOptions}
				value={permissions.defaultMode}
			/>

			{BOT_PERMISSION_RULE_LISTS.map(ruleList)}
		</>
	)
}

export { PermissionsPanel, type PermissionsPanelProps }
