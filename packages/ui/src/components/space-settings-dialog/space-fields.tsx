"use client"

import { useTranslation } from "react-i18next"

import { ColourField } from "@workspace/ui/components/colour-field"
import { blotOf } from "@workspace/ui/components/companion-colour"
import { hueStyle } from "@workspace/ui/components/hue-palette"
import { Icons } from "@workspace/ui/components/icons"
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

type SpacePreviewProps = {
	hue: number | null
}

const SpacePreview = ({ hue }: SpacePreviewProps) => {
	const { t } = useTranslation("settings")

	return (
		<div
			className="flex min-w-0 items-center gap-3 px-3.5 py-3"
			data-hue={hue ?? undefined}
			data-slot="space-colour-preview"
			style={hue === null ? undefined : hueStyle(hue)}
		>
			<span
				aria-hidden="true"
				className="size-6.5 shrink-0 rounded-[7px] bg-user-bubble"
			/>
			<span className="flex-1" />
			<span
				aria-hidden="true"
				className="size-2 shrink-0 rounded-full bg-primary"
			/>
			<span className="min-w-0 break-words rounded-bubble bg-user-bubble px-3 py-2 text-compact text-user-bubble-foreground leading-5">
				{t("space.colour.previewMessage")}
			</span>
			<span
				aria-hidden="true"
				className="grid size-7.5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
			>
				<Icons.Send className="size-4" />
			</span>
		</div>
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

			<ColourField
				hint={t("space.colour.hint")}
				mark={(hue) => <SpaceTint className="size-6" tint={blotOf(hue)} />}
				onValueChange={(hue) => onValueChange({ ...value, hue })}
				preview={(hue) => <SpacePreview hue={hue} />}
				value={value.hue}
			/>
		</div>
	)
}

export { SpaceFields, type SpaceFieldsProps, type SpaceFieldsValue }
