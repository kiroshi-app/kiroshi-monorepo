"use client"

import { useTranslation } from "react-i18next"

import type { BotSkillDraft } from "@workspace/ui/components/bot-settings"
import { Icons } from "@workspace/ui/components/icons"
import { SettingsField } from "@workspace/ui/components/settings-field"
import { SETTINGS_PANEL_CLASS } from "@workspace/ui/components/settings-rail"
import { SETTINGS_TAG_CLASS } from "@workspace/ui/components/settings-styles"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type SkillSystemViewProps = {
	draft: BotSkillDraft
	name: string
	onBack: () => void
	className?: string
}

const SkillSystemView = ({
	draft,
	name,
	onBack,
	className,
}: SkillSystemViewProps) => {
	const { t } = useTranslation("bots")

	return (
		<div className={cn("flex min-h-0 flex-1 flex-col", className)}>
			<div className="flex shrink-0 items-center gap-2 border-border border-b py-2 pr-5 pl-2">
				<Button onClick={onBack} size="sm" variant="ghost">
					<Icons.Previous aria-hidden="true" className="size-3.5" />
					{t("skills.back")}
				</Button>
				<span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
					{name}
				</span>
				<span className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}>
					{t("skills.system.tag")}
				</span>
			</div>

			<div className={SETTINGS_PANEL_CLASS}>
				<p className="text-muted-foreground text-xs">
					{t("skills.system.notice")}
				</p>
				<SettingsField
					label={t("skills.name.label")}
					readOnly
					value={draft.name}
				/>
				<SettingsField
					label={t("skills.description.label")}
					readOnly
					rows={2}
					value={draft.description}
				/>
				<SettingsField
					fill
					label={t("skills.body.label")}
					readOnly
					value={draft.body}
				/>
			</div>
		</div>
	)
}

export { SkillSystemView }
