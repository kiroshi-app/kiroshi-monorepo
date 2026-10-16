"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useTranslation } from "react-i18next"

import type {
	BotSkillDraft,
	BotSkillItem,
} from "@workspace/ui/components/bot-settings"
import {
	displayNameOf,
	InitialsAvatar,
} from "@workspace/ui/components/initials-avatar"
import type { PluginHistory } from "@workspace/ui/components/plugin-settings/history-panel"
import type { SettingsPage } from "@workspace/ui/components/plugin-settings/settings-pages"
import type { PluginSkillFiles } from "@workspace/ui/components/plugin-settings/skill-files-panel"
import {
	HISTORY_TAB,
	useHistorySession,
} from "@workspace/ui/components/plugin-settings/use-history-session"
import {
	type ApplicationsSection,
	useMcpSession,
} from "@workspace/ui/components/plugin-settings/use-mcp-session"
import { useSkillSession } from "@workspace/ui/components/plugin-settings/use-skill-session"
import { SettingsDialogShell } from "@workspace/ui/components/settings-dialog-shell"
import {
	SETTINGS_PANEL_CLASS,
	SettingsRailItem,
	SettingsScrollingPanel,
} from "@workspace/ui/components/settings-rail"
import type { UserSettingsValue } from "@workspace/ui/components/user-settings"
import {
	AccountPanel,
	type AccountPanelProps,
} from "@workspace/ui/components/user-settings-dialog/account-panel"
import { AppearanceFields } from "@workspace/ui/components/user-settings-dialog/appearance-fields"
import {
	DiagnosticsFields,
	type DiagnosticsFieldsProps,
} from "@workspace/ui/components/user-settings-dialog/diagnostics-fields"
import { LanguageFields } from "@workspace/ui/components/user-settings-dialog/language-fields"
import { NotificationFields } from "@workspace/ui/components/user-settings-dialog/notification-fields"
import { usePushedPages } from "@workspace/ui/hooks/use-pushed-pages"
import type { Language } from "@workspace/ui/lib/i18n"

const BREADCRUMB_AVATAR_SIZE = 32

const APPLICATIONS_TAB = "mcp"

const ACCOUNT_TAB = "account"

const APPEARANCE_TAB = "appearance"

const DIAGNOSTICS_TAB = "diagnostics"

const NO_APPLICATIONS: ApplicationsSection = {
	servers: [],
	onServerCreate: () => undefined,
	onServerChange: () => undefined,
	onServerDelete: () => undefined,
}

type UserSettingsDialogProps = {
	open: boolean
	onClose: () => void
	value: UserSettingsValue
	onValueChange: (value: UserSettingsValue) => void
	language: Language | null
	onLanguageChange: (language: Language | null) => void
	skills: BotSkillItem[]
	onSkillCreate: (draft: BotSkillDraft, isPreloaded: boolean) => void
	onSkillChange: (id: string, draft: BotSkillDraft) => void
	onSkillPreloadedChange: (id: string, isPreloaded: boolean) => void
	onSkillDelete: (id: string) => void
	skillFiles?: PluginSkillFiles
	applications?: ApplicationsSection
	account?: AccountPanelProps
	diagnostics?: DiagnosticsFieldsProps
	tab?: string
	history: PluginHistory
	className?: string
}

const UserSettingsDialog = ({
	open,
	onClose,
	value,
	onValueChange,
	language,
	onLanguageChange,
	skills,
	onSkillCreate,
	onSkillChange,
	onSkillPreloadedChange,
	onSkillDelete,
	skillFiles,
	applications,
	account,
	diagnostics,
	tab,
	history,
	className,
}: UserSettingsDialogProps) => {
	const { t } = useTranslation("settings")
	const displayName = displayNameOf(value.name)
	const pages = usePushedPages<SettingsPage>()
	const skillSession = useSkillSession({
		pages,
		skills,
		files: skillFiles,
		onSkillChange,
		onSkillCreate,
		onSkillDelete,
		onSkillPreloadedChange,
	})
	const mcpSession = useMcpSession({
		pages,
		...(applications ?? NO_APPLICATIONS),
		owner: { kind: "profile" },
		isSettingsOpen: open,
	})
	const historySession = useHistorySession({
		pages,
		history,
		companionName: t("plugin.author.bot"),
		readerImage: value.image,
	})

	const patch = (fields: Partial<UserSettingsValue>) =>
		onValueChange({ ...value, ...fields })

	return (
		<SettingsDialogShell
			breadcrumb={t("breadcrumb.title")}
			className={className}
			mark={
				<InitialsAvatar
					image={value.image}
					name={displayName}
					size={BREADCRUMB_AVATAR_SIZE}
				/>
			}
			name={displayName}
			onClose={onClose}
			open={open}
			pages={pages}
			rail={(iconsOnly) => (
				<>
					{account ? (
						<SettingsRailItem
							icon="Cloud"
							iconsOnly={iconsOnly}
							label={t("rail.account")}
							value={ACCOUNT_TAB}
						/>
					) : null}
					<SettingsRailItem
						icon="Image"
						iconsOnly={iconsOnly}
						label={t("rail.appearance")}
						value={APPEARANCE_TAB}
					/>
					<SettingsRailItem
						icon="Bell"
						iconsOnly={iconsOnly}
						label={t("rail.notifications")}
						value="notifications"
					/>
					<SettingsRailItem
						icon="Language"
						iconsOnly={iconsOnly}
						label={t("rail.language")}
						value="language"
					/>
					<SettingsRailItem
						icon="Skill"
						iconsOnly={iconsOnly}
						label={t("rail.skills")}
						value="skills"
					/>
					{applications ? (
						<SettingsRailItem
							icon="Server"
							iconsOnly={iconsOnly}
							label={t("rail.applications")}
							value={APPLICATIONS_TAB}
						/>
					) : null}
					<SettingsRailItem
						icon="History"
						iconsOnly={iconsOnly}
						label={t("rail.history")}
						value={HISTORY_TAB}
					/>
					{diagnostics ? (
						<SettingsRailItem
							icon="Tool"
							iconsOnly={iconsOnly}
							label={t("rail.diagnostics")}
							value={DIAGNOSTICS_TAB}
						/>
					) : null}
				</>
			)}
			sessions={{
				skills: skillSession,
				applications: mcpSession,
				history: historySession,
			}}
			tab={tab ?? (account ? ACCOUNT_TAB : APPEARANCE_TAB)}
		>
			{account ? (
				<SettingsScrollingPanel value={ACCOUNT_TAB}>
					<AccountPanel {...account} image={value.image} />
				</SettingsScrollingPanel>
			) : null}

			<SettingsScrollingPanel value={APPEARANCE_TAB}>
				<AppearanceFields
					colorScheme={value.colorScheme}
					onColorSchemeChange={(colorScheme) => patch({ colorScheme })}
				/>
			</SettingsScrollingPanel>

			<SettingsScrollingPanel value="notifications">
				<NotificationFields
					notifications={value.notifications}
					onNotificationsChange={(notifications) => patch({ notifications })}
				/>
			</SettingsScrollingPanel>

			<SettingsScrollingPanel value="language">
				<LanguageFields
					language={language}
					onLanguageChange={onLanguageChange}
				/>
			</SettingsScrollingPanel>

			<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="skills">
				{skillSession.panel}
			</Tabs.Panel>

			{applications ? (
				<Tabs.Panel className={SETTINGS_PANEL_CLASS} value={APPLICATIONS_TAB}>
					{mcpSession.panel}
				</Tabs.Panel>
			) : null}

			<SettingsScrollingPanel isFlush value={HISTORY_TAB}>
				{historySession.panel}
			</SettingsScrollingPanel>

			{diagnostics ? (
				<SettingsScrollingPanel value={DIAGNOSTICS_TAB}>
					<DiagnosticsFields {...diagnostics} />
				</SettingsScrollingPanel>
			) : null}
		</SettingsDialogShell>
	)
}

export {
	UserSettingsDialog,
	type UserSettingsDialogProps,
	type UserSettingsValue,
}
