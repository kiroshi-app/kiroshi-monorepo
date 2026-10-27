import type {
	AppSidebarBot,
	AppSidebarConversation,
	AppSidebarSection,
} from "@workspace/ui/components/app-sidebar"
import type { Space } from "@workspace/ui/components/space"
import type { Lifter } from "@workspace/ui/hooks/use-roster-lift"

export const SIDEBAR_SPACES: Space[] = [
	{ id: "perso", name: "Perso", colour: "blue", avatarSeed: "perso" },
	{ id: "vocca", name: "Vocca", colour: "green", avatarSeed: "vocca" },
]

export const SIDEBAR_SECTION: AppSidebarSection = {
	id: "desk",
	name: "Desk",
	position: 0,
}

export const ATLAS: AppSidebarBot = {
	id: "atlas",
	blot: "blue",
	name: "Atlas",
	title: "Research",
	lastMessage: "Pulled the three papers and summarised each one for you.",
	timestamp: "09:24",
}

export const BEACON: AppSidebarBot = {
	id: "beacon",
	blot: "yellow",
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
