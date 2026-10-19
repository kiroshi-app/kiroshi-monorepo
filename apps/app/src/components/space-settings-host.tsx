import type { EnvironmentWrite } from "@workspace/ui/components/environment-panel"
import type { SpaceSettingsValue } from "@workspace/ui/components/space-settings"
import { SpaceSettingsDialog } from "@workspace/ui/components/space-settings-dialog"
import {
	MembersPanel,
	type MembersPanelProps,
} from "@workspace/ui/components/space-settings-dialog/members-panel"

import { signedInAccountIdOf } from "@/lib/account/use-account"
import { toEnvironmentRows } from "@/lib/environment/environment-rows"
import { useHosting } from "@/lib/host/use-hosting"
import { useMembers } from "@/lib/host/use-members"
import { openJoinedSpaceOf } from "@/lib/spaces/joined-spaces-controller"
import { toSpaceSettingsValue } from "@/lib/spaces/space-settings"
import type { ApplicationScopes } from "@/lib/workspace/use-application-scopes"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"

const SPACE_TAB = "space"

type MemberView = Pick<MembersPanelProps, "viewerId" | "blockedBy">

const memberViewOf = (
	isHostOffline: boolean,
	viewerId: string | null,
): MemberView => ({
	viewerId: viewerId ?? undefined,
	blockedBy: isHostOffline ? "hostOffline" : undefined,
})

type SpaceSettingsHostProps = {
	core: WorkspaceCore
	panels: SettingsPanels
	scopes: ApplicationScopes
}

export const SpaceSettingsHost = ({
	core,
	panels,
	scopes,
}: SpaceSettingsHostProps) => {
	const { account, joinedSpaces, spaceEnvironment, spaceMcpServers, spaces } =
		core
	const {
		applicationToOpenOn,
		closeSettingsTab,
		openAccountSettings,
		spaceHistory,
		spaceSkills,
	} = panels
	const {
		isSpaceEditing,
		selectedSpace,
		selectedSpaceId,
		serverEnvironmentSection,
		setOpenedMcpServer,
		setSettingsTab,
		settingsTab,
		spaceApplications,
	} = scopes
	const editedSpace =
		isSpaceEditing && selectedSpace
			? { id: selectedSpace.id, name: selectedSpace.name }
			: null
	const joinedSpace = openJoinedSpaceOf(
		joinedSpaces.state.joinedSpaces,
		joinedSpaces.state.openId,
		selectedSpaceId,
	)
	const editedJoinedSpace =
		isSpaceEditing && joinedSpace && selectedSpaceId
			? { id: selectedSpaceId, name: joinedSpace.name }
			: null
	const hosting = useHosting(editedSpace)
	const isHosted = hosting?.hosting === "online" || editedJoinedSpace !== null
	const isHostOffline = joinedSpace?.state === "waitingForHost"
	const members = useMembers(editedSpace ?? editedJoinedSpace, isHosted, {
		joinedId: editedJoinedSpace ? joinedSpace?.id : undefined,
		isHostOffline,
		isSignedOut:
			account.state !== undefined &&
			signedInAccountIdOf(account.state) === null,
	})

	if (!selectedSpaceId) {
		return null
	}

	const close = () => {
		closeSettingsTab()
		spaces.controller.setSettingsOpen(false)
	}

	const closeIfDeleted = (spaceId: string) => {
		const isStillHeld = spaces.controller
			.getState()
			.spaces.some((space) => space.id === spaceId)
		if (!isStillHeld) {
			close()
		}
	}

	const signIn = () => {
		close()
		openAccountSettings()
	}

	const hostingProps = hosting ? { ...hosting, onSignIn: signIn } : {}

	const membersPropsOf = (spaceName: string, memberView?: MemberView) =>
		members
			? {
					members: (
						<MembersPanel
							{...members}
							{...memberView}
							isHosted={isHosted}
							space={spaceName}
						/>
					),
				}
			: {}

	const sharedProps = {
		environment: toEnvironmentRows(spaceEnvironment.entries),
		hasEnvironmentFailedToRead: spaceEnvironment.hasFailedToRead,
		isEnvironmentPending: spaceEnvironment.isPending,
		haveMcpServersFailedToLoad: spaceMcpServers.hasFailedToLoad,
		...spaceApplications,
		mcpServerToOpen: applicationToOpenOn({
			kind: "space",
			id: selectedSpaceId,
		}),
		tab: settingsTab ?? SPACE_TAB,
		onTabChange: setSettingsTab,
		onMcpServerOpen: (name: string | null) =>
			setOpenedMcpServer(
				name
					? {
							kind: "server",
							name,
							owner: { kind: "space", id: selectedSpaceId },
						}
					: null,
			),
		serverEnvironment: serverEnvironmentSection,
		history: spaceHistory,
		onClose: close,
		onEnvironmentDelete: spaceEnvironment.remove,
		onEnvironmentSet: ({ name, value }: EnvironmentWrite) =>
			spaceEnvironment.set(name, value),
		onValueChange: (value: SpaceSettingsValue) =>
			spaces.controller.describe(selectedSpaceId, value),
		open: isSpaceEditing,
		...spaceSkills,
	}

	if (selectedSpace) {
		return (
			<SpaceSettingsDialog
				{...sharedProps}
				{...hostingProps}
				{...membersPropsOf(selectedSpace.name)}
				isDeletable={spaces.state.spaces.length > 1}
				onDelete={() => {
					void spaces.controller
						.remove(selectedSpace.id)
						.then(() => closeIfDeleted(selectedSpace.id))
				}}
				onExport={() => {
					void spaces.controller.exportSpace(selectedSpace.id)
				}}
				onImport={() => {
					void spaces.controller.importSpace()
				}}
				value={toSpaceSettingsValue(selectedSpace)}
			/>
		)
	}

	return joinedSpace ? (
		<SpaceSettingsDialog
			{...sharedProps}
			{...membersPropsOf(
				joinedSpace.name,
				memberViewOf(isHostOffline, signedInAccountIdOf(account.state)),
			)}
			host={joinedSpace.hostUrl}
			onLeave={() => joinedSpaces.controller.leave(joinedSpace.id).then(close)}
			value={{ name: joinedSpace.name }}
		/>
	) : null
}
