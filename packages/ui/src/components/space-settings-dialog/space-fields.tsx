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

type SpaceColourFieldProps = {
	value: number | null
	onValueChange: (hue: number | null) => void
}

const SpaceColourField = ({ value, onValueChange }: SpaceColourFieldProps) => {
	const { t } = useTranslation("settings")

	return (
		<ColourField
			hint={t("space.colour.hint")}
			mark={(hue) => <SpaceTint className="size-6" tint={hue} />}
			onValueChange={onValueChange}
			value={value}
		/>
	)
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

			<SpaceColourField
				onValueChange={(hue) => onValueChange({ ...value, hue })}
				value={value.hue}
			/>
		</div>
	)
}

export {
	SpaceColourField,
	type SpaceColourFieldProps,
	SpaceFields,
	type SpaceFieldsProps,
	type SpaceFieldsValue,
}
