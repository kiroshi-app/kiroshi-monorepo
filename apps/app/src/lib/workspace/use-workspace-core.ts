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
import { createConversationRuntimes } from "../conversations/conversation-runtimes"
import { createTranscriptStore } from "../conversations/create-store"
import { pluginScopeOf } from "../conversations/plugin-scope"
import { createSpokenWords } from "../conversations/spoken-words"
import { useEnvironment } from "../environment/use-environment"
import { createOpenedMissionController } from "../missions/opened-mission-controller"
import { usePlugin } from "../plugins/use-plugin"
import { createOpenedRoutineController } from "../routines/opened-routine-controller"
import { createMessageLandingController } from "../search/message-landing-controller"
import { useCollapsedSections } from "../sections/use-collapsed-sections"
import { useSections } from "../sections/use-sections"
import { createShownMemory } from "../sidebar/shown-memory"
import { useInvitations } from "../spaces/use-invitations"
import { useJoinedSpaces } from "../spaces/use-joined-spaces"
import { useSpaces } from "../spaces/use-spaces"
import { useUser } from "../user/use-user"

export const useWorkspaceCore = () => {
	const store = useMemo(createTranscriptStore, [])
	const driver = useMemo(() => createChatDriver(store), [store])
	const account = useWatchedAccount()
	const senderAccountId = useSignedInAccountId()
	const chat = useChat(driver, store, { senderAccountId })
	const roster = useRoster(store)
	const conversationRuntimes = useMemo(
		() =>
			createConversationRuntimes(driver, store, {
				onNamed: roster.controller.nameConversation,
				onForeignSpeakerSilent: roster.controller.rereadConversationRow,
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
	const spokenWords = useMemo(createSpokenWords, [])
	const openedMission = useMemo(
		() => createOpenedMissionController(roster.controller),
		[roster.controller],
	)
	const shownMemory = useMemo(
		() => createShownMemory({ roster: roster.controller, openedMission }),
		[roster.controller, openedMission],
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
	const joinedSpaces = useJoinedSpaces(spaces.controller)
	const invitations = useInvitations(joinedSpaces.controller)
	const companionSettingsOwner = companionSettingsOwnerOf(
		roster.state,
		spaces.state,
	)
	const spaceSettingsOwner = spaceSettingsOwnerOf(spaces.state)
	const userSettingsOwner = userSettingsOwnerOf(user.state.isSettingsOpen)
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
		conversationRuntimes,
		drafts,
		driver,
		invitations,
		joinedSpaces,
		messageLandings,
		openedMission,
		openedRoutine,
		preferences,
		roster,
		sections,
		shownMemory,
		spaceConnections,
		spaceEnvironment,
		spaceMcpServers,
		spacePlugin,
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
