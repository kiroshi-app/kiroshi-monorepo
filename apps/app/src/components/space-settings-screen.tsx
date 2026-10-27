import type { EnvironmentWrite } from "@workspace/ui/components/environment-panel"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import { SettingsScreen } from "@workspace/ui/components/settings-screen"
import { type Space, spaceAtRank } from "@workspace/ui/components/space"
import type { SpaceSettingsValue } from "@workspace/ui/components/space-settings"
import {
	MembersPanel,
	type MembersPanelProps,
} from "@workspace/ui/components/space-settings-dialog/members-panel"
import {
	COMPANIONS_ENTRY,
	SPACE_ENTRY,
} from "@workspace/ui/components/space-settings-dialog/use-space-settings"
import { useSpaceShortcut } from "@workspace/ui/hooks/use-space-shortcut"

import { signedInAccountIdOf } from "@/lib/account/use-account"
import { openedServerScope } from "@/lib/applications/application-settings"
import type { AccountState, JoinedSpace } from "@/lib/bindings"
import { toCompanionSummary } from "@/lib/bots/bot-settings"
import { useCompanionCounts } from "@/lib/bots/use-companion-counts"
import { toEnvironmentRows } from "@/lib/environment/environment-rows"
import type { HostedSpace } from "@/lib/host/hosting-transport"
import { useHosting } from "@/lib/host/use-hosting"
import { useMembers } from "@/lib/host/use-members"
import type { SettingsSearch } from "@/lib/navigation/settings-search"
import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import type { JoinedSpacesController } from "@/lib/spaces/joined-spaces-controller"
import {
	avatarSeedOfRow,
	type ShownSpacePage,
	spaceRankOf,
} from "@/lib/spaces/settings-spaces"
import { toSpaceSettingsValue } from "@/lib/spaces/space-settings"
import {
	type LeftSpace,
	useLeftSpaceNotice,
} from "@/lib/spaces/use-left-space-notice"
import type { SettingsFrame } from "@/lib/workspace/settings-frame"
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

const editedJoinedSpaceOf = (
	joined: JoinedSpace | undefined,
): HostedSpace | null =>
	joined?.remoteSpaceId ? { id: joined.remoteSpaceId, name: joined.name } : null

const leftSpaceOf = (
	joined: JoinedSpace,
	controller: JoinedSpacesController,
): LeftSpace => ({
	id: joined.id,
	name: joined.name,
	host: joined.hostedBy ?? controller.hostNameOf(joined.id),
})

const isSignedOutOf = (state: AccountState | undefined) =>
	state !== undefined && signedInAccountIdOf(state) === null

type SpaceOpening = {
	switcherSpaces: Space[]
	isEnabled: boolean
	selectSpace: (id: string) => void
	openConversations: () => void
}

const useSpaceOpening = ({
	switcherSpaces,
	isEnabled,
	selectSpace,
	openConversations,
}: SpaceOpening) => {
	const openSpace = (id: string) => {
		selectSpace(id)
		openConversations()
	}

	useSpaceShortcut({
		count: switcherSpaces.length,
		isEnabled,
		onRank: (rank) => {
			const space = spaceAtRank(switcherSpaces, rank)
			if (space) openSpace(space.id)
		},
	})

	return openSpace
}

type SpaceSettingsScreenProps = {
	core: WorkspaceCore
	frame: SettingsFrame
	hostBySpaceId: Record<string, SpaceHost>
	navigation: SettingsNavigation
	page: ShownSpacePage
	panels: SettingsPanels
	rosterLines: RosterLines
	rosterView: RosterView
	scopes: ApplicationScopes
	search: SettingsSearch
	spaceId: string
	switcherSpaces: Space[]
}

export const SpaceSettingsScreen = ({
	core,
	frame,
	hostBySpaceId,
	navigation,
	page,
	panels,
	rosterLines,
	rosterView,
	scopes,
	search,
	spaceId,
	switcherSpaces,
}: SpaceSettingsScreenProps) => {
	const {
		account,
		invitations,
		joinedSpaces,
		spaceEnvironment,
		spaceMcpServers,
		spaceSettingsOwner,
		spaces,
	} = core
	const { openAccountSettings, spaceHistory, spaceSkills } = panels
	const {
		openRowId,
		serverEnvironmentSection,
		setOpenedMcpServer,
		spaceApplications,
	} = scopes
	const isCurrent = spaceId === openRowId
	const ownedSpace = page.state === "yours" ? page.space : undefined
	const joinedSpace = page.state === "joined" ? page.joined : undefined
	const editedSpace = ownedSpace ?? null
	const editedJoinedSpace = editedJoinedSpaceOf(joinedSpace)
	const hosting = useHosting(editedSpace)
	const isHosted = hosting?.hosting === "online" || editedJoinedSpace !== null
	const isHostOffline = joinedSpace?.state === "waitingForHost"
	const members = useMembers(editedSpace ?? editedJoinedSpace, isHosted, {
		joinedId: editedJoinedSpace ? joinedSpace?.id : undefined,
		isHostOffline,
		isSignedOut: isSignedOutOf(account.state),
	})
	const countsOf = useCompanionCounts(
		search.entry === COMPANIONS_ENTRY && isCurrent ? ownedSpace?.id : undefined,
	)
	useLeftSpaceNotice(
		joinedSpaces.controller,
		joinedSpace && leftSpaceOf(joinedSpace, joinedSpaces.controller),
	)

	const openSpace = useSpaceOpening({
		switcherSpaces,
		isEnabled: page.state !== "invitation",
		selectSpace: rosterLines.sidebarActions.onSelectSpace,
		openConversations: navigation.openConversations,
	})

	const openCompanion = (id: string) =>
		navigation.openCompanionSettings(id, { isFromSpaceSettings: true })

	const hostingProps = hosting
		? { ...hosting, onSignIn: openAccountSettings }
		: {}

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

	const openingProps = {
		rank: spaceRankOf(switcherSpaces, spaceId),
		onOpen: () => openSpace(spaceId),
	}

	const sharedProps = {
		...frame,
		target: "space" as const,
		spaceId: avatarSeedOfRow(switcherSpaces, spaceId),
		spaceHost: hostBySpaceId[spaceId],
		entry: search.entry ?? SPACE_ENTRY,
		onEntryChange: navigation.showEntry,
		onOpenApplication: navigation.openApplication,
		onBack: navigation.backToUserSettings,
		environment: toEnvironmentRows(spaceEnvironment.entries),
		hasEnvironmentFailedToRead: spaceEnvironment.hasFailedToRead,
		isEnvironmentPending: spaceEnvironment.isPending,
		haveMcpServersFailedToLoad: spaceMcpServers.hasFailedToLoad,
		...spaceApplications,
		mcpServerToOpen: search.application,
		onMcpServerOpen: (name: string | null) => {
			setOpenedMcpServer(openedServerScope(name, spaceSettingsOwner))
			navigation.showApplication(name)
		},
		serverEnvironment: serverEnvironmentSection,
		history: spaceHistory,
		onEnvironmentDelete: spaceEnvironment.remove,
		onEnvironmentSet: ({ name, value }: EnvironmentWrite) =>
			spaceEnvironment.set(name, value),
		onValueChange: (value: SpaceSettingsValue) =>
			spaces.controller.describe(spaceId, value),
		...spaceSkills,
		companions: {
			companions: isCurrent
				? rosterView.bots.map((bot) =>
						toCompanionSummary(bot, countsOf(bot.id)),
					)
				: [],
			onSelect: openCompanion,
			onCreate: rosterLines.sidebarActions.onCreateBot,
		},
	}

	if (page.state === "invitation") {
		const decline = () => invitations.decline(spaceId)
		return (
			<SettingsScreen
				{...sharedProps}
				spaceState="invitation"
				invitation={page.terms}
				onAccept={() => invitations.accept(spaceId)}
				onDecline={decline}
				onDelete={decline}
				value={{ name: page.name }}
			/>
		)
	}

	if (page.state === "yours") {
		const { space } = page
		return (
			<SettingsScreen
				{...sharedProps}
				{...hostingProps}
				{...membersPropsOf(space.name)}
				{...openingProps}
				spaceState="yours"
				isShared={hostBySpaceId[space.id] === "shared"}
				isDeletable={spaces.state.spaces.length > 1}
				onDelete={() => {
					void spaces.controller.remove(space.id)
				}}
				onExport={() => {
					void spaces.controller.exportSpace(space.id)
				}}
				onImport={() => {
					void spaces.controller.importSpace()
				}}
				value={toSpaceSettingsValue(space)}
			/>
		)
	}

	const { joined } = page
	return (
		<SettingsScreen
			{...sharedProps}
			{...membersPropsOf(
				joined.name,
				memberViewOf(isHostOffline, signedInAccountIdOf(account.state)),
			)}
			{...openingProps}
			spaceState="joined"
			host={joined.hostUrl}
			hostName={joined.hostedBy ?? undefined}
			isConnected={!isHostOffline}
			isSessionUnavailable={!isCurrent}
			onLeave={() => joinedSpaces.controller.leave(joined.id)}
			value={{ name: joined.name, colour: joined.colour }}
		/>
	)
}
