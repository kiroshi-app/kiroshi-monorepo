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
	rows?: number
}

const BotInstructionsFields = ({
	value,
	onValueChange,
	memory,
	onMemoryChange,
	rows,
}: BotInstructionsFieldsProps) => {
	const { t } = useTranslation("bots")

	return (
		<>
			<SettingsField
				fill={rows === undefined}
				label={t("dialog.instructions.label")}
				onValueChange={(instructions) =>
					onValueChange({ ...value, instructions })
				}
				placeholder={t("dialog.instructions.placeholder")}
				rows={rows}
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
