import { DeviceApprovalDialog } from "@workspace/ui/components/device-approval-dialog"
import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import { SearchPalette } from "@workspace/ui/components/search-palette"
import {
	WhatsNewDialog,
	type WhatsNewDialogProps,
} from "@workspace/ui/components/whats-new-dialog"

import { useDeviceApprovals } from "@/lib/devices/use-device-approvals"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"

type AppDialogsProps = {
	core: WorkspaceCore
	overlay: WorkspaceOverlay
	whatsNewDialog: WhatsNewDialogProps | null
}

export const AppDialogs = ({
	core,
	overlay,
	whatsNewDialog,
}: AppDialogsProps) => {
	const deviceApproval = useDeviceApprovals(core.account.state)

	return (
		<>
			{whatsNewDialog ? <WhatsNewDialog {...whatsNewDialog} /> : null}
			<SearchPalette {...overlay.search.palette} />
			{deviceApproval ? <DeviceApprovalDialog {...deviceApproval} /> : null}
			<NoticeSurface />
		</>
	)
}
