"use client"

import { useTranslation } from "react-i18next"

import type { BotSettingsValue } from "@workspace/ui/components/bot-settings"
import { MemoryPanel } from "@workspace/ui/components/bot-settings-dialog/memory-panel"
import { SettingsField } from "@workspace/ui/components/settings-field"

type BotInstructionsFieldsProps = {
	value: BotSettingsValue
	onValueChange: (value: BotSettingsValue) => void
	memory?: string
	onMemoryChange?: (memory: string) => void
	isTall?: boolean
}

const BotInstructionsFields = ({
	value,
	onValueChange,
	memory,
	onMemoryChange,
	isTall,
}: BotInstructionsFieldsProps) => {
	const { t } = useTranslation("bots")

	return (
		<>
			<SettingsField
				fill={!isTall}
				isTall={isTall}
				label={t("dialog.instructions.label")}
				onValueChange={(instructions) =>
					onValueChange({ ...value, instructions })
				}
				placeholder={t("dialog.instructions.placeholder")}
				value={value.instructions}
			/>
			{memory !== undefined ? (
				<MemoryPanel
					memory={memory}
					onSave={(next) => onMemoryChange?.(next)}
				/>
			) : null}
		</>
	)
}

export { BotInstructionsFields }
