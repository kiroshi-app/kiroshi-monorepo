import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import type { CompanionSummary } from "@workspace/ui/components/space-settings-dialog/companions-section"

const JUNIPER: CompanionSummary = {
	id: "juniper",
	name: "Juniper",
	blot: BLOT_HUES.purple,
	title: "Writer",
	instructions:
		"You write release notes and changelogs for the Studio team. Group changes by area, link every pull request, and keep each entry to one plain sentence a customer can read.",
	skillsCount: 3,
	applicationsCount: 2,
	permissionMode: "acceptEdits",
}

const ATLAS: CompanionSummary = {
	id: "atlas",
	name: "Atlas",
	blot: BLOT_HUES.blue,
	title: "Planner",
	instructions:
		"You turn a goal into a plan the team can run: milestones, owners and the first three steps.",
	skillsCount: 5,
	applicationsCount: 1,
	permissionMode: "plan",
}

const PICO: CompanionSummary = {
	id: "pico",
	name: "Pico",
	blot: BLOT_HUES.green,
	title: "Builder",
	instructions:
		"You ship small changes to the Studio site. Run the checks before you say it works.",
	skillsCount: 8,
	applicationsCount: 3,
	permissionMode: "default",
}

const MIRA: CompanionSummary = {
	id: "mira",
	name: "Mira",
	blot: BLOT_HUES.pink,
	title: "Designer",
	instructions:
		"You draw screens from what the product really does, and name every state you leave out.",
	skillsCount: 2,
	applicationsCount: 0,
	permissionMode: "acceptEdits",
}

const SPACE_COMPANIONS = [JUNIPER, ATLAS, PICO, MIRA]

export { JUNIPER, SPACE_COMPANIONS }
