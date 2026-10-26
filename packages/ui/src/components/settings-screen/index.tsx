"use client"

import { type ReactNode, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import type { BotMcpServerItem } from "@workspace/ui/components/bot-settings"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import type { SettingsPages } from "@workspace/ui/components/plugin-settings/settings-pages"
import { HISTORY_TAB } from "@workspace/ui/components/plugin-settings/use-history-session"
import type { McpSession } from "@workspace/ui/components/plugin-settings/use-mcp-session"
import {
	type SettingsSession,
	wordedKindOf,
} from "@workspace/ui/components/settings-dialog-shell"
import {
	SettingsMenu,
	SettingsMenuAddApplication,
	SettingsMenuApplication,
	SettingsMenuEntry,
} from "@workspace/ui/components/settings-menu"
import type { SettingsEntry } from "@workspace/ui/components/settings-rail"
import {
	APPLICATIONS_ENTRY,
	COMPANIONS_ENTRY,
	type SpaceSettingsProps,
	useSpaceSettings,
} from "@workspace/ui/components/space-settings-dialog/use-space-settings"
import { SpaceSquare } from "@workspace/ui/components/space-switcher"
import {
	type UserSettingsProps,
	useUserSettings,
} from "@workspace/ui/components/user-settings-dialog/use-user-settings"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"
import { useOverlayScrollbars } from "@workspace/ui/hooks/use-overlay-scrollbars"
import { cn } from "@workspace/ui/lib/utils"

const HEADER_AVATAR_SIZE = 36

const PAGE = "mx-auto flex w-full max-w-160 flex-col gap-4 px-14 py-12"

const APPLICATION_PAGE = "max-w-140 px-12 py-10"

const COMPANIONS_PAGE = "max-w-188"

type PageSessions = {
	skills: SettingsSession
	applications: McpSession
	history: SettingsSession
}

type SettingsScreenNavigation = {
	entry: string
	onEntryChange: (entry: string) => void
	onBack: () => void
	rail?: ReactNode
}

type SpaceSettingsScreenProps = SettingsScreenNavigation &
	SpaceSettingsProps & {
		target: "space"
		presence?: SpaceHost
	}

type UserSettingsScreenProps = SettingsScreenNavigation &
	UserSettingsProps & {
		target: "user"
	}

type SettingsScreenProps = SpaceSettingsScreenProps | UserSettingsScreenProps

type SettingsScreenLayoutProps = SettingsScreenNavigation & {
	avatar: ReactNode
	name: string
	subtitle: string
	entries: SettingsEntry[]
	pages: SettingsPages
	sessions: PageSessions
	applications: BotMcpServerItem[]
}

const SESSION_OF_ENTRY: Record<string, keyof PageSessions | undefined> = {
	skills: "skills",
	[APPLICATIONS_ENTRY]: "applications",
	[HISTORY_TAB]: "history",
}

const SettingsScreenLayout = ({
	entry,
	onEntryChange,
	onBack,
	rail,
	avatar,
	name,
	subtitle,
	entries,
	pages,
	sessions,
	applications,
}: SettingsScreenLayoutProps) => {
	const column = useRef<HTMLDivElement>(null)
	useOverlayScrollbars(column)

	const { t } = useTranslation("bots")
	const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null)

	const shown = entries.find(({ value }) => value === entry) ?? entries[0]
	const sessionKind = SESSION_OF_ENTRY[shown.value]
	const shownSession = sessionKind ? sessions[sessionKind] : undefined
	const page = shownSession && pages.top ? shownSession.pages[pages.top] : null
	const isApplicationsShown = shown.value === APPLICATIONS_ENTRY
	const isApplicationOpen = isApplicationsShown && pages.top === "server"
	const isCompanionsShown = shown.value === COMPANIONS_ENTRY
	const openedName = isApplicationOpen
		? sessions.applications.openedName
		: undefined
	const wordedKind = wordedKindOf(sessions, pages)
	const ordinary = entries.filter(({ isDanger }) => !isDanger)
	const pinned = entries.filter(({ isDanger }) => isDanger)

	const leaveThen = (navigate: () => void) => {
		const leave = () => {
			if (page) shownSession?.discard()
			navigate()
		}

		if (page && shownSession?.isUnsaved) {
			setPendingLeave(() => leave)
		} else {
			leave()
		}
	}

	const select = (value: string) => leaveThen(() => onEntryChange(value))

	const openApplication = (server: BotMcpServerItem) => {
		if (server.name === openedName) return
		leaveThen(() => {
			sessions.applications.open(server)
			onEntryChange(APPLICATIONS_ENTRY)
		})
	}

	const entryFor = (item: SettingsEntry) => (
		<SettingsMenuEntry
			count={item.count}
			hasIndicator={item.hasIndicator}
			icon={item.icon}
			isDanger={item.isDanger}
			isOpen={item.value === shown.value && openedName !== undefined}
			isSelected={item.value === shown.value && openedName === undefined}
			key={item.value}
			label={item.label}
			onSelect={() => select(item.value)}
		>
			{item.value === APPLICATIONS_ENTRY && isApplicationsShown ? (
				<>
					{applications.map((server) => (
						<SettingsMenuApplication
							connection={server.connection}
							isSelected={server.name === openedName}
							key={server.name}
							mark={server.mark}
							name={server.displayName ?? server.name}
							onSelect={() => openApplication(server)}
						/>
					))}
					<SettingsMenuAddApplication
						onAdd={() => leaveThen(sessions.applications.add)}
					/>
				</>
			) : null}
		</SettingsMenuEntry>
	)

	return (
		<WorkspaceShell
			isResizable={false}
			settingsMenu={
				<>
					{rail}
					<SettingsMenu
						avatar={avatar}
						footer={pinned.length > 0 ? pinned.map(entryFor) : undefined}
						name={name}
						onBack={() => leaveThen(onBack)}
						subtitle={subtitle}
					>
						{ordinary.map(entryFor)}
					</SettingsMenu>
				</>
			}
		>
			<div
				className="min-h-0 flex-1 overflow-y-auto"
				data-slot="settings-screen-column"
				ref={column}
			>
				<div
					className={cn(
						PAGE,
						isApplicationOpen && APPLICATION_PAGE,
						isCompanionsShown && COMPANIONS_PAGE,
					)}
					data-entry={shown.value}
					data-slot="settings-screen-page"
				>
					{isApplicationOpen || isCompanionsShown ? null : (
						<h2 className="font-medium text-muted-foreground text-sm">
							{shown.label}
						</h2>
					)}
					{page ?? shown.panel}
				</div>
			</div>
			<ConfirmDialog
				confirmLabel={t(`${wordedKind}.leave.action`)}
				description={t(`${wordedKind}.leave.description`)}
				onConfirm={() => pendingLeave?.()}
				onOpenChange={(isOpen) => {
					if (!isOpen) setPendingLeave(null)
				}}
				open={pendingLeave !== null}
				title={t(`${wordedKind}.leave.title`)}
			/>
		</WorkspaceShell>
	)
}

const SpaceSettingsScreen = ({
	entry,
	onEntryChange,
	onBack,
	rail,
	presence,
	target: _target,
	...settings
}: SpaceSettingsScreenProps) => {
	const { t } = useTranslation("settings")
	const { name, pages, sessions, entries } = useSpaceSettings({
		...settings,
		isOpen: true,
		editorLayout: "page",
	})

	return (
		<SettingsScreenLayout
			applications={settings.mcpServers}
			avatar={
				<SpaceSquare
					colour={settings.value.colour}
					host={presence}
					size="avatar"
				/>
			}
			entries={entries}
			entry={entry}
			name={name}
			onBack={onBack}
			onEntryChange={onEntryChange}
			pages={pages}
			rail={rail}
			sessions={sessions}
			subtitle={t("screen.subtitle.space")}
		/>
	)
}

const UserSettingsScreen = ({
	entry,
	onEntryChange,
	onBack,
	rail,
	target: _target,
	...settings
}: UserSettingsScreenProps) => {
	const { t } = useTranslation("settings")
	const { name, pages, sessions, entries } = useUserSettings({
		...settings,
		isOpen: true,
		editorLayout: "page",
	})

	return (
		<SettingsScreenLayout
			applications={settings.applications?.servers ?? []}
			avatar={
				<InitialsAvatar
					image={settings.value.image}
					name={name}
					size={HEADER_AVATAR_SIZE}
				/>
			}
			entries={entries}
			entry={entry}
			name={name}
			onBack={onBack}
			onEntryChange={onEntryChange}
			pages={pages}
			rail={rail}
			sessions={sessions}
			subtitle={t("screen.subtitle.user")}
		/>
	)
}

const SettingsScreen = (props: SettingsScreenProps) =>
	props.target === "space" ? (
		<SpaceSettingsScreen {...props} />
	) : (
		<UserSettingsScreen {...props} />
	)

export {
	SettingsScreen,
	type SettingsScreenProps,
	type SpaceSettingsScreenProps,
	type UserSettingsScreenProps,
}
