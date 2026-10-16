import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import { SearchPalette } from "@workspace/ui/components/search-palette"
import { WhatsNewDialog } from "@workspace/ui/components/whats-new-dialog"

import { BotSettingsHost } from "@/components/bot-settings-host"
import { ConversationSettingsHost } from "@/components/conversation-settings-host"
import { JoinedSpaceDialogs } from "@/components/joined-space-dialogs"
import { SpaceSettingsHost } from "@/components/space-settings-host"
import { UserSettingsHost } from "@/components/user-settings-host"
import { aboutFieldsOf } from "@/lib/updater/about-fields"
import { useRunningVersion } from "@/lib/updater/use-running-version"
import type { Updater } from "@/lib/updater/use-updater"
import { useWhatsNew } from "@/lib/updater/use-whats-new"
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
	updater: Updater
}

export const AppDialogs = ({
	core,
	overlay,
	panels,
	rosterLines,
	rosterView,
	scopes,
	updater,
}: AppDialogsProps) => {
	const runningVersion = useRunningVersion()
	const whatsNew = useWhatsNew({ user: core.user, runningVersion })
	const about = aboutFieldsOf({
		updater,
		user: core.user,
		runningVersion,
		onWhatsNew: whatsNew.openFromAbout,
	})

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
			<SpaceSettingsHost core={core} panels={panels} scopes={scopes} />
			<JoinedSpaceDialogs joinedSpaces={core.joinedSpaces} />
			<UserSettingsHost
				about={about}
				core={core}
				overlay={overlay}
				panels={panels}
				scopes={scopes}
			/>
			{whatsNew.dialog ? <WhatsNewDialog {...whatsNew.dialog} /> : null}
			<SearchPalette {...overlay.search.palette} />
			<NoticeSurface />
		</>
	)
}
