"use client"

import { useTranslation } from "react-i18next"

import { SettingsRailItem } from "@workspace/ui/components/settings-rail"

const FIRST_SECTION = "instructions"

type SkillEditorRailProps = {
	iconsOnly: boolean
	hasFiles: boolean
}

const SkillEditorRail = ({ iconsOnly, hasFiles }: SkillEditorRailProps) => {
	const { t } = useTranslation("bots")

	return (
		<>
			<SettingsRailItem
				icon="Docs"
				iconsOnly={iconsOnly}
				label={t("skills.section.instructions")}
				value={FIRST_SECTION}
			/>
			<SettingsRailItem
				icon="Skill"
				iconsOnly={iconsOnly}
				label={t("skills.section.triggering")}
				value="triggering"
			/>
			<SettingsRailItem
				icon="Terminal"
				iconsOnly={iconsOnly}
				label={t("skills.section.execution")}
				value="execution"
			/>
			<SettingsRailItem
				icon="Tool"
				iconsOnly={iconsOnly}
				label={t("skills.section.tools")}
				value="tools"
			/>
			{hasFiles ? (
				<SettingsRailItem
					icon="Folder"
					iconsOnly={iconsOnly}
					label={t("skills.section.files")}
					value="files"
				/>
			) : null}
			<SettingsRailItem
				icon="Settings"
				iconsOnly={iconsOnly}
				label={t("skills.section.advanced")}
				value="advanced"
			/>
		</>
	)
}

export { FIRST_SECTION, SkillEditorRail }
