"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { DangerZone } from "@workspace/ui/components/bot-settings-dialog/danger-zone"
import type { McpServerEditorLayout } from "@workspace/ui/components/bot-settings-dialog/mcp-server-editor-header"
import {
	type EnvironmentEntry,
	EnvironmentPanel,
	type EnvironmentWrite,
} from "@workspace/ui/components/environment-panel"
import type { PluginHistory } from "@workspace/ui/components/plugin-settings/history-panel"
import { HISTORY_TAB } from "@workspace/ui/components/plugin-settings/use-history-session"
import {
	type PluginSessionsProps,
	usePluginSessions,
} from "@workspace/ui/components/plugin-settings/use-plugin-sessions"
import type { SettingsEntry } from "@workspace/ui/components/settings-rail"
import type { SpaceSettingsValue } from "@workspace/ui/components/space-settings"
import {
	CompanionsSection,
	type CompanionsSectionProps,
} from "@workspace/ui/components/space-settings-dialog/companions-section"
import { JoinedSpaceFields } from "@workspace/ui/components/space-settings-dialog/joined-space-fields"
import {
	ShareCard,
	type ShareCardProps,
} from "@workspace/ui/components/space-settings-dialog/share-card"
import {
	SpaceFields,
	type SpaceFieldsValue,
} from "@workspace/ui/components/space-settings-dialog/space-fields"
import { Button } from "@workspace/ui/components/ui/button"

const SPACE_ENTRY = "space"

const MEMBERS_ENTRY = "members"

const COMPANIONS_ENTRY = "companions"

const APPLICATIONS_ENTRY = "mcp"

type Hosting = Omit<ShareCardProps, "name">

type NoHosting = { [Key in keyof Hosting]?: never }

type SpaceCompanions = Omit<CompanionsSectionProps, "spaceName">

type LocalSpace = {
	host?: never
	onLeave?: never
	onDelete: () => void
	isDeletable?: boolean
	onExport?: () => void
	onImport?: () => void
}

type JoinedSpace = {
	host: string
	onLeave: () => void
	onDelete?: never
	isDeletable?: never
	onExport?: never
	onImport?: never
}

type SpaceSettingsProps = PluginSessionsProps & {
	value: SpaceSettingsValue
	onValueChange: (value: SpaceSettingsValue) => void
	environment: EnvironmentEntry[]
	isEnvironmentPending?: boolean
	hasEnvironmentFailedToRead?: boolean
	onEnvironmentSet: (write: EnvironmentWrite) => void | Promise<void>
	onEnvironmentDelete: (name: string) => void | Promise<void>
	history: PluginHistory
	members?: ReactNode
	companions?: SpaceCompanions
} & (LocalSpace | JoinedSpace) &
	(Hosting | NoHosting)

type SpaceSettingsOptions = SpaceSettingsProps & {
	isOpen: boolean
	editorLayout?: McpServerEditorLayout
}

const useSpaceSettings = ({
	isOpen,
	editorLayout,
	value,
	onValueChange,
	environment,
	isEnvironmentPending,
	hasEnvironmentFailedToRead,
	onEnvironmentSet,
	onEnvironmentDelete,
	history,
	onDelete,
	isDeletable = true,
	onExport,
	onImport,
	host,
	onLeave,
	members,
	companions,
	hosting,
	onHost,
	onStopHosting,
	onSignIn,
	...sessionProps
}: SpaceSettingsOptions) => {
	const { t } = useTranslation("settings")
	const { t: tCommon } = useTranslation("common")
	const name = value.name.trim() || t("space.untitled")
	const { pages, sessions } = usePluginSessions({
		...sessionProps,
		owner: { kind: "space", name },
		isSettingsOpen: isOpen,
		history,
		historyCompanionName: t("plugin.author.bot"),
		editorLayout,
	})

	const transfer =
		onExport || onImport ? (
			<div className="flex flex-wrap gap-2" data-slot="space-transfer">
				{onExport ? (
					<Button onClick={onExport} size="sm" variant="outline">
						{t("space.transfer.export")}
					</Button>
				) : null}
				{onImport ? (
					<Button onClick={onImport} size="sm" variant="outline">
						{t("space.transfer.import")}
					</Button>
				) : null}
			</div>
		) : null

	const describeSpace = ({ name, hue }: SpaceFieldsValue) =>
		onValueChange({ name, colour: hue })

	const spacePanel =
		host === undefined ? (
			<>
				<SpaceFields
					onValueChange={describeSpace}
					value={{ name: value.name, hue: value.colour ?? null }}
				/>
				{transfer}
			</>
		) : (
			<JoinedSpaceFields host={host} value={value} />
		)

	const membersEntry: SettingsEntry[] =
		members === undefined
			? []
			: [
					{
						value: MEMBERS_ENTRY,
						icon: "Users",
						label: t("rail.members"),
						layout: "scrolling",
						panel: (
							<div className="flex flex-1 flex-col gap-6">
								{hosting === undefined ? null : (
									<ShareCard
										hosting={hosting}
										name={name}
										onHost={onHost}
										onSignIn={onSignIn}
										onStopHosting={onStopHosting}
									/>
								)}
								{members}
							</div>
						),
					},
				]

	const companionsEntry: SettingsEntry[] =
		companions === undefined
			? []
			: [
					{
						value: COMPANIONS_ENTRY,
						icon: "Companions",
						label: t("rail.agents"),
						layout: "scrolling",
						count: companions.companions.length,
						panel: <CompanionsSection {...companions} spaceName={name} />,
					},
				]

	const dangerPanel =
		host === undefined ? (
			<DangerZone
				confirmTitle={t("space.danger.confirm.title", { name })}
				actionLabel={t("space.danger.delete")}
				description={t("space.danger.description")}
				disabledReason={isDeletable ? undefined : t("space.danger.last")}
				onConfirm={onDelete}
			/>
		) : (
			<DangerZone
				confirmTitle={tCommon("spaces.leave.title", { name })}
				actionLabel={tCommon("spaces.leave.action")}
				description={tCommon("spaces.leave.description")}
				icon="Leave"
				onConfirm={onLeave}
			/>
		)

	const entries: SettingsEntry[] = [
		{
			value: SPACE_ENTRY,
			icon: "Folder",
			label: t("rail.space"),
			layout: "scrolling",
			panel: spacePanel,
		},
		...membersEntry,
		...companionsEntry,
		{
			value: "environment",
			icon: "Json",
			label: t("rail.secrets"),
			layout: "fixed",
			panel: (
				<EnvironmentPanel
					entries={environment}
					hasFailedToRead={hasEnvironmentFailedToRead}
					isPending={isEnvironmentPending}
					onDelete={onEnvironmentDelete}
					onSet={onEnvironmentSet}
					scope="space"
				/>
			),
		},
		{
			value: "skills",
			icon: "Skill",
			label: t("rail.skills"),
			layout: "fixed",
			panel: sessions.skills.panel,
		},
		{
			value: APPLICATIONS_ENTRY,
			icon: "Server",
			label: t("rail.applications"),
			layout: "fixed",
			panel: sessions.applications.panel,
		},
		{
			value: HISTORY_TAB,
			icon: "History",
			label: t("rail.history"),
			layout: "flush",
			panel: sessions.history.panel,
		},
		{
			value: "danger",
			icon: "Alert",
			label: t("rail.danger"),
			layout: "scrolling",
			isDanger: true,
			panel: dangerPanel,
		},
	]

	return { name, pages, sessions, entries, transfer }
}

export {
	APPLICATIONS_ENTRY,
	COMPANIONS_ENTRY,
	SPACE_ENTRY,
	type SpaceSettingsProps,
	useSpaceSettings,
}
