import { type SdkMcpToolDefinition, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { carriedTo } from "./host-calls"

const SUBTYPE = "library"

const LIST =
	"List the comment threads people and agents opened on an item of the Library of this Space, a document, an image or a board, in the order they were opened. Each thread answers its threadId, its state (open or resolved), its target (a block or a passage of a document, a point or a zone of an image, a node or a point of a board), whether that target is gone from the item, how many comments it holds and the first words of its opening comment. An item nobody commented answers an empty list."

const READ =
	"Read one comment thread of an item of the Library of this Space by its threadId, as comment_list answered it. It answers the name and the kind of the item, the state of the thread, its target with the text of the block it points at for a document, and every comment in order with its author, its text and the people and agents it mentions."

const REPLY =
	"Reply in a comment thread of an item of the Library of this Space, as a comment of yours the people of the Space read under your name beside the item. Reply once the work the thread asks for is done, or to say why it is not. A threadId absent from the item, or a blank text, is refused and nothing is written. It answers the threadId and how many comments the thread holds now."

const NAME =
	"The name of the item in the Library of this Space, with its extension, such as notes.md."

const THREAD_ID =
	"The id of a comment thread of the item, as comment_list answered it."

const TEXT = "The text of your comment, in plain words."

type ToolInput = Record<string, z.ZodType>

const NAMED: ToolInput = { name: z.string().describe(NAME) }

const THREAD_NAMED: ToolInput = {
	...NAMED,
	threadId: z.string().describe(THREAD_ID),
}

const REPLIED: ToolInput = {
	...THREAD_NAMED,
	text: z.string().describe(TEXT),
}

const asked = carriedTo(SUBTYPE)

export const commentTools = (
	session: string | undefined,
): SdkMcpToolDefinition<ToolInput>[] => [
	tool("comment_list", LIST, NAMED, (input) =>
		asked(session, "commentList", input),
	),
	tool("comment_read", READ, THREAD_NAMED, (input) =>
		asked(session, "commentRead", input),
	),
	tool("comment_reply", REPLY, REPLIED, (input) =>
		asked(session, "commentReply", input),
	),
]
