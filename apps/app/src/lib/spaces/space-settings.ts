import type { SpaceSettingsValue } from "@workspace/ui/components/space-settings"
import { i18n } from "@workspace/ui/lib/i18n"

import type { Space } from "../conversations/store-contract"

export const toSpaceSettingsValue = (space: Space): SpaceSettingsValue => ({
	name: space.name,
	colour: space.colour,
})

export const newSpaceName = () => i18n.t("settings:space.untitled")
