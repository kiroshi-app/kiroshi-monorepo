import { DeviceApprovalDialog } from "@workspace/ui/components/device-approval-dialog"
import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import { SearchPalette } from "@workspace/ui/components/search-palette"
import {
	WhatsNewDialog,
	type WhatsNewDialogProps,
} from "@workspace/ui/components/whats-new-dialog"

import { BotSettingsHost } from "@/components/bot-settings-host"
import { ConversationSettingsHost } from "@/components/conversation-settings-host"
import { JoinedSpaceDialogs } from "@/components/joined-space-dialogs"
import { useDeviceApprovals } from "@/lib/devices/use-device-approvals"
import type { ApplicationScopes } from "@/lib/workspace/use-application-scopes"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterView } from "@/lib/workspace/use-roster-view"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"

type AppDialogsProps = {
	core: WorkspaceCore
	overlay: WorkspaceOverlay
	panels: SettingsPanels
	rosterLines: RosterLines
	rosterView: RosterView
	scopes: ApplicationScopes
	whatsNewDialog: WhatsNewDialogProps | null
}

export const AppDialogs = ({
	core,
	overlay,
	panels,
	rosterLines,
	rosterView,
	scopes,
	whatsNewDialog,
}: AppDialogsProps) => {
	const deviceApproval = useDeviceApprovals(core.account.state)

	return (
		<>
			<BotSettingsHost
				core={core}
				panels={panels}
				rosterLines={rosterLines}
				rosterView={rosterView}
				scopes={scopes}
			/>
			<ConversationSettingsHost
				core={core}
				rosterLines={rosterLines}
				rosterView={rosterView}
			/>
			<JoinedSpaceDialogs joinedSpaces={core.joinedSpaces} />
			{whatsNewDialog ? <WhatsNewDialog {...whatsNewDialog} /> : null}
			<SearchPalette {...overlay.search.palette} />
			{deviceApproval ? <DeviceApprovalDialog {...deviceApproval} /> : null}
			<NoticeSurface />
		</>
	)
}
