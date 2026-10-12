"use client"

import { useTranslation } from "react-i18next"

import { SettingsField } from "@workspace/ui/components/settings-field"
import { FIELD_LABEL_CLASS } from "@workspace/ui/components/settings-styles"
import type { SpaceSettingsValue } from "@workspace/ui/components/space-settings"
import { cn } from "@workspace/ui/lib/utils"

type JoinedSpaceFieldsProps = {
	value: SpaceSettingsValue
	host: string
	className?: string
}

const JoinedSpaceFields = ({
	value,
	host,
	className,
}: JoinedSpaceFieldsProps) => {
	const { t } = useTranslation("settings")

	return (
		<div
			className={cn("flex flex-col gap-5", className)}
			data-slot="joined-space-fields"
		>
			<dl className="flex flex-col gap-1.5">
				<dt className={FIELD_LABEL_CLASS}>{t("space.name.label")}</dt>
				<dd
					className="min-w-0 cursor-default break-words text-foreground text-sm"
					data-slot="joined-space-name"
				>
					{value.name}
				</dd>
			</dl>
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
