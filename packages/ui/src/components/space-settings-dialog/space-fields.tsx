"use client"

import { useTranslation } from "react-i18next"

import { ColourField } from "@workspace/ui/components/colour-field"
import { SettingsField } from "@workspace/ui/components/settings-field"
import { SpaceTint } from "@workspace/ui/components/space-tint"
import { cn } from "@workspace/ui/lib/utils"

type SpaceFieldsValue = {
	name: string
	hue: number | null
}

type SpaceFieldsProps = {
	value: SpaceFieldsValue
	onValueChange: (value: SpaceFieldsValue) => void
	className?: string
}

const SpaceFields = ({ value, onValueChange, className }: SpaceFieldsProps) => {
	const { t } = useTranslation("settings")

	return (
		<div
			className={cn("flex flex-col gap-5", className)}
			data-slot="space-fields"
		>
			<SettingsField
				label={t("space.name.label")}
				onValueChange={(name) => onValueChange({ ...value, name })}
				placeholder={t("space.name.placeholder")}
				value={value.name}
			/>

			<ColourField
				hint={t("space.colour.hint")}
				mark={(hue) => <SpaceTint className="size-6" tint={hue} />}
				onValueChange={(hue) => onValueChange({ ...value, hue })}
				value={value.hue}
			/>
		</div>
	)
}

export { SpaceFields, type SpaceFieldsProps, type SpaceFieldsValue }
