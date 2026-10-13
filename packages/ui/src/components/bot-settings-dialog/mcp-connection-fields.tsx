"use client"

import { useTranslation } from "react-i18next"

import {
	type BotMcpServerDraft,
	type BotMcpServerFields,
	MCP_ENDPOINT_KINDS,
	MCP_TRANSPORTS,
	readMcpEndpointKind,
} from "@workspace/ui/components/bot-settings"
import { UnreadableConfigNotice } from "@workspace/ui/components/bot-settings-dialog/mcp-editor-notice"
import { SettingsField } from "@workspace/ui/components/settings-field"
import { SettingsSelect } from "@workspace/ui/components/settings-select"

type McpConnectionFieldsProps = {
	name: string
	nameError?: string
	transport: BotMcpServerDraft["transport"]
	isReadable: boolean
	endpointType: string
	shown: (field: keyof BotMcpServerFields) => string
	onAnswer: (field: keyof BotMcpServerFields, value: string) => void
	onRename: (value: string) => void
	onTransportChange: (value: string) => void
}

const McpConnectionFields = ({
	name,
	nameError,
	transport,
	isReadable,
	endpointType,
	shown,
	onAnswer,
	onRename,
	onTransportChange,
}: McpConnectionFieldsProps) => {
	const { t } = useTranslation("bots")

	const transportOptions = MCP_TRANSPORTS.map((option) => ({
		label: t(`applications.transport.option.${option}`),
		value: option,
	}))

	const endpointOptions = MCP_ENDPOINT_KINDS.map((kind) => ({
		label: t(`applications.endpoint.option.${kind}`),
		value: kind,
	}))

	return (
		<>
			<SettingsField
				error={nameError}
				hint={t("applications.name.hint")}
				label={t("applications.name.label")}
				onValueChange={onRename}
				placeholder={t("applications.name.placeholder")}
				value={name}
			/>
			<SettingsSelect
				hint={t("applications.transport.hint")}
				label={t("applications.transport.label")}
				onValueChange={onTransportChange}
				options={transportOptions}
				value={transport}
			/>
			{isReadable ? null : <UnreadableConfigNotice />}
			{isReadable && transport === "local" ? (
				<>
					<SettingsField
						hint={t("applications.command.hint")}
						label={t("applications.command.label")}
						onValueChange={(value) => onAnswer("command", value)}
						placeholder={t("applications.command.placeholder")}
						value={shown("command")}
					/>
					<SettingsField
						hint={t("applications.args.hint")}
						label={t("applications.args.label")}
						onValueChange={(value) => onAnswer("args", value)}
						placeholder={t("applications.args.placeholder")}
						rows={4}
						value={shown("args")}
					/>
				</>
			) : null}
			{isReadable && transport === "remote" ? (
				<>
					<SettingsField
						hint={t("applications.url.hint")}
						label={t("applications.url.label")}
						kind="url"
						onValueChange={(value) => onAnswer("url", value)}
						placeholder={t("applications.url.placeholder")}
						value={shown("url")}
					/>
					<SettingsSelect
						hint={t("applications.endpoint.hint")}
						label={t("applications.endpoint.label")}
						onValueChange={(value) => onAnswer("type", value)}
						options={endpointOptions}
						value={readMcpEndpointKind(endpointType)}
					/>
					<SettingsField
						hint={t("applications.headers.hint")}
						label={t("applications.headers.label")}
						onValueChange={(value) => onAnswer("headers", value)}
						placeholder={t("applications.headers.placeholder")}
						rows={4}
						value={shown("headers")}
					/>
				</>
			) : null}
		</>
	)
}

export { McpConnectionFields }
