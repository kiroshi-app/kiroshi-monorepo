import { useRouter } from "@tanstack/react-router"
import { useEffect, useMemo } from "react"

import {
	companionSettingsOwnerOf,
	spaceSettingsOwnerOf,
	userSettingsOwnerOf,
} from "./settings-owners"

import { useSignedInAccountId, useWatchedAccount } from "../account/use-account"
import { applicationTransport } from "../applications/application-transport"
import { connectionTransport } from "../applications/connection-transport"
import { useApplications } from "../applications/use-applications"
import { useConnections } from "../applications/use-connections"
import { useMcpServers } from "../bots/use-mcp-servers"
import { useModelCatalogue } from "../bots/use-model-catalogue"
import { useRoster } from "../bots/use-roster"
import { createAttachmentsController } from "../chat/attachments-controller"
import { createAttachmentsPort } from "../chat/attachments-port"
import { createChatDriver } from "../chat/create-driver"
import { createDraftsController } from "../chat/drafts-controller"
import { useChat } from "../chat/use-chat"
import { withSettledSettings } from "../chat/with-settled-settings"
import { createConversationRuntimes } from "../conversations/conversation-runtimes"
import { createTranscriptStore } from "../conversations/create-store"
import { pluginScopeOf } from "../conversations/plugin-scope"
import { createSpokenWords } from "../conversations/spoken-words"
import { useEnvironment } from "../environment/use-environment"
import { createHomeEntries } from "../home/home-entries"
import { createHomePicks } from "../home/home-picks"
import { createHomeVisits } from "../home/home-visits"
import { createOpenedMissionController } from "../missions/opened-mission-controller"
import type { OpenSettings } from "../navigation/open-settings"
import { usePlugin } from "../plugins/use-plugin"
import { createOpenedRoutineController } from "../routines/opened-routine-controller"
import { createMessageLandingController } from "../search/message-landing-controller"
import { useCollapsedSections } from "../sections/use-collapsed-sections"
import { useSections } from "../sections/use-sections"
import { openRowIdOf } from "../spaces/joined-spaces-controller"
import { useInvitations } from "../spaces/use-invitations"
import { useJoinedSpaces } from "../spaces/use-joined-spaces"
import { useSpaces } from "../spaces/use-spaces"
import { useConversationTabOpening } from "../tabs/use-conversation-tab-opening"
import { useUser } from "../user/use-user"

export const useWorkspaceCore = (openSettings: OpenSettings | null) => {
	const store = useMemo(createTranscriptStore, [])
	const account = useWatchedAccount()
	const senderAccountId = useSignedInAccountId()
	const roster = useRoster(store)
	const driver = useMemo(
		() =>
			withSettledSettings(
				createChatDriver(store),
				roster.controller.settingsSettled,
			),
		[store, roster.controller],
	)
	const chat = useChat(driver, store, {
		senderAccountId,
		rereadConversation: roster.controller.rereadConversationRow,
	})
	const conversationRuntimes = useMemo(
		() =>
			createConversationRuntimes(driver, store, {
				onNamed: roster.controller.nameConversation,
				rereadConversation: roster.controller.rereadConversationRow,
				senderAccountId,
			}),
		[driver, store, roster.controller, senderAccountId],
	)

	useEffect(
		() => () => {
			void conversationRuntimes.shutdown()
		},
		[conversationRuntimes],
	)

	const attachments = useMemo(
		() =>
			createAttachmentsController(
				createAttachmentsPort({
					chat: chat.controller,
					driver,
					runtimes: conversationRuntimes,
				}),
			),
		[chat.controller, driver, conversationRuntimes],
	)
	const drafts = useMemo(createDraftsController, [])
	const homeVisits = useMemo(() => createHomeVisits(store), [store])
	const homeEntries = useMemo(createHomeEntries, [])
	const homePicks = useMemo(createHomePicks, [])
	const spokenWords = useMemo(createSpokenWords, [])
	const openedMission = useMemo(
		() => createOpenedMissionController(roster.controller),
		[roster.controller],
	)
	const openedRoutine = useMemo(createOpenedRoutineController, [])
	const messageLandings = useMemo(createMessageLandingController, [])
	const sections = useSections(store, {
		move: roster.controller.moveToSection,
		clear: roster.controller.clearSection,
		pin: roster.controller.pin,
		hostSpaceIdOf: roster.controller.hostSpaceIdOf,
		reload: roster.controller.reload,
	})
	const collapsedSections = useCollapsedSections(
		store,
		roster.controller.hostSpaceIdOf,
	)
	const catalogue = useModelCatalogue()
	const user = useUser()
	const spaces = useSpaces(store)
	const joinedSpaces = useJoinedSpaces(spaces.controller, roster.controller)
	const invitations = useInvitations(joinedSpaces.controller)
	const { tabs } = useRouter().options.context
	const conversationOpening = useConversationTabOpening(
		tabs,
		joinedSpaces.controller,
	)
	const companionSettingsOwner = companionSettingsOwnerOf(
		openSettings,
		roster.state,
		spaces.state,
	)
	const spaceSettingsOwner = spaceSettingsOwnerOf(
		openSettings,
		spaces.state,
		openRowIdOf(joinedSpaces.state, spaces.state.selectedSpaceId),
	)
	const userSettingsOwner = userSettingsOwnerOf(openSettings)
	const applications = useApplications(applicationTransport, store, {
		isCatalogueOpen: Boolean(
			companionSettingsOwner ?? spaceSettingsOwner ?? userSettingsOwner,
		),
	})
	const companionPlugin = usePlugin(
		store,
		companionSettingsOwner && pluginScopeOf(companionSettingsOwner),
	)
	const spacePlugin = usePlugin(
		store,
		spaceSettingsOwner && pluginScopeOf(spaceSettingsOwner),
	)
	const userPlugin = usePlugin(
		store,
		userSettingsOwner && pluginScopeOf(userSettingsOwner),
	)
	const botEnvironment = useEnvironment(store, companionSettingsOwner)
	const spaceEnvironment = useEnvironment(store, spaceSettingsOwner)
	const botMcpServers = useMcpServers(store, companionSettingsOwner)
	const spaceMcpServers = useMcpServers(store, spaceSettingsOwner)
	const userMcpServers = useMcpServers(store, userSettingsOwner)
	const botConnections = useConnections(
		connectionTransport,
		companionSettingsOwner,
	)
	const spaceConnections = useConnections(
		connectionTransport,
		spaceSettingsOwner,
	)
	const userConnections = useConnections(connectionTransport, userSettingsOwner)
	const preferences = user.state.preferences

	return {
		account,
		applications,
		attachments,
		botConnections,
		botEnvironment,
		botMcpServers,
		catalogue,
		chat,
		collapsedSections,
		companionPlugin,
		conversationOpening,
		conversationRuntimes,
		drafts,
		driver,
		homeEntries,
		homePicks,
		homeVisits,
		invitations,
		joinedSpaces,
		messageLandings,
		openedMission,
		openedRoutine,
		preferences,
		roster,
		sections,
		spaceConnections,
		spaceEnvironment,
		spaceMcpServers,
		spacePlugin,
		spaceSettingsOwner,
		spaces,
		spokenWords,
		store,
		user,
		userConnections,
		userMcpServers,
		userPlugin,
	}
}

export type WorkspaceCore = ReturnType<typeof useWorkspaceCore>
