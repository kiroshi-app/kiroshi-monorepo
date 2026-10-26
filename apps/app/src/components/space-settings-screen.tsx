import type { ReactNode } from "react"

import type { EnvironmentWrite } from "@workspace/ui/components/environment-panel"
import {
	SettingsScreen,
	type SettingsScreenRequestLeave,
} from "@workspace/ui/components/settings-screen"
import type { SpaceSettingsValue } from "@workspace/ui/components/space-settings"
import {
	MembersPanel,
	type MembersPanelProps,
} from "@workspace/ui/components/space-settings-dialog/members-panel"
import {
	COMPANIONS_ENTRY,
	SPACE_ENTRY,
} from "@workspace/ui/components/space-settings-dialog/use-space-settings"

import { signedInAccountIdOf } from "@/lib/account/use-account"
import { toCompanionSummary } from "@/lib/bots/bot-settings"
import { useCompanionCounts } from "@/lib/bots/use-companion-counts"
import { toEnvironmentRows } from "@/lib/environment/environment-rows"
import { useHosting } from "@/lib/host/use-hosting"
import { useMembers } from "@/lib/host/use-members"
import { openJoinedSpaceOf } from "@/lib/spaces/joined-spaces-controller"
import { toSpaceSettingsValue } from "@/lib/spaces/space-settings"
import type { ApplicationScopes } from "@/lib/workspace/use-application-scopes"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterView } from "@/lib/workspace/use-roster-view"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"

type MemberView = Pick<MembersPanelProps, "viewerId" | "blockedBy">

const memberViewOf = (
	isHostOffline: boolean,
	viewerId: string | null,
): MemberView => ({
	viewerId: viewerId ?? undefined,
	blockedBy: isHostOffline ? "hostOffline" : undefined,
})

type SpaceSettingsScreenProps = {
	core: WorkspaceCore
	panels: SettingsPanels
	rail: (requestLeave: SettingsScreenRequestLeave) => ReactNode
	rosterLines: RosterLines
	rosterView: RosterView
	scopes: ApplicationScopes
}

export const SpaceSettingsScreen = ({
	core,
	panels,
	rail,
	rosterLines,
	rosterView,
	scopes,
}: SpaceSettingsScreenProps) => {
	const {
		account,
		joinedSpaces,
		roster,
		spaceEnvironment,
		spaceMcpServers,
		spaces,
	} = core
	const {
		applicationToOpenOn,
		closeSettings,
		closeSettingsTab,
		openAccountSettings,
		spaceHistory,
		spaceSkills,
	} = panels
	const {
		selectedSpace,
		selectedSpaceId,
		serverEnvironmentSection,
		setOpenedMcpServer,
		setSettingsTab,
		settingsTab,
		spaceApplications,
	} = scopes
	const editedSpace = selectedSpace
		? { id: selectedSpace.id, name: selectedSpace.name }
		: null
	const joinedSpace = openJoinedSpaceOf(
		joinedSpaces.state.joinedSpaces,
		joinedSpaces.state.openId,
		selectedSpaceId,
	)
	const editedJoinedSpace =
		joinedSpace && selectedSpaceId
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
	const countsOf = useCompanionCounts(
		settingsTab === COMPANIONS_ENTRY ? selectedSpace?.id : undefined,
	)

	if (!selectedSpaceId) {
		return null
	}

	const closeIfDeleted = (spaceId: string) => {
		const isStillHeld = spaces.controller
			.getState()
			.spaces.some((space) => space.id === spaceId)
		if (!isStillHeld) {
			closeSettings()
		}
	}

	const signIn = () => {
		closeSettings()
		openAccountSettings()
	}

	const openCompanion = (id: string) => {
		closeSettingsTab()
		roster.controller.edit(id)
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
		target: "space" as const,
		entry: settingsTab ?? SPACE_ENTRY,
		onEntryChange: setSettingsTab,
		onBack: closeSettings,
		rail,
		environment: toEnvironmentRows(spaceEnvironment.entries),
		hasEnvironmentFailedToRead: spaceEnvironment.hasFailedToRead,
		isEnvironmentPending: spaceEnvironment.isPending,
		haveMcpServersFailedToLoad: spaceMcpServers.hasFailedToLoad,
		...spaceApplications,
		mcpServerToOpen: applicationToOpenOn({
			kind: "space",
			id: selectedSpaceId,
		}),
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
		onEnvironmentDelete: spaceEnvironment.remove,
		onEnvironmentSet: ({ name, value }: EnvironmentWrite) =>
			spaceEnvironment.set(name, value),
		onValueChange: (value: SpaceSettingsValue) =>
			spaces.controller.describe(selectedSpaceId, value),
		...spaceSkills,
		companions: {
			companions: rosterView.bots.map((bot) =>
				toCompanionSummary(bot, countsOf(bot.id)),
			),
			onSelect: openCompanion,
			onCreate: rosterLines.sidebarActions.onCreateBot,
		},
	}

	if (selectedSpace) {
		return (
			<SettingsScreen
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
		<SettingsScreen
			{...sharedProps}
			{...membersPropsOf(
				joinedSpace.name,
				memberViewOf(isHostOffline, signedInAccountIdOf(account.state)),
			)}
			host={joinedSpace.hostUrl}
			onLeave={() =>
				joinedSpaces.controller.leave(joinedSpace.id).then(closeSettings)
			}
			value={{ name: joinedSpace.name }}
		/>
	) : null
}
