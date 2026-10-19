import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { UserSettingsDialog } from "@workspace/ui/components/user-settings-dialog"
import type { AboutFieldsProps } from "@workspace/ui/components/user-settings-dialog/about-fields"

import { signOutLeavingOf, useAccount } from "@/lib/account/use-account"
import { openedServerScope } from "@/lib/applications/application-settings"
import { useYourDevices } from "@/lib/devices/use-your-devices"
import { isRelaySpace } from "@/lib/spaces/joined-spaces-controller"
import { diagnosticsActions } from "@/lib/user/diagnostics-actions"
import { toNotificationChange } from "@/lib/user/user-settings"
import type { ApplicationScopes } from "@/lib/workspace/use-application-scopes"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"
import { USER_OWNER } from "@/lib/workspace/user-owner"

type UserSettingsHostProps = {
	about: AboutFieldsProps | undefined
	core: WorkspaceCore
	overlay: WorkspaceOverlay
	panels: SettingsPanels
	scopes: ApplicationScopes
}

export const UserSettingsHost = ({
	about,
	core,
	overlay,
	panels,
	scopes,
}: UserSettingsHostProps) => {
	const {
		account: watchedAccount,
		joinedSpaces,
		preferences,
		user,
		userMcpServers,
	} = core
	const { userSettings } = overlay
	const { applicationToOpenOn, closeSettingsTab, personSkills, userHistory } =
		panels
	const {
		serverEnvironmentSection,
		setOpenedMcpServer,
		settingsTab,
		userApplications,
	} = scopes
	const { panel: accountPanel, signOutConfirmation } = useAccount(
		watchedAccount,
		userSettings.name,
		signOutLeavingOf(
			joinedSpaces.state.joinedSpaces.filter(isRelaySpace),
			joinedSpaces.controller.hostNameOf,
		),
	)

	const devices = useYourDevices(watchedAccount.state, {
		isShown: user.state.isSettingsOpen,
	})

	return (
		<>
			<UserSettingsDialog
				about={about}
				account={{ ...accountPanel, devices }}
				applications={{
					servers: userApplications.mcpServers,
					haveFailedToLoad: userMcpServers.hasFailedToLoad,
					onServerCreate: userApplications.onMcpServerCreate,
					onServerChange: userApplications.onMcpServerChange,
					onServerDelete: userApplications.onMcpServerDelete,
					onServerConnect: userApplications.onServerConnect,
					onServerOpen: (name) =>
						setOpenedMcpServer(openedServerScope(name, USER_OWNER)),
					serverConnection: userApplications.serverConnection,
					serverEnvironment: serverEnvironmentSection,
					catalogue: userApplications.mcpCatalogue,
					serverToOpen: applicationToOpenOn({ kind: "user" }),
				}}
				diagnostics={diagnosticsActions}
				history={userHistory}
				tab={settingsTab}
				onClose={() => {
					closeSettingsTab()
					user.controller.setSettingsOpen(false)
				}}
				language={preferences.language}
				onLanguageChange={(next) => {
					void user.controller.setLanguage(next)
				}}
				onValueChange={(value) => {
					if (value.colorScheme !== userSettings.colorScheme) {
						void user.controller.setColorScheme(value.colorScheme)
					}
					const notification = toNotificationChange(value, userSettings)
					if (notification) {
						void user.controller.setNotification(notification)
					}
				}}
				open={user.state.isSettingsOpen}
				{...personSkills}
				value={userSettings}
			/>
			{signOutConfirmation ? <ConfirmDialog {...signOutConfirmation} /> : null}
		</>
	)
}
