import { type SdkMcpToolDefinition, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { carriedTo } from "./host-calls"

const SUBTYPE = "routine"

const TITLE = "A short name the person will recognise in the Routines panel."

const INSTRUCTION =
	"What you carry out when this routine fires, written as an order to yourself."

const TRIGGER_SOURCE_ID =
	"The id of a source routine_trigger_sources answers, never one you invented."

const TRIGGER_CONFIG =
	"What the chosen source needs to fire, such as { expression: '0 8 * * 1-5' } for schedule."

const FILTER =
	"Which events run this routine. Leave it out to run on every event of the source."

const ROUTINE_ID = "The id of a routine routine_list answers."

const IS_ENABLED =
	"Whether the routine fires. Turn it off instead of deleting it."

const LIST =
	"Read every routine of this conversation, whichever agent here owns it. Read this before creating one, so you update what already covers the need instead of adding beside it."

const TRIGGER_SOURCES =
	"Read what can fire a routine here and, for each source, the fields its events carry. Read this before creating or filtering a routine."

const CREATE =
	"Create a routine of this conversation, owned by you. Confirm the schedule and the task with the person, in their own words, before calling this."

const UPDATE =
	"Rewrite a routine of this conversation, every field at once. Read it with routine_list first and send back what you are not changing."

const RUN_NOW =
	"Run a routine once, right now, without waiting for its trigger. Its report lands in this conversation like any other run."

const DELETE =
	"Delete a routine and its run history. Ask the person first, and offer to turn it off instead when they only want it to stop for now."

const FILTER_ROW = z.object({
	field: z.string(),
	operator: z.string(),
	value: z.unknown().optional(),
})

const EVENT_FILTER = z
	.object({ matchMode: z.enum(["all", "any"]), rows: z.array(FILTER_ROW) })
	.describe(FILTER)

const DRAFT = {
	title: z.string().describe(TITLE),
	instruction: z.string().describe(INSTRUCTION),
	triggerConfig: z.record(z.string(), z.unknown()).describe(TRIGGER_CONFIG),
}

type ToolInput = Record<string, z.ZodType>

const NOTHING: ToolInput = {}

const NAMED: ToolInput = { id: z.string().describe(ROUTINE_ID) }

const CREATED: ToolInput = {
	...DRAFT,
	triggerSourceId: z.string().describe(TRIGGER_SOURCE_ID),
	filter: EVENT_FILTER.optional(),
}

const EDITED: ToolInput = {
	...DRAFT,
	id: z.string().describe(ROUTINE_ID),
	filter: EVENT_FILTER,
	isEnabled: z.boolean().describe(IS_ENABLED),
}

const asked = carriedTo(SUBTYPE)

type RoutineTool = SdkMcpToolDefinition<ToolInput>

export const routineTools = (session: string | undefined): RoutineTool[] => [
	tool("routine_list", LIST, NOTHING, () => asked(session, "list", {})),
	tool("routine_trigger_sources", TRIGGER_SOURCES, NOTHING, () =>
		asked(session, "triggerSources", {}),
	),
	tool("routine_create", CREATE, CREATED, (input) =>
		asked(session, "create", input),
	),
	tool("routine_update", UPDATE, EDITED, (input) =>
		asked(session, "update", input),
	),
	tool("routine_run_now", RUN_NOW, NAMED, (input) =>
		asked(session, "runNow", input),
	),
	tool("routine_delete", DELETE, NAMED, (input) =>
		asked(session, "delete", input),
	),
]
