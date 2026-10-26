"use client"

import { useTranslation } from "react-i18next"

import { SettingsDialogShell } from "@workspace/ui/components/settings-dialog-shell"
import {
	SettingsEntryPanels,
	SettingsRailEntries,
} from "@workspace/ui/components/settings-rail"
import type { SpaceSettingsValue } from "@workspace/ui/components/space-settings"
import type { SpaceHosting } from "@workspace/ui/components/space-settings-dialog/share-card"
import {
	SPACE_ENTRY,
	type SpaceSettingsProps,
	useSpaceSettings,
} from "@workspace/ui/components/space-settings-dialog/use-space-settings"
import { SpaceTint } from "@workspace/ui/components/space-tint"

type ControlledTab = {
	tab: string
	onTabChange: (tab: string) => void
}

type UncontrolledTab = {
	tab?: string
	onTabChange?: never
}

type SpaceSettingsDialogProps = SpaceSettingsProps & {
	open: boolean
	onClose: () => void
	className?: string
} & (ControlledTab | UncontrolledTab)

const SpaceSettingsDialog = ({
	open,
	onClose,
	tab,
	onTabChange,
	className,
	...settings
}: SpaceSettingsDialogProps) => {
	const { t } = useTranslation("settings")
	const { name, pages, sessions, entries } = useSpaceSettings({
		...settings,
		isOpen: open,
	})

	return (
		<SettingsDialogShell
			breadcrumb={t("breadcrumb.title")}
			className={className}
			mark={<SpaceTint className="size-5" tint={settings.value.colour} />}
			name={name}
			onClose={onClose}
			open={open}
			pages={pages}
			rail={(iconsOnly) => (
				<SettingsRailEntries entries={entries} iconsOnly={iconsOnly} />
			)}
			sessions={sessions}
			onTabChange={onTabChange}
			tab={tab ?? SPACE_ENTRY}
		>
			<SettingsEntryPanels entries={entries} />
		</SettingsDialogShell>
	)
}

export {
	type SpaceHosting,
	SpaceSettingsDialog,
	type SpaceSettingsDialogProps,
	type SpaceSettingsValue,
}
