import type {
	AppSidebarBot,
	AppSidebarConversation,
	AppSidebarSection,
} from "@workspace/ui/components/app-sidebar"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import type { Space } from "@workspace/ui/components/space"
import type { Lifter } from "@workspace/ui/hooks/use-roster-lift"

export const SIDEBAR_SPACES: Space[] = [
	{ id: "perso", name: "Perso", colour: BLOT_HUES.blue, avatarSeed: "perso" },
	{ id: "vocca", name: "Vocca", colour: BLOT_HUES.green, avatarSeed: "vocca" },
]

export const SIDEBAR_SECTION: AppSidebarSection = {
	id: "desk",
	name: "Desk",
	position: 0,
}

export const ATLAS: AppSidebarBot = {
	id: "atlas",
	blot: BLOT_HUES.blue,
	name: "Atlas",
	title: "Research",
	lastMessage: "Pulled the three papers and summarised each one for you.",
	timestamp: "09:24",
}

export const BEACON: AppSidebarBot = {
	id: "beacon",
	blot: BLOT_HUES.yellow,
	name: "Beacon",
	status: "working",
	pose: "writing",
	lastMessage: "Drafting the release notes.",
	timestamp: "09:18",
	sectionId: SIDEBAR_SECTION.id,
	pinPosition: 0,
}

export const DESK_ROOM: AppSidebarConversation = {
	id: "desk-room",
	name: "Launch room",
	participants: [ATLAS, BEACON],
	lastMessage: "The changelog is ready for a read.",
	lastSpeaker: "Atlas",
	timestamp: "08:50",
	pinPosition: 1,
}

export const PINNED_CONVERSATIONS: AppSidebarConversation[] = [
	DESK_ROOM,
	{
		id: "roadmap",
		name: "Roadmap",
		participants: [ATLAS],
		lastMessage: "Q3 themes are drafted.",
		lastSpeaker: "Atlas",
		timestamp: "Yesterday",
		pinPosition: 2,
	},
]

export const RECENT_CONVERSATIONS: AppSidebarConversation[] = [
	{
		id: "hiring",
		name: "Hiring loop",
		participants: [BEACON],
		lastMessage: "Two candidates booked for Thursday.",
		lastSpeaker: "Beacon",
		timestamp: "09:12",
	},
	{
		id: "pricing",
		name: "Pricing page",
		participants: [ATLAS, BEACON],
		lastMessage: "The new tiers read well.",
		lastSpeaker: "Atlas",
		timestamp: "Mon",
	},
	{
		id: "support",
		name: "Support inbox",
		participants: [BEACON],
		lastMessage: "Three tickets need a reply.",
		lastSpeaker: "Beacon",
		timestamp: "Sun",
	},
]

export const SIDEBAR_BOTS: AppSidebarBot[] = [ATLAS, BEACON]

export const SIDEBAR_CONVERSATIONS: AppSidebarConversation[] = [DESK_ROOM]

export const STILL_LIFT: Lifter = {
	handlersFor: () => ({
		onPointerDown: () => undefined,
	}),
	hasJustDropped: () => false,
}

export const PENDING_QUESTION = "Ship the release notes as drafted?"

export const LONG_PENDING_QUESTION =
	"Should I merge the migration branch tonight, or hold it until the staging deploy has run its full suite twice?"
