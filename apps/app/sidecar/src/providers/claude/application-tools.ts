import { type SdkMcpToolDefinition, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { carriedTo } from "./host-calls"

const SUBTYPE = "application"

const SEARCH =
	"Find the applications matching what the person asked for, the curated ones first, before you install any of them."

const INSTALL =
	"Install one application answered by application_search in the one destination the person picked, once they have picked it."

const STATUS =
	"Read where an application stands in one destination, when the person asks whether it is installed or connected."

const QUERY =
	"The words the person used for the application, its name or what it should do."

const APPLICATION =
	"The exact name application_search answered for the application."

const SCOPE =
	"The destination the person picked: companion (you alone), space or user."

type ToolInput = Record<string, z.ZodType>

const SEARCHED: ToolInput = {
	query: z.string().describe(QUERY),
}

const NAMED: ToolInput = {
	application: z.string().describe(APPLICATION),
	scope: z.enum(["companion", "space", "user"]).describe(SCOPE),
}

const asked = carriedTo(SUBTYPE)

type ApplicationTool = SdkMcpToolDefinition<ToolInput>

export const applicationTools = (
	session: string | undefined,
): ApplicationTool[] => [
	tool("application_search", SEARCH, SEARCHED, (input) =>
		asked(session, "search", input),
	),
	tool("application_install", INSTALL, NAMED, (input) =>
		asked(session, "install", input),
	),
	tool("application_status", STATUS, NAMED, (input) =>
		asked(session, "status", input),
	),
]
