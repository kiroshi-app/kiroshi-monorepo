"use client"

import { useTranslation } from "react-i18next"

import { SettingsField } from "@workspace/ui/components/settings-field"
import type { SpaceSettingsValue } from "@workspace/ui/components/space-settings"
import { cn } from "@workspace/ui/lib/utils"

type JoinedSpaceFieldsProps = {
	value: SpaceSettingsValue
	onValueChange: (value: SpaceSettingsValue) => void
	host: string
	className?: string
}

const JoinedSpaceFields = ({
	value,
	onValueChange,
	host,
	className,
}: JoinedSpaceFieldsProps) => {
	const { t } = useTranslation("settings")

	return (
		<div
			className={cn("flex flex-col gap-5", className)}
			data-slot="joined-space-fields"
		>
			<SettingsField
				label={t("space.name.label")}
				onValueChange={(name) => onValueChange({ ...value, name })}
				placeholder={t("space.name.placeholder")}
				value={value.name}
			/>
			<SettingsField
				hint={t("space.host.hint")}
				kind="url"
				label={t("space.host.label")}
				readOnly
				value={host}
			/>
		</div>
	)
}

export { JoinedSpaceFields, type JoinedSpaceFieldsProps }
