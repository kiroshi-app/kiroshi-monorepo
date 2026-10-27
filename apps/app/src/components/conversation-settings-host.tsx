import { ConversationSettingsDialog } from "@workspace/ui/components/conversation-settings-dialog"

import { hueOfPreset } from "@/lib/colour/hue-shim"
import {
	leadOf,
	presentParticipants,
	toConversationBots,
	toConversationLook,
	toConversationSettingsValue,
} from "@/lib/conversations/roster-conversations"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterView } from "@/lib/workspace/use-roster-view"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"

type ConversationSettingsHostProps = {
	core: WorkspaceCore
	rosterLines: RosterLines
	rosterView: RosterView
}

export const ConversationSettingsHost = ({
	core,
	rosterLines,
	rosterView,
}: ConversationSettingsHostProps) => {
	const { roster } = core
	const { sidebarActions } = rosterLines
	const { bots, isEditingConversation, settingsConversation } = rosterView

	return settingsConversation ? (
		<ConversationSettingsDialog
			{...toConversationLook(settingsConversation)}
			leadId={leadOf(settingsConversation) ?? ""}
			onClose={() => roster.controller.setConversationEditing(false)}
			onColorChange={(color) =>
				roster.controller.styleConversation(settingsConversation.id, {
					color: color ? hueOfPreset(color) : null,
				})
			}
			onDelete={() => {
				void sidebarActions.onDeleteConversation(settingsConversation.id)
			}}
			onDismiss={(botId) => {
				void roster.controller.dismissFromConversation(
					settingsConversation.id,
					botId,
				)
			}}
			onIconChange={(icon) =>
				roster.controller.styleConversation(settingsConversation.id, { icon })
			}
			onLeadChange={(botId) => {
				void roster.controller.setConversationLead(
					settingsConversation.id,
					botId,
				)
			}}
			onValueChange={(value) =>
				roster.controller.describeConversation(settingsConversation.id, value)
			}
			open={isEditingConversation}
			participants={toConversationBots(
				presentParticipants(settingsConversation),
				bots,
			)}
			value={toConversationSettingsValue(settingsConversation)}
		/>
	) : null
}
