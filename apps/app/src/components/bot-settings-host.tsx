import { readBotOutputStyle } from "@workspace/ui/components/bot-settings"
import { BotSettingsDialog } from "@workspace/ui/components/bot-settings-dialog"

import {
	changesRuntime,
	modelOptionsFor,
	toSettingsValue,
} from "@/lib/bots/bot-settings"
import { toEnvironmentRows } from "@/lib/environment/environment-rows"
import type { ApplicationScopes } from "@/lib/workspace/use-application-scopes"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterView } from "@/lib/workspace/use-roster-view"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"

type BotSettingsHostProps = {
	core: WorkspaceCore
	panels: SettingsPanels
	rosterLines: RosterLines
	rosterView: RosterView
	scopes: ApplicationScopes
}

export const BotSettingsHost = ({
	core,
	panels,
	rosterLines,
	rosterView,
	scopes,
}: BotSettingsHostProps) => {
	const { botEnvironment, botMcpServers, catalogue, chat, roster } = core
	const { applicationToOpenOn, botHistory, closeSettingsTab, companionSkills } =
		panels
	const { activity, deleteBot } = rosterLines
	const { isEditing, isShowingDanger, settingsBot } = rosterView
	const {
		botApplications,
		selectedSpaceId,
		serverEnvironmentSection,
		setOpenedMcpServer,
		settingsTab,
	} = scopes

	return settingsBot ? (
		<BotSettingsDialog
			history={botHistory}
			haveMcpServersFailedToLoad={botMcpServers.state.hasFailedToLoad}
			{...botApplications}
			mcpServerToOpen={applicationToOpenOn({
				kind: "companion",
				id: settingsBot.id,
			})}
			tab={settingsTab}
			environment={toEnvironmentRows(botEnvironment.entries)}
			hasEnvironmentFailedToRead={botEnvironment.hasFailedToRead}
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
			onClose={() => {
				closeSettingsTab()
				roster.controller.setEditing(false)
			}}
			onDelete={() => {
				void deleteBot(settingsBot.id)
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
			open={isEditing}
			seed={settingsBot.id}
			{...companionSkills}
			showDanger={isShowingDanger}
			value={toSettingsValue(settingsBot)}
			working={activity.isWorking}
			workingKind={activity.kind}
		/>
	) : null
}
