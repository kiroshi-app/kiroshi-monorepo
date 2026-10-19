import { realpath } from "node:fs/promises"
import { resolve } from "node:path"

import { type SdkMcpToolDefinition, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import conversationIcons from "@workspace/shared/conversation-icons.json"

import { carriedTo, refused } from "./host-calls"
import { deniesRead, type FloorScope } from "./security-floor"

const SUBTYPE = "companion"

const NAME =
	"The name the person will call this companion by, theirs or the one they picked."

const JOB =
	"What this companion is for, in a few words, read under its name on its roster line."

const DESCRIPTION =
	"What this companion does and how it works, written as an order to it."

const SUGGESTIONS =
	"Read the companions this app suggests, each with the name, the job, the description and the blurb it ships, before you ask the person which one they want."

const CREATE =
	"Create a companion in the space of this conversation, once the person has picked a suggestion or agreed on the name, the job and the description you read back to them."

const FIRST_RUN_DONE =
	"Record the first run of the app as finished, once the person has answered the hand-off question, so the app stops opening on it."

const ROSTER =
	"List every companion of the space of this conversation, each with its id, its name and its job, before you seat one, take one out or mention one by name."

const OPEN =
	"Open a new room in the space of this conversation, led by you, once the person asks for a topic of its own."

const TITLE = "The title of the room, read in the space's list of rooms."

const WITH =
	"The id or the name of each companion of this space to seat in the room beside you, empty for you alone."

const MESSAGE = "What you say to open the room, the first words read in it."

const SAY =
	"Say something in a room you hold a seat in, before you report back here on what you told it."

const ROOM = "The id of the room you hold a seat in to say it in."

const SPOKEN = "What you say in that room, read there in your name."

const ATTACH =
	"Show any file to the person, in this conversation or in a room you hold a seat in, once you want them to see it rather than only read it yourself: an image is shown inline, every other file is shown as an attachment they can open, 10 MB per file."

const FILE_PATH =
	"The path of the file to show, absolute or relative to your working directory: any file up to 10 MB, an image shown inline, every other file shown as an attachment."

const CAPTION =
	"A line read right above the file, the image shown inline or the attachment listed."

const ATTACH_ROOM =
	"The id of a room you hold a seat in to show it there, left out for this conversation."

const UPDATE =
	"Change a conversation you hold a seat in, its title, its icon, its colour and who is seated in it, or reopen it once archived, every field given landing together in one call and none of them if one is refused, once the person asks for it or once its subject calls for it; the answer is the conversation as it stands after the call, with its id, kind, title, icon, colour, seated companions, last message and whether it is archived."

const UPDATED_CONVERSATION =
	"The id of the conversation to change, one you hold a seat in, left out for this conversation."

const UPDATED_TITLE =
	"The new title of the conversation, the subject in a few words, left out to keep the one it wears; a title blank once trimmed is refused."

const OPENED_ICON =
	"The name of a Keyline icon drawn beside the title of the room, chosen with the title for the subject it names, such as Rocket, spelled as listed in packages/shared/conversation-icons.json. A name off that list is refused with the accepted names."

const UPDATED_ICON = `The name of the Keyline icon drawn beside the title of the conversation, chosen for the subject the title names, left out to keep the one it wears. It is one of ${conversationIcons.join(", ")}, spelled exactly so; any other name is refused with the accepted names.`

const COLOUR =
	"One of red, yellow, green, cyan, blue, purple, pink or orange, null to give the conversation back its default colour, left out to keep the one it wears."

const ADD =
	"The id or the name of each companion of the space of the conversation to seat in it, recorded as invited by you; one already seated stays as it is, and a name two companions share is refused with their ids."

const REMOVE =
	"The id or the name of each companion of the space of the conversation to take out of it, your own to leave it yourself; one not seated stays out."

const REOPEN =
	"False to reopen an archived conversation, back in the list of rooms of the space with every message it held; true is refused, since only conversation_close archives a room; left out, the conversation stays archived or not as it is."

const LIST =
	"List the conversations of this space, the latest activity first, each with its id, its kind, its title, its icon, its colour, its companions, its last message and whether it is archived, before you read, join or mention one whose id you do not hold."

const EVERYWHERE =
	"True to list every conversation of this space, seated or not, false to list only the ones you hold a seat in; left out, it is false."

const KIND =
	"One of main, topic or mission to list only that kind: main is a companion's own chat with the person, topic a room, mission the thread of a mission; left out, every kind is listed."

const LIST_LIMIT =
	"How many conversations to answer, from 1 to 200; left out, 50."

const CURSOR =
	"The cursor the previous conversation_list answered, to list the page after it; left out, the list starts at the latest activity, and a null cursor in the answer marks the last page."

const READ =
	"Read a conversation of this space, its details and its last messages oldest to newest, each with its seq, its author, its time and its full text, before you answer about what was said there, whether you hold a seat in it or not."

const READ_ROOM =
	"The id of the conversation of this space to read, as conversation_list answers it."

const READ_LIMIT = "How many messages to answer, from 1 to 100; left out, 20."

const BEFORE =
	"The cursor the previous conversation_read answered, to read the messages strictly older than the ones it answered; left out, the latest messages are read, and a null cursor in the answer marks the first message of the conversation."

const SEARCH =
	"Find where something was discussed in the space of this conversation, before you answer from memory or ask the person where it was said: it answers conversations, the rooms whose title or companion names match, each with its id, its kind (main, topic or mission), its title (the companion's name for a main conversation) and the names of the companions seated in it, and messages, the messages whose text matches, best match first, each with the conversationId and conversationTitle of its room, its messageId, its author (the id of the companion who wrote it, or null when the person did), its createdAt in milliseconds since the epoch and a snippet of plain text around the match; two empty lists mean nothing in this space matched, and no other space is ever searched."

const QUERY =
	"The words to look for, matched against the start of words in messages and inside room titles and companion names, at most 200 characters."

const SEARCH_KIND =
	"One of main (a companion's own conversation with the person), topic (a room) or mission, to keep only the conversations and the messages of that kind, left out for every kind."

const CLOSE =
	"Archive a room you lead once its subject is settled, keeping every message in it."

const CLOSED_ROOM = "The id of the room you lead to archive."

type ToolInput = Record<string, z.ZodType>

const NOTHING: ToolInput = {}

const OPENED: ToolInput = {
	title: z.string().describe(TITLE),
	icon: z.string().describe(OPENED_ICON),
	with: z.array(z.string()).describe(WITH),
	message: z.string().describe(MESSAGE),
}

const SAID: ToolInput = {
	conversation: z.string().describe(ROOM),
	message: z.string().describe(SPOKEN),
}

const ATTACHED: ToolInput = {
	path: z.string().describe(FILE_PATH),
	caption: z.string().optional().describe(CAPTION),
	conversation: z.string().optional().describe(ATTACH_ROOM),
}

const UPDATED: ToolInput = {
	conversation: z.string().optional().describe(UPDATED_CONVERSATION),
	title: z.string().optional().describe(UPDATED_TITLE),
	icon: z.string().optional().describe(UPDATED_ICON),
	colour: z.string().nullable().optional().describe(COLOUR),
	add: z.array(z.string()).optional().describe(ADD),
	remove: z.array(z.string()).optional().describe(REMOVE),
	archived: z.boolean().optional().describe(REOPEN),
}

const LISTED: ToolInput = {
	everywhere: z.boolean().optional().describe(EVERYWHERE),
	kind: z.string().optional().describe(KIND),
	limit: z.number().int().optional().describe(LIST_LIMIT),
	cursor: z.string().optional().describe(CURSOR),
}

const CONSULTED: ToolInput = {
	conversation: z.string().describe(READ_ROOM),
	limit: z.number().int().optional().describe(READ_LIMIT),
	before: z.number().int().optional().describe(BEFORE),
}

const SEARCHED: ToolInput = {
	query: z.string().describe(QUERY),
	kind: z.enum(["main", "topic", "mission"]).optional().describe(SEARCH_KIND),
}

const CLOSED: ToolInput = {
	conversation: z.string().describe(CLOSED_ROOM),
}

const DRAFTED: ToolInput = {
	name: z.string().describe(NAME),
	job: z.string().describe(JOB),
	description: z.string().describe(DESCRIPTION),
}

const asked = carriedTo(SUBTYPE)

type CompanionTool = SdkMcpToolDefinition<ToolInput>

export type AttachScope = {
	cwd: string
	floor: FloorScope
}

type AttachInput = {
	path: string
	caption?: string
	conversation?: string
}

const detailOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error)

const attached = async (
	session: string | undefined,
	{ cwd, floor }: AttachScope,
	{ path, ...rest }: AttachInput,
) => {
	const named = resolve(cwd, path)
	if (deniesRead(floor, named)) {
		return refused({ kind: "deniedPath", path })
	}
	let resolved: string
	try {
		resolved = await realpath(named)
	} catch (error) {
		return refused({ kind: "unreadableFile", path, detail: detailOf(error) })
	}
	if (deniesRead(floor, resolved)) {
		return refused({ kind: "deniedPath", path })
	}
	return asked(session, "conversationAttach", { path: resolved, ...rest })
}

export const companionTools = (
	session: string | undefined,
	scope: AttachScope,
): CompanionTool[] => [
	tool("companion_suggestions", SUGGESTIONS, NOTHING, () =>
		asked(session, "suggestions", {}),
	),
	tool("companion_create", CREATE, DRAFTED, (input) =>
		asked(session, "create", input),
	),
	tool("companion_first_run_done", FIRST_RUN_DONE, NOTHING, () =>
		asked(session, "firstRunDone", {}),
	),
	tool("companion_list", ROSTER, NOTHING, () => asked(session, "list", {})),
	tool("conversation_open", OPEN, OPENED, (input) =>
		asked(session, "conversationOpen", input),
	),
	tool("conversation_say", SAY, SAID, (input) =>
		asked(session, "conversationSay", input),
	),
	tool("conversation_attach", ATTACH, ATTACHED, (input) =>
		attached(session, scope, input as AttachInput),
	),
	tool("conversation_update", UPDATE, UPDATED, (input) =>
		asked(session, "conversationUpdate", input),
	),
	tool("conversation_list", LIST, LISTED, (input) =>
		asked(session, "conversationList", input),
	),
	tool("conversation_read", READ, CONSULTED, (input) =>
		asked(session, "conversationRead", input),
	),
	tool("conversation_search", SEARCH, SEARCHED, (input) =>
		asked(session, "conversationSearch", input),
	),
	tool("conversation_close", CLOSE, CLOSED, (input) =>
		asked(session, "conversationClose", input),
	),
]
