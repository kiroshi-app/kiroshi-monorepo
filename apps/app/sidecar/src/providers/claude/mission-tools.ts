import { type SdkMcpToolDefinition, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { carriedTo } from "./host-calls"

const SUBTYPE = "mission"

const OBJECTIVE =
	"What this mission delivers, in one sentence, written as an order to yourself."

const TICKET_PLATFORM = "Where the ticket holding this objective lives."

const TICKET_EXTERNAL_ID = "The id the ticket carries on its own platform."

const TICKET_URL = "The address the person opens to read the ticket."

const TICKET_TITLE = "The title the ticket carries on its own platform."

const TOOLS = "What this mission is allowed to reach for to meet its objective."

const MISSION_ID = "The id of the mission this lands on."

const LINE =
	"One line of progress, written for the person who reads the thread."

const STATUS_TEXT =
	"Where the mission stands, what moved since the last status, what is waiting and on whom, in a few plain lines."

const QUESTION =
	"The one question the person has to answer for you to carry on."

const REASON = "Why you cannot decide it yourself."

const OUTCOME =
	"done when the objective is reached, failed when it is given up."

const SUMMARY = "What came out of the mission, in a few lines."

const BRANCH =
	"The branch this mission lands its work in, such as feature/ope-37."

const REPOSITORY =
	"The repository that branch lives in, written owner then slash then name."

const WORKSPACE_PATH =
	"The git checkout on this computer the work of the mission happens in, a linked worktree included. Only a git checkout is accepted, so the path names a directory holding a .git entry and nothing else is taken. A path given arms the agent hook in that checkout, so what an agent does there reaches the thread of the mission. Left out, the mission moves only on the lines, the escalations and the closing you write."

const OPEN =
	"Open a mission on this conversation, owned by you, and get its own thread with one line telling whether that mission hears its agent. Given the checkout the work happens in, the agent hook is armed there in the same call. The work of the mission carries on in the thread it answers, so end the turn you are answering in with a single line of acknowledgement and nothing more. Call this once you and the person agree on the objective and the ticket it carries."

const NOTE =
	"Record one line of progress on a mission of yours. Write what moved, not what you are about to do."

const STATUS =
	"Write the status of a mission of yours, every time you stop working on it, whether the work is over or only paused. It is read by whoever follows the conversation the mission came from, who saw none of the work, so it holds on its own and names whoever moves next."

const ESCALATE =
	"Hand a mission back to the person with the one question that blocks you. The mission waits until they answer."

const CLOSE =
	"Close a mission of yours, its objective reached or given up, with a summary of where it landed. Nothing can be appended to it afterwards."

const WATCH =
	"Arm a mission of yours on the branch it lands its work in, so what happens on that branch reaches its thread. It answers the address a call reaches the mission at, the key that call carries and the name of the header that key goes in. Call this once the branch exists."

const LIST =
	"Read the missions of yours this conversation still carries, each with its id, its ticket and where it stands. Read this when you no longer hold the id of a mission."

const TICKET = z.object({
	platform: z.string().describe(TICKET_PLATFORM),
	externalId: z.string().describe(TICKET_EXTERNAL_ID),
	url: z.string().describe(TICKET_URL),
	title: z.string().describe(TICKET_TITLE),
})

type ToolInput = Record<string, z.ZodType>

const NOTHING: ToolInput = {}

const NAMED: ToolInput = { id: z.string().describe(MISSION_ID) }

const OPENED: ToolInput = {
	objective: z.string().describe(OBJECTIVE),
	ticket: TICKET,
	tools: z.array(z.string()).describe(TOOLS),
	workspacePath: z.string().describe(WORKSPACE_PATH).optional(),
}

const NOTED: ToolInput = { ...NAMED, line: z.string().describe(LINE) }

const STATED: ToolInput = {
	...NAMED,
	text: z.string().describe(STATUS_TEXT),
}

const ESCALATED: ToolInput = {
	...NAMED,
	question: z.string().describe(QUESTION),
	reason: z.string().describe(REASON),
}

const CLOSED: ToolInput = {
	...NAMED,
	outcome: z.enum(["done", "failed"]).describe(OUTCOME),
	summary: z.string().describe(SUMMARY),
}

const ARMED: ToolInput = {
	...NAMED,
	branch: z.string().describe(BRANCH),
	repository: z.string().describe(REPOSITORY),
}

const asked = carriedTo(SUBTYPE)

type MissionTool = SdkMcpToolDefinition<ToolInput>

export const missionTools = (session: string | undefined): MissionTool[] => [
	tool("mission_open", OPEN, OPENED, (input) => asked(session, "open", input)),
	tool("mission_note", NOTE, NOTED, (input) => asked(session, "note", input)),
	tool("mission_status", STATUS, STATED, (input) =>
		asked(session, "status", input),
	),
	tool("mission_escalate", ESCALATE, ESCALATED, (input) =>
		asked(session, "escalate", input),
	),
	tool("mission_close", CLOSE, CLOSED, (input) =>
		asked(session, "close", input),
	),
	tool("mission_watch", WATCH, ARMED, (input) =>
		asked(session, "watch", input),
	),
	tool("mission_list", LIST, NOTHING, () => asked(session, "list", {})),
]
