import { USER_OWNER } from "./user-owner"

import type { RosterState } from "../bots/roster-controller"
import type { EnvOwner } from "../conversations/store-contract"
import type { SpacesState } from "../spaces/spaces-controller"

type EditedCompanion = Pick<RosterState, "isEditing" | "settingsBotId">

type SelectedSpace = Pick<SpacesState, "isSettingsOpen" | "selectedSpaceId">

export const companionSettingsOwnerOf = (
	{ isEditing, settingsBotId }: EditedCompanion,
	{ selectedSpaceId }: SelectedSpace,
): EnvOwner | null =>
	isEditing && settingsBotId && selectedSpaceId
		? { kind: "bot", id: settingsBotId, spaceId: selectedSpaceId }
		: null

export const spaceSettingsOwnerOf = ({
	isSettingsOpen,
	selectedSpaceId,
}: SelectedSpace): EnvOwner | null =>
	isSettingsOpen && selectedSpaceId
		? { kind: "space", id: selectedSpaceId }
		: null

export const userSettingsOwnerOf = (
	isSettingsOpen: boolean,
): EnvOwner | null => (isSettingsOpen ? USER_OWNER : null)
