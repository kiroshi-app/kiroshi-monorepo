import { readBotOutputStyle } from "@workspace/ui/components/bot-settings"
import { CompanionSettingsScreen } from "@workspace/ui/components/settings-screen"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	changesRuntime,
	modelOptionsFor,
	toSettingsValue,
} from "@/lib/bots/bot-settings"
import { toEnvironmentRows } from "@/lib/environment/environment-rows"
import { failureReporterIn } from "@/lib/failure-report"
import type { CompanionSettingsSearch } from "@/lib/navigation/settings-search"
import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import type { SettingsFrame } from "@/lib/workspace/settings-frame"
import type { ApplicationScopes } from "@/lib/workspace/use-application-scopes"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterView } from "@/lib/workspace/use-roster-view"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"

const GENERAL_ENTRY = "general"

const reportFailure = failureReporterIn("companion-screen-host")

type CompanionScreenHostProps = {
	core: WorkspaceCore
	frame: SettingsFrame
	navigation: SettingsNavigation
	panels: SettingsPanels
	rosterLines: RosterLines
	rosterView: RosterView
	scopes: ApplicationScopes
	search: CompanionSettingsSearch
}

export const CompanionScreenHost = ({
	core,
	frame,
	navigation,
	panels,
	rosterLines,
	rosterView,
	scopes,
	search,
}: CompanionScreenHostProps) => {
	const { botEnvironment, botMcpServers, catalogue, chat, roster } = core
	const { botHistory, companionSkills } = panels
	const { activity, deleteBot } = rosterLines
	const { settingsBot } = rosterView
	const {
		botApplications,
		selectedSpaceId,
		serverEnvironmentSection,
		setOpenedMcpServer,
	} = scopes

	if (!settingsBot) {
		return null
	}

	const refuseDeletion = () => {
		void reportFailure(
			{ title: i18n.t("bots:danger.failed") },
			{ botId: settingsBot.id },
		)
	}

	return (
		<CompanionSettingsScreen
			{...frame}
			backLabel={
				search.isFromSpaceSettings
					? i18n.t("settings:screen.backToCompanions")
					: undefined
			}
			entry={search.entry ?? GENERAL_ENTRY}
			onBack={navigation.back}
			onEntryChange={navigation.showEntry}
			onOpenApplication={navigation.openApplication}
			history={botHistory}
			haveMcpServersFailedToLoad={botMcpServers.hasFailedToLoad}
			{...botApplications}
			mcpServerToOpen={search.application}
			environment={toEnvironmentRows(botEnvironment.entries)}
			hasEnvironmentFailedToRead={botEnvironment.hasFailedToRead}
			isEnvironmentPending={botEnvironment.isPending}
			onEnvironmentSet={({ name, value }) => botEnvironment.set(name, value)}
			onEnvironmentDelete={botEnvironment.remove}
			onMcpServerOpen={(name) => {
				setOpenedMcpServer(
					name && selectedSpaceId
						? {
								kind: "server",
								name,
								owner: {
									kind: "bot",
									id: settingsBot.id,
									spaceId: selectedSpaceId,
								},
							}
						: null,
				)
				navigation.showApplication(name)
			}}
			serverEnvironment={serverEnvironmentSection}
			models={modelOptionsFor(settingsBot.model, catalogue.models)}
			outputStyle={readBotOutputStyle(settingsBot.outputStyle)}
			memory={settingsBot.memory}
			onMemoryChange={(memory) => {
				void roster.controller.remember(settingsBot.id, memory)
			}}
			onAvatarUpload={(file) => {
				void roster.controller.uploadAvatar(settingsBot.id, file)
			}}
			onDelete={() => {
				void deleteBot(settingsBot.id).then(navigation.back, refuseDeletion)
			}}
			onOutputStyleChange={(outputStyle) => {
				if (outputStyle === settingsBot.outputStyle) {
					return
				}
				roster.controller.restyle(settingsBot.id, outputStyle)
				chat.controller.redescribe(settingsBot.id)
			}}
			onValueChange={(value) => {
				roster.controller.describe(settingsBot.id, value)
				if (changesRuntime(settingsBot, value)) {
					chat.controller.redescribe(settingsBot.id)
				}
			}}
			seed={settingsBot.id}
			{...companionSkills}
			value={toSettingsValue(settingsBot)}
			working={activity.isWorking}
			workingKind={activity.kind}
		/>
	)
}
