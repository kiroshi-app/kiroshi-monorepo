import { useMemo } from "react"

import type {
	AppSidebarProps,
	SidebarClickModifiers,
} from "@workspace/ui/components/app-sidebar"

import { usesCommandKey } from "../host"
import type { RosterController } from "../bots/roster-controller"
import type { AttachmentsController } from "../chat/attachments-controller"
import type { DraftsController } from "../chat/drafts-controller"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { OpenedMissionController } from "../missions/opened-mission-controller"
import { COMPANION_DANGER_ENTRY } from "../navigation/settings-search"
import type { SettingsNavigation } from "../navigation/use-settings-navigation"
import { startInvokePhaseUnless } from "../perf/invoke-tally-devtools"
import type { CollapsedSectionsController } from "../sections/collapsed-sections-controller"
import { newSectionFor } from "../sections/section-space"
import {
	type SectionsController,
	spaceOfSection,
} from "../sections/sections-controller"
import {
	type JoinedSpacesController,
	openRowIdOf,
} from "../spaces/joined-spaces-controller"
import type { SpacesController } from "../spaces/spaces-controller"

export type SidebarActions = Required<
	Pick<
		AppSidebarProps,
		| "onAddBotToSpace"
		| "onCollapseSection"
		| "onCreateBot"
		| "onCreateSection"
		| "onCreateSpace"
		| "onDeleteBot"
		| "onDeleteConversation"
		| "onDeleteSection"
		| "onDuplicateBot"
		| "onEditBot"
		| "onOpenConversationSettings"
		| "onOpenSpaceSettings"
		| "onOpenUserSettings"
		| "onPinRoster"
		| "onRemoveBotFromSpace"
		| "onRenameSection"
		| "onReorderSpaces"
		| "onSelectBot"
		| "onSelectConversation"
		| "onSelectSpace"
	>
>

type SettingsOpening = Pick<
	SettingsNavigation,
	| "openCompanionSettings"
	| "openSpaceSettings"
	| "openThreadInNewTab"
	| "openUserSettings"
>

export type SidebarActionsSource = {
	attachments: AttachmentsController
	collapsedSections: CollapsedSectionsController
	drafts: DraftsController
	joinedSpaces: JoinedSpacesController
	openedMission: Pick<OpenedMissionController, "leave">
	roster: RosterController
	runtimes: ConversationRuntimes
	sections: SectionsController
	settings: SettingsOpening
	spaces: SpacesController
}

const localSpaceIdsIn = (spaces: SpacesController, ids: string[]) => {
	const localIds = new Set(spaces.getState().spaces.map((space) => space.id))
	return ids.filter((id) => localIds.has(id))
}

const opensInNewTab = (modifiers: SidebarClickModifiers | undefined) => {
	if (!modifiers) {
		return false
	}
	const isModHeld = usesCommandKey() ? modifiers.meta : modifiers.ctrl
	return modifiers.middle || isModHeld
}

const openSpaceRowId = (
	joinedSpaces: JoinedSpacesController,
	spaces: SpacesController,
) => openRowIdOf(joinedSpaces.getState(), spaces.getState().selectedSpaceId)

export const useSidebarActions = ({
	attachments,
	collapsedSections,
	drafts,
	joinedSpaces,
	openedMission,
	roster,
	runtimes,
	sections,
	settings,
	spaces,
}: SidebarActionsSource): SidebarActions =>
	useMemo(
		() => ({
			onCollapseSection: (id, isCollapsed) => {
				const spaceId = spaceOfSection(sections.getState(), id)
				if (spaceId) {
					collapsedSections.collapse(spaceId, id, isCollapsed)
				}
			},
			onCreateBot: () => {
				void roster.create()
			},
			onCreateSection: (name, rowId) => {
				const { rosters, conversationRosters, spaceRowId } = roster.getState()
				const born = newSectionFor({
					rosters,
					conversationRosters,
					shownSpaceId: spaceRowId,
					rowId,
				})
				if (!born) {
					return
				}
				void sections.create(born.spaceId, name, born.botId).then((created) => {
					if (created && born.conversationId) {
						void roster.moveConversationToSection(
							born.conversationId,
							created.id,
						)
					}
				})
			},
			onCreateSpace: () => {
				void spaces.create()
			},
			onDeleteBot: (id) =>
				settings.openCompanionSettings(id, { entry: COMPANION_DANGER_ENTRY }),
			onDeleteConversation: async (id) => {
				await runtimes.release(id)
				attachments.forget({ kind: "conversation", id })
				drafts.forget(id)
				await roster.removeConversation(id)
			},
			onDeleteSection: (id) => {
				void sections.remove(id)
			},
			onDuplicateBot: (id) => {
				void roster.duplicate(id)
			},
			onAddBotToSpace: (botId, spaceId) => {
				void roster.addToSpace(botId, spaceId)
			},
			onRemoveBotFromSpace: (botId, spaceId) => {
				void roster.removeFromSpace(botId, spaceId)
			},
			onEditBot: (id) => settings.openCompanionSettings(id),
			onOpenConversationSettings: roster.editConversation,
			onOpenSpaceSettings: () => {
				const openRowId = openSpaceRowId(joinedSpaces, spaces)
				if (openRowId) settings.openSpaceSettings(openRowId)
			},
			onOpenUserSettings: () => settings.openUserSettings(),
			onPinRoster: (spaceId, pins) => {
				void sections.pin(spaceId, pins)
			},
			onRenameSection: sections.rename,
			onReorderSpaces: (ids) => {
				void spaces.reorder(localSpaceIdsIn(spaces, ids))
			},
			onSelectBot: (id, modifiers) => {
				if (opensInNewTab(modifiers)) {
					settings.openThreadInNewTab({ bot: id })
					return
				}
				startInvokePhaseUnless(
					"thread open",
					() => id === roster.getState().selectedBotId,
				)
				openedMission.leave()
				roster.select(id)
			},
			onSelectConversation: (id, modifiers) => {
				if (opensInNewTab(modifiers)) {
					settings.openThreadInNewTab({ conversation: id })
					return
				}
				startInvokePhaseUnless(
					"thread open",
					() => id === roster.getState().selectedConversationId,
				)
				openedMission.leave()
				roster.selectConversation(id)
			},
			onSelectSpace: (id) => {
				startInvokePhaseUnless(
					"space switch",
					() => id === openSpaceRowId(joinedSpaces, spaces),
				)
				joinedSpaces.selectSpace(id)
			},
		}),
		[
			attachments,
			collapsedSections,
			drafts,
			joinedSpaces,
			openedMission,
			roster,
			runtimes,
			sections,
			settings,
			spaces,
		],
	)
