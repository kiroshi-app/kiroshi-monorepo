import type { SettingsScreenRequestLeave } from "@workspace/ui/components/settings-screen"
import type { AboutFieldsProps } from "@workspace/ui/components/user-settings-dialog/about-fields"

import { CompanionScreenHost } from "@/components/companion-screen-host"
import { SpaceSettingsScreen } from "@/components/space-settings-screen"
import { UserSettingsScreen } from "@/components/user-settings-screen"
import {
	WorkspaceRail,
	type WorkspaceRailProps,
} from "@/components/workspace-rail"
import type { ApplicationScopes } from "@/lib/workspace/use-application-scopes"

type WorkspaceSettingsProps = WorkspaceRailProps & {
	about: AboutFieldsProps | undefined
	scopes: ApplicationScopes
}

export const WorkspaceSettings = ({
	about,
	scopes,
	...railProps
}: WorkspaceSettingsProps) => {
	const { core, overlay, panels, rosterLines, rosterView } = railProps
	const rail = (requestLeave: SettingsScreenRequestLeave) => (
		<WorkspaceRail {...railProps} requestLeave={requestLeave} />
	)

	if (panels.openSettings === "you") {
		return (
			<UserSettingsScreen
				about={about}
				core={core}
				overlay={overlay}
				panels={panels}
				rail={rail}
				scopes={scopes}
			/>
		)
	}

	return panels.isCompanionScreenOpen ? (
		<CompanionScreenHost
			core={core}
			panels={panels}
			rail={rail}
			rosterLines={rosterLines}
			rosterView={rosterView}
			scopes={scopes}
		/>
	) : (
		<SpaceSettingsScreen
			core={core}
			panels={panels}
			rail={rail}
			rosterLines={rosterLines}
			rosterView={rosterView}
			scopes={scopes}
		/>
	)
}
