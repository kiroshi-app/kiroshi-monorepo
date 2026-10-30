import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import type { RosterBot } from "@workspace/ui/components/roster"

const CONVERSATION_BOTS: RosterBot[] = [
	{ id: "bot-atlas", name: "Atlas", blot: BLOT_HUES.blue },
	{ id: "bot-basile", name: "Basile", blot: BLOT_HUES.purple },
	{ id: "bot-clemence", name: "Clémence", blot: BLOT_HUES.pink },
	{ id: "bot-dorian", name: "Dorian", blot: BLOT_HUES.orange },
	{ id: "bot-elia", name: "Elia", blot: BLOT_HUES.green },
	{ id: "bot-faust", name: "Faust", blot: BLOT_HUES.cyan },
]

const LONG_NAMED_BOTS: RosterBot[] = [
	{
		id: "bot-release",
		name: "Release notes editor for the desktop build",
		blot: BLOT_HUES.yellow,
	},
	{
		id: "bot-triage",
		name: "Incident triage and on-call handover agent",
		blot: BLOT_HUES.red,
	},
]

export { CONVERSATION_BOTS, LONG_NAMED_BOTS }
