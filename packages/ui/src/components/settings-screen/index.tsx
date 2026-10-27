"use client"

import { type ReactNode, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { AppHeader } from "@workspace/ui/components/app-header"
import {
	AppTitleBar,
	type AppTitleBarProps,
} from "@workspace/ui/components/app-title-bar"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { BotIdentityFields } from "@workspace/ui/components/bot-identity-fields"
import type {
	BotMcpServerItem,
	BotSettingsValue,
} from "@workspace/ui/components/bot-settings"
import type { BotSettingsDialogProps } from "@workspace/ui/components/bot-settings-dialog"
import { DangerZone } from "@workspace/ui/components/bot-settings-dialog/danger-zone"
import { BotGeneralFields } from "@workspace/ui/components/bot-settings-dialog/general-fields"
import { BotInstructionsFields } from "@workspace/ui/components/bot-settings-dialog/instructions-fields"
import { PermissionsPanel } from "@workspace/ui/components/bot-settings-dialog/permissions-panel"
import { RuntimeFields } from "@workspace/ui/components/bot-settings-dialog/runtime-fields"
import type { BotAvatarBlot } from "@workspace/ui/components/companion-colour"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { EnvironmentPanel } from "@workspace/ui/components/environment-panel"
import {
	HostPill,
	hostPillOf,
	type SpaceHost,
} from "@workspace/ui/components/host-pill"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import type { SettingsPages } from "@workspace/ui/components/plugin-settings/settings-pages"
import { HISTORY_TAB } from "@workspace/ui/components/plugin-settings/use-history-session"
import type { McpSession } from "@workspace/ui/components/plugin-settings/use-mcp-session"
import { usePluginSessions } from "@workspace/ui/components/plugin-settings/use-plugin-sessions"
import {
	ScreenLayout,
	type ScreenLayoutWidth,
} from "@workspace/ui/components/screen-layout"
import {
	type SettingsSession,
	wordedKindOf,
} from "@workspace/ui/components/settings-dialog-shell"
import {
	SettingsMenu,
	SettingsMenuAction,
	SettingsMenuAddApplication,
	SettingsMenuAddSpace,
	SettingsMenuApplication,
	SettingsMenuEntry,
	SettingsMenuSection,
	SettingsMenuSpace,
} from "@workspace/ui/components/settings-menu"
import type { SettingsEntry } from "@workspace/ui/components/settings-rail"
import {
	avatarStateOf,
	type FocusedSpace,
	FocusedSpacePage,
	spaceHostOf,
} from "@workspace/ui/components/settings-screen/focused-space-page"
import { SidebarResizeHandle } from "@workspace/ui/components/sidebar-resize"
import type { Space } from "@workspace/ui/components/space"
import { SpaceAvatar } from "@workspace/ui/components/space-avatar"
import {
	APPLICATIONS_ENTRY,
	COMPANIONS_ENTRY,
	SPACE_ENTRY,
	type SpaceSettingsProps,
	useSpaceSettings,
} from "@workspace/ui/components/space-settings-dialog/use-space-settings"
import {
	type UserSettingsProps,
	useUserSettings,
} from "@workspace/ui/components/user-settings-dialog/use-user-settings"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"
import { useOverlayScrollbars } from "@workspace/ui/hooks/use-overlay-scrollbars"
import { cn } from "@workspace/ui/lib/utils"

const HEADER_AVATAR_SIZE = 36

const FULL_PAGES = new Set([
	"members",
	COMPANIONS_ENTRY,
	"skills",
	APPLICATIONS_ENTRY,
	HISTORY_TAB,
	"permissions",
])

const SECTION_GAP = {
	tight: "gap-3",
	compact: "gap-4",
	regular: "gap-5",
	loose: "gap-6",
	wide: "gap-7",
} as const

type SectionGap = keyof typeof SECTION_GAP

type CompanionSectionProps = {
	gap: SectionGap
	children: ReactNode
}

const CompanionSection = ({ gap, children }: CompanionSectionProps) => (
	<div className={cn("flex flex-col", SECTION_GAP[gap])} data-companion-page="">
		{children}
	</div>
)

type PageSessions = {
	skills: SettingsSession
	applications: McpSession
	history: SettingsSession
}

type SettingsScreenRequestLeave = (navigate: () => void) => void

type SettingsScreenNavigation = {
	entry: string
	onEntryChange: (entry: string) => void
	onBack: () => void
	backLabel?: string
	rail?: (requestLeave: SettingsScreenRequestLeave) => ReactNode
	titleBar?: AppTitleBarProps
	width?: number
	onWidthChange?: (width: number) => void
	isResizable?: boolean
	spaceTint?: BotAvatarBlot | null
}

type SpaceState = FocusedSpace["state"]

type SpaceInvitationTerms = {
	hostEmail: string
	expiresAt: number
}

type OwnedOrJoinedSpace = {
	spaceState?: Exclude<SpaceState, "invitation">
	invitation?: never
	onAccept?: never
	onDecline?: never
}

type InvitedSpace = {
	spaceState: "invitation"
	invitation: SpaceInvitationTerms
	onAccept: () => void
	onDecline: () => void
}

type SpaceSettingsScreenProps = SettingsScreenNavigation &
	SpaceSettingsProps &
	(OwnedOrJoinedSpace | InvitedSpace) & {
		target: "space"
		spaceId: string
		spaceHost?: SpaceHost
		hostName?: string
		isConnected?: boolean
		isSessionUnavailable?: boolean
		isShared?: boolean
		rank?: number
		onOpen?: () => void
		onShare?: () => void
	}

type UserSpace = Space & {
	host?: SpaceHost
	hasAttention?: boolean
}

type UserSettingsScreenProps = SettingsScreenNavigation &
	UserSettingsProps & {
		target: "user"
		ownedSpaces?: UserSpace[]
		joinedSpaces?: UserSpace[]
		invitations?: Space[]
		currentSpaceId?: string
		onOpenSpace?: (id: string) => void
		onCreateSpace?: () => void
	}

type SettingsScreenProps = SpaceSettingsScreenProps | UserSettingsScreenProps

type CompanionSettingsScreenProps = SettingsScreenNavigation &
	Omit<
		BotSettingsDialogProps,
		"open" | "onClose" | "tab" | "showDanger" | "className"
	>

type SettingsScreenLayoutProps = SettingsScreenNavigation & {
	avatar: ReactNode
	name: string
	status?: ReactNode
	subtitle: string
	entries: SettingsEntry[]
	pages: SettingsPages
	sessions: PageSessions
	applications: BotMcpServerItem[]
	pinnedAction?: ReactNode
	isCompanionPage?: boolean
	spaces?: (requestLeave: SettingsScreenRequestLeave) => ReactNode
}

const SESSION_OF_ENTRY: Record<string, keyof PageSessions | undefined> = {
	skills: "skills",
	[APPLICATIONS_ENTRY]: "applications",
	[HISTORY_TAB]: "history",
}

const SESSION_BOUND_ENTRIES = new Set([
	"environment",
	"skills",
	APPLICATIONS_ENTRY,
	HISTORY_TAB,
])

const SettingsScreenLayout = ({
	entry,
	onEntryChange,
	onBack,
	backLabel,
	rail,
	titleBar,
	width,
	onWidthChange,
	isResizable,
	spaceTint,
	avatar,
	name,
	status,
	subtitle,
	entries,
	pages,
	sessions,
	applications,
	pinnedAction,
	isCompanionPage = false,
	spaces,
}: SettingsScreenLayoutProps) => {
	const scroller = useRef<HTMLElement | null>(null)
	useOverlayScrollbars(scroller)

	const { t } = useTranslation(["bots", "settings"])
	const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null)

	const shown =
		entries.find(({ value, isDisabled }) => value === entry && !isDisabled) ??
		entries[0]
	const sessionKind = SESSION_OF_ENTRY[shown.value]
	const shownSession = sessionKind ? sessions[sessionKind] : undefined
	const page = shownSession && pages.top ? shownSession.pages[pages.top] : null
	const isApplicationsShown = shown.value === APPLICATIONS_ENTRY
	const isApplicationOpen = isApplicationsShown && pages.top === "server"
	const pageWidth: ScreenLayoutWidth =
		FULL_PAGES.has(shown.value) && !isApplicationOpen ? "full" : "column"
	const openedName = isApplicationOpen
		? sessions.applications.openedName
		: undefined
	const isSubEntrySelected = openedName !== undefined && !isCompanionPage
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
			isOutlined={isCompanionPage}
			count={item.count}
			hasIndicator={item.hasIndicator}
			icon={item.icon}
			isDanger={item.isDanger}
			isDisabled={item.isDisabled}
			isOpen={item.value === shown.value && isSubEntrySelected}
			isSelected={item.value === shown.value && !isSubEntrySelected}
			key={item.value}
			label={item.label}
			onSelect={() => select(item.value)}
		>
			{item.value === APPLICATIONS_ENTRY &&
			isApplicationsShown &&
			!isCompanionPage ? (
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
			isResizable={isResizable}
			spaceTint={spaceTint}
			onWidthChange={onWidthChange}
			sidebar={
				<>
					<AppTitleBar {...titleBar} />
					{rail?.(leaveThen)}
					<SettingsMenu
						isCompanionPage={isCompanionPage}
						avatar={avatar}
						backLabel={backLabel}
						footer={
							pinned.length > 0 || pinnedAction ? (
								<>
									{pinned.map(entryFor)}
									{pinnedAction}
								</>
							) : undefined
						}
						name={name}
						onBack={() => leaveThen(onBack)}
						resizeHandle={<SidebarResizeHandle side="left" />}
						status={status}
						subtitle={subtitle}
					>
						{spaces ? (
							<>
								<SettingsMenuSection
									title={t("settings:screen.group.settings")}
								>
									{ordinary.map(entryFor)}
								</SettingsMenuSection>
								{spaces(leaveThen)}
							</>
						) : (
							ordinary.map(entryFor)
						)}
					</SettingsMenu>
				</>
			}
			width={width}
		>
			<ScreenLayout
				contentClassName={shown.value === SPACE_ENTRY ? "gap-6" : "gap-4"}
				data-entry={shown.value}
				data-slot="settings-screen-page"
				header={
					<AppHeader
						className="pl-6"
						data-tauri-drag-region="deep"
						leading={<h2 className="truncate">{shown.label}</h2>}
					/>
				}
				ref={(layout) => {
					scroller.current =
						layout?.querySelector<HTMLElement>(
							'[data-slot="screen-layout-scroller"]',
						) ?? null
				}}
				width={pageWidth}
			>
				{page ?? shown.panel}
			</ScreenLayout>
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

const focusedSpaceOf = (props: SpaceSettingsScreenProps): FocusedSpace => {
	if (props.spaceState === "invitation") {
		return { state: "invitation", ...props.invitation }
	}
	const state =
		props.spaceState ?? (props.host === undefined ? "yours" : "joined")
	return state === "joined"
		? {
				state,
				hostName: props.hostName ?? props.host ?? "",
				isConnected: props.isConnected ?? true,
			}
		: { state, isShared: props.isShared ?? false }
}

const SpaceSettingsScreen = (props: SpaceSettingsScreenProps) => {
	const {
		entry,
		onEntryChange,
		onBack,
		backLabel,
		rail,
		titleBar,
		width,
		onWidthChange,
		isResizable,
		spaceTint,
		target: _target,
		spaceId,
		spaceHost,
		spaceState: _spaceState,
		hostName: _hostName,
		isConnected: _isConnected,
		isSessionUnavailable = false,
		isShared: _isShared,
		invitation: _invitation,
		rank,
		onOpen,
		onShare,
		onAccept,
		onDecline,
		...settings
	} = props
	const { t } = useTranslation("settings")
	const { t: tCommon } = useTranslation("common")
	const { t: tBots } = useTranslation("bots")
	const [isLeaving, setIsLeaving] = useState(false)
	const space = focusedSpaceOf(props)
	const { name, pages, sessions, entries, transfer } = useSpaceSettings({
		...settings,
		isOpen: true,
		editorLayout: "page",
	})

	const spaceEntry: SettingsEntry = {
		value: SPACE_ENTRY,
		icon: "Folder",
		label: t(space.state === "invitation" ? "rail.invitation" : "rail.space"),
		layout: "scrolling",
		panel: (
			<FocusedSpacePage
				onAccept={onAccept}
				onOpen={onOpen}
				onShare={onShare}
				onValueChange={settings.onValueChange}
				rank={rank}
				space={space}
				spaceHost={spaceHost}
				spaceId={spaceId}
				value={settings.value}
			>
				{space.state === "yours" ? transfer : null}
			</FocusedSpacePage>
		),
	}

	const isHostUnreachable = space.state === "joined" && !space.isConnected
	const isEntryDisabled = (value: string) =>
		isHostUnreachable ||
		(isSessionUnavailable && SESSION_BOUND_ENTRIES.has(value))
	const host = spaceHostOf(space, spaceHost)
	const pillHost = hostPillOf(host)

	const focusedEntries =
		space.state === "invitation"
			? [spaceEntry]
			: entries
					.filter(({ isDanger }) => space.state === "yours" || !isDanger)
					.map((item) =>
						item.value === SPACE_ENTRY
							? spaceEntry
							: { ...item, isDisabled: isEntryDisabled(item.value) },
					)

	const pinnedAction = onDecline ? (
		<SettingsMenuAction
			icon="Close"
			label={tBots("spaces.invitations.decline")}
			onSelect={onDecline}
			tone="quiet"
		/>
	) : space.state === "joined" && settings.onLeave ? (
		<>
			<SettingsMenuAction
				icon="Leave"
				label={tCommon("spaces.leave.action")}
				onSelect={() => setIsLeaving(true)}
				tone="danger"
			/>
			<ConfirmDialog
				confirmLabel={tCommon("spaces.leave.action")}
				confirmVariant="destructive"
				description={tCommon("spaces.leave.description")}
				onConfirm={settings.onLeave}
				onOpenChange={setIsLeaving}
				open={isLeaving}
				title={tCommon("spaces.leave.title", { name })}
			/>
		</>
	) : undefined

	return (
		<SettingsScreenLayout
			applications={settings.mcpServers}
			avatar={
				<SpaceAvatar
					colour={settings.value.colour}
					size={36}
					spaceId={spaceId}
					state={avatarStateOf(space, host)}
				/>
			}
			entries={focusedEntries}
			entry={entry}
			backLabel={backLabel ?? t("screen.backToSettings")}
			name={name}
			status={pillHost ? <HostPill host={pillHost} /> : undefined}
			onBack={onBack}
			onEntryChange={onEntryChange}
			pages={pages}
			pinnedAction={pinnedAction}
			isResizable={isResizable}
			spaceTint={spaceTint}
			onWidthChange={onWidthChange}
			rail={rail}
			sessions={sessions}
			titleBar={titleBar}
			width={width}
			subtitle={t(
				space.state === "invitation"
					? "screen.subtitle.invitation"
					: "screen.subtitle.space",
			)}
		/>
	)
}

const UserSettingsScreen = ({
	entry,
	onEntryChange,
	onBack,
	backLabel,
	rail,
	titleBar,
	width,
	onWidthChange,
	isResizable,
	spaceTint,
	ownedSpaces = [],
	joinedSpaces = [],
	invitations = [],
	currentSpaceId,
	onOpenSpace,
	onCreateSpace,
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
			backLabel={backLabel}
			name={name}
			onBack={onBack}
			onEntryChange={onEntryChange}
			pages={pages}
			isResizable={isResizable}
			spaceTint={spaceTint}
			onWidthChange={onWidthChange}
			rail={rail}
			sessions={sessions}
			spaces={(requestLeave) => {
				const openSpace = (id: string) => requestLeave(() => onOpenSpace?.(id))

				return (
					<SettingsMenuSection
						action={
							<SettingsMenuAddSpace
								onAdd={() => requestLeave(() => onCreateSpace?.())}
							/>
						}
						title={t("screen.group.spaces")}
					>
						{[...ownedSpaces, ...joinedSpaces].map((space) => (
							<SettingsMenuSpace
								colour={space.colour}
								hasAttention={space.hasAttention}
								host={space.host}
								isCurrent={space.id === currentSpaceId}
								key={space.id}
								name={space.name}
								onOpen={() => openSpace(space.id)}
								spaceId={space.avatarSeed}
							/>
						))}
						{invitations.map((invitation) => (
							<SettingsMenuSpace
								colour={invitation.colour}
								isInvitation
								key={invitation.id}
								name={invitation.name}
								onOpen={() => openSpace(invitation.id)}
								spaceId={invitation.id}
							/>
						))}
					</SettingsMenuSection>
				)
			}}
			titleBar={titleBar}
			width={width}
			subtitle={t("screen.subtitle.user")}
		/>
	)
}

const CompanionSettingsScreen = ({
	entry,
	onEntryChange,
	onBack,
	backLabel,
	rail,
	titleBar,
	width,
	onWidthChange,
	isResizable,
	spaceTint,
	value,
	onValueChange,
	models,
	outputStyle,
	onOutputStyleChange,
	memory,
	onMemoryChange,
	onAvatarUpload,
	environment,
	isEnvironmentPending,
	hasEnvironmentFailedToRead,
	onEnvironmentSet,
	onEnvironmentDelete,
	history,
	seed,
	onDelete,
	working,
	workingKind,
	...sessionProps
}: CompanionSettingsScreenProps) => {
	const { t } = useTranslation("bots")
	const { t: tSettings } = useTranslation("settings")
	const name = value.name.trim() || t("dialog.untitled")
	const { pages, sessions } = usePluginSessions({
		...sessionProps,
		owner: { kind: "companion", name },
		isSettingsOpen: true,
		history,
		historyCompanion: value.identity,
		historyCompanionName: name,
		editorLayout: "page",
	})

	const patch = (fields: Partial<BotSettingsValue>) =>
		onValueChange({ ...value, ...fields })

	const historyEntry: SettingsEntry[] = history
		? [
				{
					value: HISTORY_TAB,
					icon: "Clock",
					label: t("dialog.tab.history"),
					layout: "flush",
					panel: (
						<CompanionSection gap="compact">
							{sessions.history.panel}
						</CompanionSection>
					),
				},
			]
		: []

	const entries: SettingsEntry[] = [
		{
			value: "general",
			icon: "User",
			label: t("dialog.tab.general"),
			layout: "scrolling",
			panel: (
				<CompanionSection gap="regular">
					<BotGeneralFields onValueChange={onValueChange} value={value} />
				</CompanionSection>
			),
		},
		{
			value: "appearance",
			icon: "Palette",
			label: t("dialog.tab.appearance"),
			layout: "scrolling",
			panel: (
				<CompanionSection gap="loose">
					<BotIdentityFields
						identity={value.identity}
						name={name}
						onAvatarUpload={onAvatarUpload}
						onIdentityChange={(identity) => patch({ identity })}
						seed={seed}
						working={working}
						workingKind={workingKind}
					/>
				</CompanionSection>
			),
		},
		{
			value: "instructions",
			icon: "File",
			label: t("dialog.tab.instructions"),
			layout: "scrolling",
			panel: (
				<CompanionSection gap="wide">
					<BotInstructionsFields
						memory={memory}
						onMemoryChange={onMemoryChange}
						onValueChange={onValueChange}
						isTall
						value={value}
					/>
				</CompanionSection>
			),
		},
		{
			value: "skills",
			icon: "Skill",
			label: t("dialog.tab.skills"),
			layout: "fixed",
			panel: (
				<CompanionSection gap="tight">{sessions.skills.panel}</CompanionSection>
			),
		},
		{
			value: APPLICATIONS_ENTRY,
			icon: "Server",
			label: t("dialog.tab.applications"),
			layout: "fixed",
			panel: (
				<CompanionSection gap="tight">
					{sessions.applications.panel}
				</CompanionSection>
			),
		},
		{
			value: "environment",
			icon: "Json",
			label: t("dialog.tab.secrets"),
			layout: "fixed",
			panel: (
				<CompanionSection gap="tight">
					<EnvironmentPanel
						entries={environment}
						hasFailedToRead={hasEnvironmentFailedToRead}
						isPending={isEnvironmentPending}
						onDelete={onEnvironmentDelete}
						onSet={onEnvironmentSet}
						scope="bot"
					/>
				</CompanionSection>
			),
		},
		...historyEntry,
		{
			value: "permissions",
			icon: "ShieldCheck",
			label: t("dialog.tab.approvals"),
			layout: "scrolling",
			panel: (
				<CompanionSection gap="loose">
					<PermissionsPanel
						onPermissionsChange={(permissions) => patch({ permissions })}
						permissions={value.permissions}
					/>
				</CompanionSection>
			),
		},
		{
			value: "runtime",
			icon: "Cpu",
			label: t("dialog.tab.runtime"),
			layout: "scrolling",
			panel: (
				<CompanionSection gap="regular">
					<RuntimeFields
						effort={value.effort}
						model={value.model}
						models={models}
						onEffortChange={(effort) => patch({ effort })}
						onModelChange={patch}
						onOutputStyleChange={onOutputStyleChange}
						outputStyle={outputStyle}
					/>
				</CompanionSection>
			),
		},
		{
			value: "danger",
			icon: "Alert",
			label: t("dialog.tab.danger"),
			layout: "scrolling",
			isDanger: true,
			panel: (
				<CompanionSection gap="tight">
					<DangerZone
						confirmTitle={t("danger.confirm.title", { name })}
						actionLabel={t("danger.delete")}
						description={t("danger.description")}
						onConfirm={onDelete}
					/>
				</CompanionSection>
			),
		},
	]

	return (
		<SettingsScreenLayout
			applications={sessionProps.mcpServers}
			avatar={
				<BotIdentityAvatar
					blot={value.identity.blot}
					image={value.identity.image}
					kind={workingKind}
					name={name}
					seed={seed}
					size={HEADER_AVATAR_SIZE}
					working={working}
				/>
			}
			backLabel={backLabel}
			entries={entries}
			entry={entry}
			name={name}
			onBack={onBack}
			onEntryChange={onEntryChange}
			isCompanionPage
			pages={pages}
			isResizable={isResizable}
			spaceTint={spaceTint}
			onWidthChange={onWidthChange}
			rail={rail}
			sessions={sessions}
			titleBar={titleBar}
			width={width}
			subtitle={tSettings("screen.subtitle.companion")}
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
	CompanionSettingsScreen,
	type CompanionSettingsScreenProps,
	SettingsScreen,
	type SettingsScreenProps,
	type SettingsScreenRequestLeave,
	type SpaceSettingsScreenProps,
	type UserSettingsScreenProps,
	type UserSpace,
}
