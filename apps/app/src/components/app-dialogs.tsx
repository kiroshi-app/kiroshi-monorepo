import { DeviceApprovalDialog } from "@workspace/ui/components/device-approval-dialog"
import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import { SearchPalette } from "@workspace/ui/components/search-palette"
import {
	WhatsNewDialog,
	type WhatsNewDialogProps,
} from "@workspace/ui/components/whats-new-dialog"

import { ConversationSettingsHost } from "@/components/conversation-settings-host"
import { JoinedSpaceDialogs } from "@/components/joined-space-dialogs"
import { useDeviceApprovals } from "@/lib/devices/use-device-approvals"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterView } from "@/lib/workspace/use-roster-view"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"

type AppDialogsProps = {
	core: WorkspaceCore
	overlay: WorkspaceOverlay
	rosterLines: RosterLines
	rosterView: RosterView
	whatsNewDialog: WhatsNewDialogProps | null
}

export const AppDialogs = ({
	core,
	overlay,
	rosterLines,
	rosterView,
	whatsNewDialog,
}: AppDialogsProps) => {
	const deviceApproval = useDeviceApprovals(core.account.state)

	return (
		<>
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
