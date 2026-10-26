import type { CompanionSummary } from "@workspace/ui/components/space-settings-dialog/companions-section"

const JUNIPER: CompanionSummary = {
	id: "juniper",
	name: "Juniper",
	blot: "purple",
	title: "Writer",
	instructions:
		"Drafts release notes, changelogs and announcement posts from merged pull requests. Keeps the tone plain, the sentences short, and asks before publishing anything.",
	skillsCount: 3,
	applicationsCount: 2,
	permissionMode: "default",
}

const ATLAS: CompanionSummary = {
	id: "atlas",
	name: "Atlas",
	blot: "blue",
	title: "Planner",
	instructions:
		"Turns a goal into missions with owners and deadlines, then checks in on each one every morning.",
	skillsCount: 1,
	applicationsCount: 1,
	permissionMode: "plan",
}

const PICO: CompanionSummary = {
	id: "pico",
	name: "Pico",
	blot: "green",
	title: "Builder",
	instructions:
		"Writes and fixes code in the desktop app, runs the tests before handing anything back.",
	skillsCount: 5,
	applicationsCount: 0,
	permissionMode: "acceptEdits",
}

const MIRA: CompanionSummary = {
	id: "mira",
	name: "Mira",
	blot: "pink",
	title: "Designer",
	instructions:
		"Reviews screens against the design system and suggests the smallest change that fixes spacing, colour or type.",
	skillsCount: 2,
	applicationsCount: 3,
	permissionMode: "auto",
}

const SPACE_COMPANIONS = [JUNIPER, ATLAS, PICO, MIRA]

export { JUNIPER, SPACE_COMPANIONS }
