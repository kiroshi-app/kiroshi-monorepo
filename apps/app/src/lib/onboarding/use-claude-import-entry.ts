import { useState } from "react"

import type {
	ClaudeImportScene,
	ClaudeImportWorld,
} from "./claude-import-controller"
import {
	type ClaudeImportVariant,
	isImportOfferedAtStart,
	offersClaudeImport,
} from "./claude-import-screen"
import { useClaudeInventory } from "./use-claude-inventory"

import type { RosterController } from "../bots/roster-controller"
import type { User } from "../user/use-user"

type ClaudeImportEntryInput = {
	roster: RosterController
	user: User
}

export type ClaudeImportEntry = {
	scene: ClaudeImportScene
	canImport: boolean
	openFromSettings: () => void
	shown: { variant: ClaudeImportVariant; world: ClaudeImportWorld } | null
}

const sceneOf = ({
	roster,
	user,
}: ClaudeImportEntryInput): ClaudeImportScene => ({
	spaceId: () => {
		const { spaceRowId } = roster.getState()
		return spaceRowId && roster.hostSpaceIdOf(spaceRowId)
	},
	markSeen: user.controller.markOnboardingImportSeen,
})

export const useClaudeImportEntry = (
	input: ClaudeImportEntryInput,
): ClaudeImportEntry => {
	const { inventory } = useClaudeInventory()
	const [opened, setOpened] = useState<ClaudeImportVariant | null>(null)
	const [hasLeftStartOffer, setLeftStartOffer] = useState(false)
	const scene = sceneOf(input)
	const isOfferedAtStart =
		!hasLeftStartOffer &&
		isImportOfferedAtStart(input.user.state.preferences, inventory)
	const shownVariant = opened ?? (isOfferedAtStart ? "onboarding" : null)
	const leave = () => {
		setOpened(null)
		setLeftStartOffer(true)
	}

	return {
		scene,
		canImport: offersClaudeImport(inventory),
		openFromSettings: () => setOpened("fromSettings"),
		shown: shownVariant && {
			variant: shownVariant,
			world: { ...scene, leave },
		},
	}
}
