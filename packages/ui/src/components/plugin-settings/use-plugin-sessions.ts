"use client"

import type {
	BotIdentity,
	BotMcpServerItem,
	BotSkillDraft,
	BotSkillItem,
} from "@workspace/ui/components/bot-settings"
import type { McpConnectionSection } from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import type { McpServerEditorLayout } from "@workspace/ui/components/bot-settings-dialog/mcp-server-editor-header"
import type { EnvironmentSection } from "@workspace/ui/components/environment-panel"
import type { ApplicationsOwner } from "@workspace/ui/components/plugin-settings/applications-panel"
import type { PluginHistory } from "@workspace/ui/components/plugin-settings/history-panel"
import type {
	SettingsPage,
	SettingsPages,
} from "@workspace/ui/components/plugin-settings/settings-pages"
import type { PluginSkillFiles } from "@workspace/ui/components/plugin-settings/skill-files-panel"
import {
	type HistorySession,
	useHistorySession,
} from "@workspace/ui/components/plugin-settings/use-history-session"
import {
	type ApplicationsCatalogueSection,
	type McpSession,
	useMcpSession,
} from "@workspace/ui/components/plugin-settings/use-mcp-session"
import {
	type SkillSession,
	useSkillSession,
} from "@workspace/ui/components/plugin-settings/use-skill-session"
import { usePushedPages } from "@workspace/ui/hooks/use-pushed-pages"

type PluginSessionsProps = {
	skills: BotSkillItem[]
	onSkillCreate: (draft: BotSkillDraft, isPreloaded: boolean) => void
	onSkillChange: (id: string, draft: BotSkillDraft) => void
	onSkillPreloadedChange: (id: string, isPreloaded: boolean) => void
	onSkillDelete: (id: string) => void
	skillFiles?: PluginSkillFiles
	mcpServers: BotMcpServerItem[]
	haveMcpServersFailedToLoad?: boolean
	onMcpServerCreate: (name: string, config: Record<string, unknown>) => void
	onMcpServerChange: (
		openedName: string,
		name: string,
		config: Record<string, unknown>,
	) => void
	onMcpServerDelete: (name: string) => void
	mcpCatalogue?: ApplicationsCatalogueSection
	onMcpServerOpen?: (name: string | null) => void
	onServerConnect?: (server: BotMcpServerItem) => void
	serverConnection?: McpConnectionSection
	serverEnvironment?: EnvironmentSection
	mcpServerToOpen?: string
}

type PluginSessionsOptions = PluginSessionsProps & {
	owner: ApplicationsOwner
	isSettingsOpen: boolean
	history?: PluginHistory
	historyCompanion?: BotIdentity
	historyCompanionName: string
	editorLayout?: McpServerEditorLayout
}

type PluginSessions = {
	pages: SettingsPages
	sessions: {
		skills: SkillSession
		applications: McpSession
		history: HistorySession
	}
}

const usePluginSessions = ({
	skills,
	onSkillCreate,
	onSkillChange,
	onSkillPreloadedChange,
	onSkillDelete,
	skillFiles,
	mcpServers,
	haveMcpServersFailedToLoad,
	onMcpServerCreate,
	onMcpServerChange,
	onMcpServerDelete,
	mcpCatalogue,
	onMcpServerOpen,
	onServerConnect,
	serverConnection,
	serverEnvironment,
	mcpServerToOpen,
	owner,
	isSettingsOpen,
	history,
	historyCompanion,
	historyCompanionName,
	editorLayout,
}: PluginSessionsOptions): PluginSessions => {
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
		owner,
		catalogue: mcpCatalogue,
		servers: mcpServers,
		haveFailedToLoad: haveMcpServersFailedToLoad,
		onServerChange: onMcpServerChange,
		onServerCreate: onMcpServerCreate,
		onServerDelete: onMcpServerDelete,
		onServerOpen: onMcpServerOpen,
		onServerConnect,
		serverConnection,
		serverEnvironment,
		serverToOpen: mcpServerToOpen,
		isSettingsOpen,
		editorLayout,
	})
	const historySession = useHistorySession({
		pages,
		history,
		companion: historyCompanion,
		companionName: historyCompanionName,
	})

	return {
		pages,
		sessions: {
			skills: skillSession,
			applications: mcpSession,
			history: historySession,
		},
	}
}

export { type PluginSessionsProps, usePluginSessions }
