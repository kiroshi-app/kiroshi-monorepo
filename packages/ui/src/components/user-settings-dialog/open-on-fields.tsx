"use client"

import { useTranslation } from "react-i18next"

import { SettingsSelect } from "@workspace/ui/components/settings-select"

const OPEN_ON_IDS = ["newConversation", "lastConversation"] as const

type OpenOn = (typeof OPEN_ON_IDS)[number]

type OpenOnFieldsProps = {
	openOn: OpenOn
	onOpenOnChange: (openOn: OpenOn) => void
}

const OpenOnFields = ({ openOn, onOpenOnChange }: OpenOnFieldsProps) => {
	const { t } = useTranslation("settings")

	return (
		<SettingsSelect
			label={t("openOn.label")}
			onValueChange={(next) => {
				const picked = OPEN_ON_IDS.find((id) => id === next)
				if (picked) onOpenOnChange(picked)
			}}
			options={OPEN_ON_IDS.map((id) => ({
				value: id,
				label: t(`openOn.option.${id}`),
			}))}
			value={openOn}
		/>
	)
}

export { OPEN_ON_IDS, type OpenOn, OpenOnFields, type OpenOnFieldsProps }
