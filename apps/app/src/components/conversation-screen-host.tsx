import { ConversationSettingsScreen } from "@workspace/ui/components/settings-screen"

import type { Conversation } from "@/lib/bindings"
import {
	leadOf,
	presentParticipants,
	toConversationBots,
	toConversationLook,
	toConversationSettingsValue,
} from "@/lib/conversations/roster-conversations"
import type { SettingsSearch } from "@/lib/navigation/settings-search"
import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import type { SettingsFrame } from "@/lib/workspace/settings-frame"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterView } from "@/lib/workspace/use-roster-view"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"

const GENERAL_ENTRY = "general"

type ConversationScreenHostProps = {
	conversation: Conversation
	core: WorkspaceCore
	frame: SettingsFrame
	navigation: SettingsNavigation
	rosterLines: RosterLines
	rosterView: RosterView
	search: SettingsSearch
}

export const ConversationScreenHost = ({
	conversation,
	core,
	frame,
	navigation,
	rosterLines,
	rosterView,
	search,
}: ConversationScreenHostProps) => {
	const roster = core.roster.controller
	const { id } = conversation

	return (
		<ConversationSettingsScreen
			{...frame}
			entry={search.entry ?? GENERAL_ENTRY}
			onBack={navigation.back}
			onEntryChange={navigation.showEntry}
			hue={conversation.color}
			icon={toConversationLook(conversation).icon}
			leadId={leadOf(conversation) ?? ""}
			onDelete={() => {
				void rosterLines.sidebarActions
					.onDeleteConversation(id)
					.then(navigation.back)
			}}
			onDismiss={(botId) => {
				void roster.dismissFromConversation(id, botId)
			}}
			onHueChange={(hue) => roster.styleConversation(id, { color: hue })}
			onIconChange={(icon) => roster.styleConversation(id, { icon })}
			onLeadChange={(botId) => {
				void roster.setConversationLead(id, botId)
			}}
			onValueChange={(value) => roster.describeConversation(id, value)}
			participants={toConversationBots(
				presentParticipants(conversation),
				rosterView.bots,
			)}
			value={toConversationSettingsValue(conversation)}
		/>
	)
}
