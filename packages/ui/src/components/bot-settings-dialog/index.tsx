"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useTranslation } from "react-i18next"

import {
	type ActivityIndicatorKind,
	BotIdentityAvatar,
} from "@workspace/ui/components/bot-identity-avatar"
import { BotIdentityFields } from "@workspace/ui/components/bot-identity-fields"
import type {
	BotIdentity,
	BotModelOption,
	BotOutputStyle,
	BotPermissions,
	BotSettingsValue,
} from "@workspace/ui/components/bot-settings"
import { DangerZone } from "@workspace/ui/components/bot-settings-dialog/danger-zone"
import { BotGeneralFields } from "@workspace/ui/components/bot-settings-dialog/general-fields"
import { BotInstructionsFields } from "@workspace/ui/components/bot-settings-dialog/instructions-fields"
import { PermissionsPanel } from "@workspace/ui/components/bot-settings-dialog/permissions-panel"
import { RuntimeFields } from "@workspace/ui/components/bot-settings-dialog/runtime-fields"
import {
	blotOf,
	hueOf,
	isFreeHue,
} from "@workspace/ui/components/companion-colour"
import {
	type EnvironmentEntry,
	EnvironmentPanel,
	type EnvironmentWrite,
} from "@workspace/ui/components/environment-panel"
import type { PluginHistory } from "@workspace/ui/components/plugin-settings/history-panel"
import { HISTORY_TAB } from "@workspace/ui/components/plugin-settings/use-history-session"
import type { PluginSessionsProps } from "@workspace/ui/components/plugin-settings/use-plugin-sessions"
import { usePluginSessions } from "@workspace/ui/components/plugin-settings/use-plugin-sessions"
import { SettingsDialogShell } from "@workspace/ui/components/settings-dialog-shell"
import {
	DANGER_RAIL_ITEM_CLASS,
	SETTINGS_PANEL_CLASS,
	SettingsRailItem,
	SettingsRailSeparator,
	SettingsScrollingPanel,
} from "@workspace/ui/components/settings-rail"

const FIRST_TAB = "general"

const DANGER_TAB = "danger"

type BotSettingsDialogProps = PluginSessionsProps & {
	open: boolean
	onClose: () => void
	value: BotSettingsValue
	onValueChange: (value: BotSettingsValue) => void
	models: BotModelOption[]
	outputStyle?: BotOutputStyle
	onOutputStyleChange?: (outputStyle: BotOutputStyle) => void
	memory?: string
	onMemoryChange?: (memory: string) => void
	onAvatarUpload: (file: File) => void
	environment: EnvironmentEntry[]
	isEnvironmentPending?: boolean
	hasEnvironmentFailedToRead?: boolean
	onEnvironmentSet: (write: EnvironmentWrite) => void | Promise<void>
	onEnvironmentDelete: (name: string) => void | Promise<void>
	tab?: string
	history?: PluginHistory
	seed?: string
	onDelete: () => void
	showDanger?: boolean
	working?: boolean
	workingKind?: ActivityIndicatorKind
	className?: string
}

const BotSettingsDialog = ({
	open,
	onClose,
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
	tab,
	history,
	seed,
	onDelete,
	showDanger,
	working = false,
	workingKind,
	className,
	...sessionProps
}: BotSettingsDialogProps) => {
	const { t } = useTranslation("bots")
	const botName = value.name.trim() || t("dialog.untitled")
	const { pages, sessions } = usePluginSessions({
		...sessionProps,
		owner: { kind: "companion", name: botName },
		isSettingsOpen: open,
		history,
		historyCompanion: value.identity,
		historyCompanionName: botName,
	})

	const patch = (fields: Partial<BotSettingsValue>) =>
		onValueChange({ ...value, ...fields })

	const recolour = (hue: number | null) => {
		if (isFreeHue(hue)) return
		patch({ identity: { blot: blotOf(hue) } })
	}

	return (
		<SettingsDialogShell
			breadcrumb={t("dialog.breadcrumb")}
			className={className}
			mark={
				<BotIdentityAvatar
					blot={value.identity.blot}
					image={value.identity.image}
					kind={workingKind}
					name={botName}
					seed={seed}
					size={32}
					working={working}
				/>
			}
			name={botName}
			onClose={onClose}
			open={open}
			pages={pages}
			rail={(iconsOnly) => (
				<>
					<SettingsRailItem
						icon="Settings"
						iconsOnly={iconsOnly}
						label={t("dialog.tab.general")}
						value={FIRST_TAB}
					/>
					<SettingsRailItem
						icon="Image"
						iconsOnly={iconsOnly}
						label={t("dialog.tab.appearance")}
						value="appearance"
					/>
					<SettingsRailItem
						icon="Docs"
						iconsOnly={iconsOnly}
						label={t("dialog.tab.instructions")}
						value="instructions"
					/>
					<SettingsRailItem
						icon="Skill"
						iconsOnly={iconsOnly}
						label={t("dialog.tab.skills")}
						value="skills"
					/>
					<SettingsRailItem
						icon="Server"
						iconsOnly={iconsOnly}
						label={t("dialog.tab.applications")}
						value="mcp"
					/>
					<SettingsRailItem
						icon="Json"
						iconsOnly={iconsOnly}
						label={t("dialog.tab.secrets")}
						value="environment"
					/>
					{history ? (
						<SettingsRailItem
							icon="History"
							iconsOnly={iconsOnly}
							label={t("dialog.tab.history")}
							value={HISTORY_TAB}
						/>
					) : null}
					<SettingsRailItem
						icon="Shield"
						iconsOnly={iconsOnly}
						label={t("dialog.tab.approvals")}
						value="permissions"
					/>
					<SettingsRailItem
						icon="Terminal"
						iconsOnly={iconsOnly}
						label={t("dialog.tab.runtime")}
						value="runtime"
					/>
					<SettingsRailSeparator />
					<SettingsRailItem
						className={DANGER_RAIL_ITEM_CLASS}
						icon="Alert"
						iconsOnly={iconsOnly}
						label={t("dialog.tab.danger")}
						value={DANGER_TAB}
					/>
				</>
			)}
			sessions={sessions}
			tab={showDanger ? DANGER_TAB : (tab ?? FIRST_TAB)}
		>
			<SettingsScrollingPanel value={FIRST_TAB}>
				<BotGeneralFields onValueChange={onValueChange} value={value} />
			</SettingsScrollingPanel>

			<SettingsScrollingPanel value="appearance">
				<BotIdentityFields
					hue={hueOf(value.identity.blot) ?? null}
					identity={value.identity}
					name={botName}
					onAvatarUpload={onAvatarUpload}
					onHueChange={recolour}
					onIdentityChange={(identity: BotIdentity) => patch({ identity })}
					seed={seed}
					working={working}
					workingKind={workingKind}
				/>
			</SettingsScrollingPanel>

			<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="instructions">
				<BotInstructionsFields
					memory={memory}
					onMemoryChange={onMemoryChange}
					onValueChange={onValueChange}
					value={value}
				/>
			</Tabs.Panel>

			<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="skills">
				{sessions.skills.panel}
			</Tabs.Panel>

			<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="mcp">
				{sessions.applications.panel}
			</Tabs.Panel>

			<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="environment">
				<EnvironmentPanel
					entries={environment}
					hasFailedToRead={hasEnvironmentFailedToRead}
					isPending={isEnvironmentPending}
					onDelete={onEnvironmentDelete}
					onSet={onEnvironmentSet}
					scope="bot"
				/>
			</Tabs.Panel>

			{history ? (
				<SettingsScrollingPanel isFlush value={HISTORY_TAB}>
					{sessions.history.panel}
				</SettingsScrollingPanel>
			) : null}

			<SettingsScrollingPanel value="permissions">
				<PermissionsPanel
					onPermissionsChange={(permissions: BotPermissions) =>
						patch({ permissions })
					}
					permissions={value.permissions}
				/>
			</SettingsScrollingPanel>

			<SettingsScrollingPanel value="runtime">
				<RuntimeFields
					effort={value.effort}
					model={value.model}
					models={models}
					onEffortChange={(effort) => patch({ effort })}
					onModelChange={patch}
					onOutputStyleChange={onOutputStyleChange}
					outputStyle={outputStyle}
				/>
			</SettingsScrollingPanel>

			<SettingsScrollingPanel value={DANGER_TAB}>
				<DangerZone
					confirmTitle={t("danger.confirm.title", { name: botName })}
					actionLabel={t("danger.delete")}
					description={t("danger.description")}
					onConfirm={onDelete}
				/>
			</SettingsScrollingPanel>
		</SettingsDialogShell>
	)
}

export {
	type BotModelOption,
	BotSettingsDialog,
	type BotSettingsDialogProps,
	type BotSettingsValue,
}
