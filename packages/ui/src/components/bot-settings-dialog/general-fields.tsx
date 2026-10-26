"use client"

import { useTranslation } from "react-i18next"

import type { BotSettingsValue } from "@workspace/ui/components/bot-settings"
import { SettingsField } from "@workspace/ui/components/settings-field"

type BotGeneralFieldsProps = {
	value: BotSettingsValue
	onValueChange: (value: BotSettingsValue) => void
}

const BotGeneralFields = ({ value, onValueChange }: BotGeneralFieldsProps) => {
	const { t } = useTranslation("bots")

	return (
		<>
			<SettingsField
				label={t("dialog.name.label")}
				onValueChange={(name) => onValueChange({ ...value, name })}
				placeholder={t("dialog.name.placeholder")}
				value={value.name}
			/>
			<SettingsField
				label={t("dialog.title.label")}
				onValueChange={(title) => onValueChange({ ...value, title })}
				placeholder={t("dialog.title.placeholder")}
				value={value.title}
			/>
		</>
	)
}

export { BotGeneralFields }
