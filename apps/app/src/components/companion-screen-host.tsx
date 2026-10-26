import type { ReactNode } from "react"

import { readBotOutputStyle } from "@workspace/ui/components/bot-settings"
import {
	CompanionSettingsScreen,
	type SettingsScreenRequestLeave,
} from "@workspace/ui/components/settings-screen"
import { COMPANIONS_ENTRY } from "@workspace/ui/components/space-settings-dialog/use-space-settings"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	changesRuntime,
	modelOptionsFor,
	toSettingsValue,
} from "@/lib/bots/bot-settings"
import { toEnvironmentRows } from "@/lib/environment/environment-rows"
import { failureReporterIn } from "@/lib/failure-report"
import type { ApplicationScopes } from "@/lib/workspace/use-application-scopes"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterView } from "@/lib/workspace/use-roster-view"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"

const GENERAL_ENTRY = "general"

const DANGER_ENTRY = "danger"

const reportFailure = failureReporterIn("companion-screen-host")

type CompanionScreenHostProps = {
	core: WorkspaceCore
	panels: SettingsPanels
	rail: (requestLeave: SettingsScreenRequestLeave) => ReactNode
	rosterLines: RosterLines
	rosterView: RosterView
	scopes: ApplicationScopes
}

export const CompanionScreenHost = ({
	core,
	panels,
	rail,
	rosterLines,
	rosterView,
	scopes,
}: CompanionScreenHostProps) => {
	const { botEnvironment, botMcpServers, catalogue, chat, roster } = core
	const { applicationToOpenOn, botHistory, closeSettings, companionSkills } =
		panels
	const { activity, deleteBot } = rosterLines
	const { isShowingDanger, settingsBot } = rosterView
	const {
		botApplications,
		isSpaceEditing,
		selectedSpaceId,
		serverEnvironmentSection,
		setOpenedMcpServer,
		setSettingsApplication,
		setSettingsTab,
		settingsTab,
	} = scopes

	if (!settingsBot) {
		return null
	}

	const backToCompanions = () => {
		roster.controller.setEditing(false)
		setSettingsApplication(undefined)
		setSettingsTab(COMPANIONS_ENTRY)
	}

	const leave = isSpaceEditing ? backToCompanions : closeSettings

	const refuseDeletion = () => {
		void reportFailure(
			{ title: i18n.t("bots:spaces.remove.failed") },
			{ botId: settingsBot.id },
		)
	}

	const showEntry = (entry: string) => {
		if (isShowingDanger) {
			roster.controller.edit(settingsBot.id)
		}
		setSettingsTab(entry)
	}

	return (
		<CompanionSettingsScreen
			backLabel={
				isSpaceEditing ? i18n.t("settings:screen.backToCompanions") : undefined
			}
			entry={isShowingDanger ? DANGER_ENTRY : (settingsTab ?? GENERAL_ENTRY)}
			onBack={leave}
			onEntryChange={showEntry}
			rail={rail}
			history={botHistory}
			haveMcpServersFailedToLoad={botMcpServers.hasFailedToLoad}
			{...botApplications}
			mcpServerToOpen={applicationToOpenOn({
				kind: "companion",
				id: settingsBot.id,
			})}
			environment={toEnvironmentRows(botEnvironment.entries)}
			hasEnvironmentFailedToRead={botEnvironment.hasFailedToRead}
			isEnvironmentPending={botEnvironment.isPending}
			onEnvironmentSet={({ name, value }) => botEnvironment.set(name, value)}
			onEnvironmentDelete={botEnvironment.remove}
			onMcpServerOpen={(name) =>
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
			}
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
				void deleteBot(settingsBot.id).then(leave, refuseDeletion)
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
