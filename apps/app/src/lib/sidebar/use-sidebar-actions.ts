import { useMemo } from "react"

import type { AppSidebarProps } from "@workspace/ui/components/app-sidebar"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	type FailureCorrelation,
	raiseReportedFailure,
} from "../failure-report"
import type { RosterController } from "../bots/roster-controller"
import type { AttachmentsController } from "../chat/attachments-controller"
import type { ChatController } from "../chat/chat-controller"
import type { DraftsController } from "../chat/drafts-controller"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { OpenedMissionController } from "../missions/opened-mission-controller"
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
import type { UserController } from "../user/preferences-controller"

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
		| "onLeaveSpace"
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
		| "onStopBot"
		| "onStopConversation"
	>
>

export type SidebarActionsSource = {
	attachments: AttachmentsController
	chat: Pick<ChatController, "stopFor">
	collapsedSections: CollapsedSectionsController
	drafts: DraftsController
	joinedSpaces: JoinedSpacesController
	openedMission: Pick<OpenedMissionController, "leave">
	roster: RosterController
	runtimes: ConversationRuntimes
	sections: SectionsController
	spaces: SpacesController
	user: UserController
}

const localSpaceIdsIn = (spaces: SpacesController, ids: string[]) => {
	const localIds = new Set(spaces.getState().spaces.map((space) => space.id))
	return ids.filter((id) => localIds.has(id))
}

const openSpaceRowId = (
	joinedSpaces: JoinedSpacesController,
	spaces: SpacesController,
) => openRowIdOf(joinedSpaces.getState(), spaces.getState().selectedSpaceId)

const stopReportingFailure = (
	stop: () => Promise<unknown>,
	correlation: FailureCorrelation,
) => {
	void stop().catch((reason: unknown) => {
		console.error("roster stop failed", reason)
		void raiseReportedFailure(
			{ title: i18n.t("chat:screen.notice.stopFailed") },
			{ ...correlation, raisedIn: "use-sidebar-actions" },
		)
	})
}

const stopSpeakersIn = (runtimes: ConversationRuntimes, id: string) => {
	const held = runtimes.heldFor(id)
	if (!held) {
		return
	}
	const { speakers } = held.getState()
	stopReportingFailure(
		() => Promise.all(speakers.map((speaking) => speaking.stop?.())),
		{ conversation: id },
	)
}

export const useSidebarActions = ({
	attachments,
	chat,
	collapsedSections,
	drafts,
	joinedSpaces,
	openedMission,
	roster,
	runtimes,
	sections,
	spaces,
	user,
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
			onDeleteBot: roster.askToDelete,
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
			onEditBot: roster.edit,
			onLeaveSpace: joinedSpaces.askToLeave,
			onOpenConversationSettings: roster.editConversation,
			onOpenSpaceSettings: () => spaces.setSettingsOpen(true),
			onOpenUserSettings: () => user.setSettingsOpen(true),
			onPinRoster: (spaceId, pins) => {
				void sections.pin(spaceId, pins)
			},
			onRenameSection: sections.rename,
			onReorderSpaces: (ids) => {
				void spaces.reorder(localSpaceIdsIn(spaces, ids))
			},
			onSelectBot: (id) => {
				startInvokePhaseUnless(
					"thread open",
					() => id === roster.getState().selectedBotId,
				)
				openedMission.leave()
				roster.select(id)
			},
			onSelectConversation: (id) => {
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
			onStopBot: (id) => {
				stopReportingFailure(() => chat.stopFor(id), { botId: id })
			},
			onStopConversation: (id) => {
				stopSpeakersIn(runtimes, id)
			},
		}),
		[
			attachments,
			chat,
			collapsedSections,
			drafts,
			joinedSpaces,
			openedMission,
			roster,
			runtimes,
			sections,
			spaces,
			user,
		],
	)
