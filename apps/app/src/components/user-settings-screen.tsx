import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { SettingsScreen } from "@workspace/ui/components/settings-screen"
import type { AboutFieldsProps } from "@workspace/ui/components/user-settings-dialog/about-fields"

import { signOutLeavingOf, useAccount } from "@/lib/account/use-account"
import { openedServerScope } from "@/lib/applications/application-settings"
import { useYourDevices } from "@/lib/devices/use-your-devices"
import type { SettingsSearch } from "@/lib/navigation/settings-search"
import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import { isRelaySpace } from "@/lib/spaces/joined-spaces-controller"
import type { SettingsSpaces } from "@/lib/spaces/settings-spaces"
import { diagnosticsActions } from "@/lib/user/diagnostics-actions"
import { toNotificationChange } from "@/lib/user/user-settings"
import type { SettingsFrame } from "@/lib/workspace/settings-frame"
import type { ApplicationScopes } from "@/lib/workspace/use-application-scopes"
import {
	ACCOUNT_TAB,
	type SettingsPanels,
} from "@/lib/workspace/use-settings-panels"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"
import { USER_OWNER } from "@/lib/workspace/user-owner"

type UserSettingsScreenProps = {
	about: AboutFieldsProps | undefined
	core: WorkspaceCore
	frame: SettingsFrame
	navigation: SettingsNavigation
	overlay: WorkspaceOverlay
	panels: SettingsPanels
	scopes: ApplicationScopes
	search: SettingsSearch
	spaces: SettingsSpaces
	currentSpaceId: string | undefined
	onCreateSpace: () => void
}

export const UserSettingsScreen = ({
	about,
	core,
	frame,
	navigation,
	overlay,
	panels,
	scopes,
	search,
	spaces,
	currentSpaceId,
	onCreateSpace,
}: UserSettingsScreenProps) => {
	const {
		account: watchedAccount,
		joinedSpaces,
		preferences,
		user,
		userMcpServers,
	} = core
	const { userSettings } = overlay
	const { personSkills, userHistory } = panels
	const { serverEnvironmentSection, setOpenedMcpServer, userApplications } =
		scopes
	const { panel: accountPanel, signOutConfirmation } = useAccount(
		watchedAccount,
		userSettings.name,
		signOutLeavingOf(
			joinedSpaces.state.joinedSpaces.filter(isRelaySpace),
			joinedSpaces.controller.hostNameOf,
		),
	)

	const devices = useYourDevices(watchedAccount.state, { isShown: true })

	return (
		<>
			<SettingsScreen
				{...frame}
				target="user"
				entry={search.entry ?? ACCOUNT_TAB}
				onEntryChange={navigation.showEntry}
				onOpenApplication={navigation.openApplication}
				onBack={navigation.back}
				{...spaces}
				currentSpaceId={currentSpaceId}
				onOpenSpace={(id, modifiers) =>
					navigation.openSpaceSettings(id, {}, modifiers)
				}
				onCreateSpace={onCreateSpace}
				about={about}
				account={{ ...accountPanel, devices }}
				applications={{
					servers: userApplications.mcpServers,
					haveFailedToLoad: userMcpServers.hasFailedToLoad,
					onServerCreate: userApplications.onMcpServerCreate,
					onServerChange: userApplications.onMcpServerChange,
					onServerDelete: userApplications.onMcpServerDelete,
					onServerConnect: userApplications.onServerConnect,
					onServerOpen: (name) => {
						setOpenedMcpServer(openedServerScope(name, USER_OWNER))
						navigation.showApplication(name)
					},
					serverConnection: userApplications.serverConnection,
					serverEnvironment: serverEnvironmentSection,
					catalogue: userApplications.mcpCatalogue,
					serverToOpen: search.application,
				}}
				diagnostics={diagnosticsActions}
				history={userHistory}
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
				{...personSkills}
				value={userSettings}
			/>
			{signOutConfirmation ? <ConfirmDialog {...signOutConfirmation} /> : null}
		</>
	)
}
