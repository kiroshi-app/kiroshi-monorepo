"use client"

import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

import type { BotMcpServerDraft } from "@workspace/ui/components/bot-settings"
import { McpAuthorization } from "@workspace/ui/components/bot-settings-dialog/mcp-authorization"
import type { McpConnectionSection } from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import { McpConnectionFields } from "@workspace/ui/components/bot-settings-dialog/mcp-connection-fields"
import {
	EditorNotice,
	UnreadableConfigNotice,
} from "@workspace/ui/components/bot-settings-dialog/mcp-editor-notice"
import {
	McpServerEditorHeader,
	type McpServerEditorLayout,
} from "@workspace/ui/components/bot-settings-dialog/mcp-server-editor-header"
import { McpServerLaunch } from "@workspace/ui/components/bot-settings-dialog/mcp-server-launch"
import {
	FIRST_SECTION,
	useMcpServerDraft,
} from "@workspace/ui/components/bot-settings-dialog/use-mcp-server-draft"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import {
	EnvironmentPanel,
	type EnvironmentSection,
} from "@workspace/ui/components/environment-panel"
import { Icons } from "@workspace/ui/components/icons"
import { SettingsField } from "@workspace/ui/components/settings-field"
import { SettingsPushedPage } from "@workspace/ui/components/settings-pushed-page"
import {
	SettingsRailItem,
	SettingsScrollingPanel,
} from "@workspace/ui/components/settings-rail"
import { cn } from "@workspace/ui/lib/utils"

type McpServerEditorSectionProps = {
	title: string
	children: ReactNode
}

const McpServerEditorSection = ({
	title,
	children,
}: McpServerEditorSectionProps) => (
	<section className="flex min-w-0 flex-col gap-4">
		<h3 className="font-medium text-foreground text-sm">{title}</h3>
		{children}
	</section>
)

type McpServerEditorProps = {
	draft: BotMcpServerDraft
	onDraftChange: (draft: BotMcpServerDraft) => void
	saved?: BotMcpServerDraft
	onBack: () => void
	onSave: (config: Record<string, unknown>) => unknown
	onDelete?: () => void
	connection?: McpConnectionSection
	environment?: EnvironmentSection
	mark?: string
	displayName?: string
	defaultSection?: string
	defaultConfirming?: boolean
	defaultDisconnecting?: boolean
	defaultLeaving?: boolean
	layout?: McpServerEditorLayout
	className?: string
}

const McpServerEditor = ({
	draft,
	onDraftChange,
	saved,
	onBack,
	onSave,
	onDelete,
	connection,
	environment,
	mark,
	displayName,
	defaultSection,
	defaultConfirming,
	defaultDisconnecting,
	defaultLeaving,
	layout = "dialog",
	className,
}: McpServerEditorProps) => {
	const { t } = useTranslation("bots")
	const [isLeaving, setLeaving] = useState(Boolean(defaultLeaving))
	const form = useMcpServerDraft({
		draft,
		onDraftChange,
		saved,
		onSave,
		defaultSection,
	})

	const name = displayName ?? (draft.name.trim() || t("applications.untitled"))
	const isWritten = Boolean(saved)

	const leave = () => (form.isUnsaved ? setLeaving(true) : onBack())

	const header = (
		<McpServerEditorHeader
			defaultConfirming={defaultConfirming}
			isNameMonospace={!displayName}
			isPending={form.isPending}
			isUnsaved={form.isUnsaved}
			isWritten={isWritten}
			layout={layout}
			mark={mark}
			name={name}
			onDelete={onDelete}
			onSave={form.save}
			subtitle={
				connection
					? t(`applications.connection.state.${connection.state}`)
					: undefined
			}
		/>
	)

	const connectionSection = (
		<>
			{connection ? (
				<McpAuthorization
					{...connection}
					defaultDisconnecting={defaultDisconnecting}
					isSaved={isWritten}
					name={name}
				/>
			) : null}
			<EditorNotice icon={Icons.Alert} text={t("applications.notice")} />
			<McpConnectionFields
				endpointType={form.fields.type}
				isReadable={Boolean(form.config)}
				name={draft.name}
				nameError={
					form.isNameRefused ? t("applications.name.blank") : undefined
				}
				onAnswer={form.answer}
				onRename={form.rename}
				onTransportChange={form.pickTransport}
				shown={form.shown}
				transport={draft.transport}
			/>
		</>
	)

	const secretsSection = (
		<>
			{form.config ? (
				<SettingsField
					hint={t("applications.secrets.hint")}
					label={t("applications.secrets.label")}
					onValueChange={(value) => form.answer("environment", value)}
					placeholder={t("applications.secrets.placeholder")}
					rows={8}
					value={form.shown("environment")}
				/>
			) : (
				<UnreadableConfigNotice />
			)}
			{environment ? (
				<EnvironmentPanel {...environment} scope="server" />
			) : null}
		</>
	)

	const advancedSection = (
		<>
			<SettingsField
				error={form.config ? undefined : t("applications.config.invalid")}
				hint={t("applications.config.hint")}
				label={t("applications.config.label")}
				onValueChange={form.editConfig}
				placeholder={t("applications.config.placeholder")}
				rows={10}
				value={draft.config}
			/>
			{form.config ? <McpServerLaunch config={form.config} /> : null}
		</>
	)

	if (layout === "page") {
		return (
			<div
				className={cn("flex min-w-0 flex-col gap-8", className)}
				data-slot="mcp-server-editor-page"
				ref={form.root}
			>
				{header}
				<McpServerEditorSection title={t("applications.section.connection")}>
					{connectionSection}
				</McpServerEditorSection>
				<McpServerEditorSection title={t("applications.section.secrets")}>
					{secretsSection}
				</McpServerEditorSection>
				<McpServerEditorSection title={t("applications.section.advanced")}>
					{advancedSection}
				</McpServerEditorSection>
			</div>
		)
	}

	return (
		<SettingsPushedPage
			backLabel={t("applications.back")}
			className={cn("min-w-0", className)}
			isMeasured
			onBack={leave}
			onValueChange={form.setSection}
			value={form.section}
			rail={(iconsOnly) => (
				<>
					<SettingsRailItem
						icon="Server"
						iconsOnly={iconsOnly}
						label={t("applications.section.connection")}
						value={FIRST_SECTION}
					/>
					<SettingsRailItem
						icon="Shield"
						iconsOnly={iconsOnly}
						label={t("applications.section.secrets")}
						value="environment"
					/>
					<SettingsRailItem
						icon="Json"
						iconsOnly={iconsOnly}
						label={t("applications.section.advanced")}
						value="advanced"
					/>
				</>
			)}
		>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col" ref={form.root}>
				{header}

				<SettingsScrollingPanel value={FIRST_SECTION}>
					{connectionSection}
				</SettingsScrollingPanel>

				<SettingsScrollingPanel value="environment">
					{secretsSection}
				</SettingsScrollingPanel>

				<SettingsScrollingPanel value="advanced">
					{advancedSection}
				</SettingsScrollingPanel>
			</div>

			<ConfirmDialog
				confirmLabel={t("applications.leave.action")}
				description={t("applications.leave.description")}
				onConfirm={onBack}
				onOpenChange={setLeaving}
				open={isLeaving}
				title={t("applications.leave.title")}
			/>
		</SettingsPushedPage>
	)
}

export { McpServerEditor, type McpServerEditorProps }
