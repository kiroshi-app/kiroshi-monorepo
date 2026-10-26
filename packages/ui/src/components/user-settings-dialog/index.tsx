"use client"

import { useTranslation } from "react-i18next"

import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import { SettingsDialogShell } from "@workspace/ui/components/settings-dialog-shell"
import {
	SettingsEntryPanels,
	SettingsRailEntries,
} from "@workspace/ui/components/settings-rail"
import type { UserSettingsValue } from "@workspace/ui/components/user-settings"
import {
	type UserSettingsProps,
	useUserSettings,
} from "@workspace/ui/components/user-settings-dialog/use-user-settings"

const BREADCRUMB_AVATAR_SIZE = 32

type UserSettingsDialogProps = UserSettingsProps & {
	open: boolean
	onClose: () => void
	tab?: string
	className?: string
}

const UserSettingsDialog = ({
	open,
	onClose,
	tab,
	className,
	...settings
}: UserSettingsDialogProps) => {
	const { t } = useTranslation("settings")
	const { name, pages, sessions, entries, firstEntry } = useUserSettings({
		...settings,
		isOpen: open,
	})

	return (
		<SettingsDialogShell
			breadcrumb={t("breadcrumb.title")}
			className={className}
			mark={
				<InitialsAvatar
					image={settings.value.image}
					name={name}
					size={BREADCRUMB_AVATAR_SIZE}
				/>
			}
			name={name}
			onClose={onClose}
			open={open}
			pages={pages}
			rail={(iconsOnly) => (
				<SettingsRailEntries entries={entries} iconsOnly={iconsOnly} />
			)}
			sessions={sessions}
			tab={tab ?? firstEntry}
		>
			<SettingsEntryPanels entries={entries} />
		</SettingsDialogShell>
	)
}

export {
	UserSettingsDialog,
	type UserSettingsDialogProps,
	type UserSettingsValue,
}
