import { realpath } from "node:fs/promises"
import { resolve } from "node:path"

import { type SdkMcpToolDefinition, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

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

const INVITE =
	"Bring a companion of this space into this conversation before you mention it."

const INVITEE = "The id or the name of the companion to bring in."

const TARGET =
	"The id of a room you sit in to bring the companion into, left out for this conversation."

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
	"Show an image file to the person, in this conversation or in a room you hold a seat in, once you want them to see it rather than only read it yourself."

const IMAGE_PATH =
	"The path of the image file to show, absolute or relative to your working directory."

const CAPTION = "A line read right above the image."

const ATTACH_ROOM =
	"The id of a room you hold a seat in to show it there, left out for this conversation."

const DESCRIBE =
	"Give a room you hold a seat in an icon or a colour, once the person asks for one or once its topic calls for one."

const DESCRIBED_ROOM = "The id of the room you hold a seat in to describe."

const ICON =
	"The name of a Keyline icon drawn beside the title of the room, such as Rocket, spelled as listed in packages/shared/conversation-icons.json, left out to keep the one it wears. A name off that list is refused with the accepted names."

const COLOUR =
	"One of red, yellow, green, cyan, blue, purple, pink or orange, null to give the room back its default colour, left out to keep the one it wears."

type ToolInput = Record<string, z.ZodType>

const NOTHING: ToolInput = {}

const NAMED: ToolInput = {
	companion: z.string().describe(INVITEE),
	conversation: z.string().optional().describe(TARGET),
}

const OPENED: ToolInput = {
	title: z.string().describe(TITLE),
	with: z.array(z.string()).describe(WITH),
	message: z.string().describe(MESSAGE),
}

const SAID: ToolInput = {
	conversation: z.string().describe(ROOM),
	message: z.string().describe(SPOKEN),
}

const ATTACHED: ToolInput = {
	path: z.string().describe(IMAGE_PATH),
	caption: z.string().optional().describe(CAPTION),
	conversation: z.string().optional().describe(ATTACH_ROOM),
}

const DESCRIBED: ToolInput = {
	conversation: z.string().describe(DESCRIBED_ROOM),
	icon: z.string().optional().describe(ICON),
	colour: z.string().nullable().optional().describe(COLOUR),
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
	tool("companion_invite", INVITE, NAMED, (input) =>
		asked(session, "invite", input),
	),
	tool("conversation_open", OPEN, OPENED, (input) =>
		asked(session, "conversationOpen", input),
	),
	tool("conversation_say", SAY, SAID, (input) =>
		asked(session, "conversationSay", input),
	),
	tool("conversation_attach", ATTACH, ATTACHED, (input) =>
		attached(session, scope, input as AttachInput),
	),
	tool("conversation_describe", DESCRIBE, DESCRIBED, (input) =>
		asked(session, "conversationDescribe", input),
	),
]
