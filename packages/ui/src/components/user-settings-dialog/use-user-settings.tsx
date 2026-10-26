"use client"

import { useTranslation } from "react-i18next"

import type {
	BotSkillDraft,
	BotSkillItem,
} from "@workspace/ui/components/bot-settings"
import { displayNameOf } from "@workspace/ui/components/initials-avatar"
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
import type { SettingsEntry } from "@workspace/ui/components/settings-rail"
import type { UserSettingsValue } from "@workspace/ui/components/user-settings"
import {
	AboutFields,
	type AboutFieldsProps,
	hasPendingUpdate,
} from "@workspace/ui/components/user-settings-dialog/about-fields"
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

const ACCOUNT_ENTRY = "account"

const APPEARANCE_ENTRY = "appearance"

const NO_APPLICATIONS: ApplicationsSection = {
	servers: [],
	onServerCreate: () => undefined,
	onServerChange: () => undefined,
	onServerDelete: () => undefined,
}

type UserSettingsProps = {
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
	about?: AboutFieldsProps
	history: PluginHistory
}

type UserSettingsOptions = UserSettingsProps & {
	isOpen: boolean
}

const useUserSettings = ({
	isOpen,
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
	about,
	history,
}: UserSettingsOptions) => {
	const { t } = useTranslation("settings")
	const name = displayNameOf(value.name)
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
		isSettingsOpen: isOpen,
	})
	const historySession = useHistorySession({
		pages,
		history,
		companionName: t("plugin.author.bot"),
		readerImage: value.image,
	})

	const patch = (fields: Partial<UserSettingsValue>) =>
		onValueChange({ ...value, ...fields })

	const entries: SettingsEntry[] = [
		...(account
			? [
					{
						value: ACCOUNT_ENTRY,
						icon: "Cloud",
						label: t("rail.account"),
						layout: "scrolling",
						panel: <AccountPanel {...account} image={value.image} />,
					} satisfies SettingsEntry,
				]
			: []),
		{
			value: APPEARANCE_ENTRY,
			icon: "Image",
			label: t("rail.appearance"),
			layout: "scrolling",
			panel: (
				<AppearanceFields
					colorScheme={value.colorScheme}
					onColorSchemeChange={(colorScheme) => patch({ colorScheme })}
				/>
			),
		},
		{
			value: "notifications",
			icon: "Bell",
			label: t("rail.notifications"),
			layout: "scrolling",
			panel: (
				<NotificationFields
					notifications={value.notifications}
					onNotificationsChange={(notifications) => patch({ notifications })}
				/>
			),
		},
		{
			value: "language",
			icon: "Language",
			label: t("rail.language"),
			layout: "scrolling",
			panel: (
				<LanguageFields
					language={language}
					onLanguageChange={onLanguageChange}
				/>
			),
		},
		{
			value: "skills",
			icon: "Skill",
			label: t("rail.skills"),
			layout: "fixed",
			panel: skillSession.panel,
		},
		...(applications
			? [
					{
						value: "mcp",
						icon: "Server",
						label: t("rail.applications"),
						layout: "fixed",
						panel: mcpSession.panel,
					} satisfies SettingsEntry,
				]
			: []),
		{
			value: HISTORY_TAB,
			icon: "History",
			label: t("rail.history"),
			layout: "flush",
			panel: historySession.panel,
		},
		...(diagnostics
			? [
					{
						value: "diagnostics",
						icon: "Tool",
						label: t("rail.diagnostics"),
						layout: "scrolling",
						panel: <DiagnosticsFields {...diagnostics} />,
					} satisfies SettingsEntry,
				]
			: []),
		...(about
			? [
					{
						value: "about",
						icon: "Info",
						label: t("rail.about"),
						layout: "scrolling",
						hasIndicator: hasPendingUpdate(about.update),
						panel: <AboutFields {...about} />,
					} satisfies SettingsEntry,
				]
			: []),
	]

	return {
		name,
		pages,
		sessions: {
			skills: skillSession,
			applications: mcpSession,
			history: historySession,
		},
		entries,
		firstEntry: account ? ACCOUNT_ENTRY : APPEARANCE_ENTRY,
	}
}

export { type UserSettingsProps, useUserSettings }
