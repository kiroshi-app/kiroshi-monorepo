import { type SdkMcpToolDefinition, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { type AttachScope, onReadablePath } from "./companion-tools"
import { carriedTo, spoken } from "./host-calls"

const SUBTYPE = "library"

const LIST =
	"List the items of the Library of this Space, the latest update first, each with its name, its kind (document, image or board) and its updatedAt in milliseconds since the epoch, before you read, write, rename or delete one whose name you do not hold."

const KIND =
	"One of document, image or board to list only that kind; left out, every kind is listed."

const LIMIT = "How many items to answer, from 1 to 200; left out, 50."

const CURSOR =
	"The cursor the previous library_list answered, to list the page after it; left out, the list starts at the latest update, and a null cursor in the answer marks the last page."

const SEARCH =
	"Find the items of the Library of this Space whose name, document text or board text holds the words you give, whatever their case, each with its name, its kind and its updatedAt, the latest update first; an empty list means nothing in this Library matched, and no other Space is ever searched."

const QUERY = "The words to look for, matched whatever their case."

const READ =
	"Read an item of the Library of this Space by its name. A document answers its text as it stands now with what everyone has typed in it; a board answers its JSON Canvas text; an image is shown to you; an image too large to show answers its name, its type and its size."

const CREATE =
	"Create a new Markdown document in the Library of this Space, empty or filled from a template, shown in the Library of the person right away. A name already taken is refused. To change a document that already exists, write in it with library_write, never create another one. It answers the name the document stands under, its kind and its updatedAt."

const CREATED_NAME =
	"The name of the new document, ending in .md, such as minutes.md, without any folder."

const TEMPLATE =
	"One of meeting-notes, project-brief, decision-record or weekly-update to start the document from that template; left out, the document starts empty."

const WRITE =
	"Write into a Markdown document of the Library of this Space, live, beside the people editing it. Changing a document that already exists, such as its title or a section, means editing it here in place, never creating a new one. The text lands at the end of the document, right after the passage named in after, in place of the passage named in replace, or in place of the whole text when whole is true; give one of them at most. It answers the name the document stands under and how many characters you wrote."

const NAME =
	"The name of the item in the Library of this Space, with its extension, such as notes.md."

const TEXT =
	"The Markdown to write, with the line breaks it needs to stand on its own lines. With replace, an empty text removes the passage."

const AFTER =
	"An exact passage of the document, copied from library_read, that occurs once in it: the text lands right after it. Leave it out to write at the end."

const REPLACE =
	"An exact passage of the document, copied from library_read, that occurs once in it: the text takes its place and every other character stays. A passage found zero times or more than once is refused with its count and nothing changes."

const WHOLE =
	"True to replace the whole text of the document with the text, under the same name."

const IMPORT =
	"Copy a file you produced into the Library of this Space, a Markdown or text document, a JSON Canvas board ending in .canvas or a PNG, JPEG, GIF or WebP image. Left without overwrite, it lands under its own name, a number added when that name is taken. Changing an item that already exists, such as an image you imported before, means naming it in overwrite so the file replaces it in place, never adding a new one. It answers the name the item stands under, its kind and its updatedAt."

const OVERWRITE =
	"The name of an item of this Library the file replaces in place, such as chart.png: a document for a document, an image of the same format for an image; a board is never replaced. A name absent from this Library or of another kind is refused and nothing changes. Leave it out to add a new item."

const PATH =
	"The path of the file to copy, absolute or relative to your working directory."

const RENAME =
	"Rename a document of the Library of this Space, keeping its extension, as the person renames it: the people editing it follow it under the new name, a number added when that name is taken. It answers the name it landed under, its kind and its updatedAt."

const NEW_NAME =
	"The new name of the document, with the same extension, without any folder."

const DELETE =
	"Delete an item of the Library of this Space for everyone, with its thumbnail and its shared editing state, once the person asked you to remove it. It can't be undone. It answers the name of the item deleted."

const POST_DOCUMENT =
	"Post a document or a board of the Library of this Space in this conversation, as a message of yours the person opens it from, once you want them to read it. A name that is not a document or a board of this Library is refused and nothing is posted. It answers the name of the item, the id of this conversation and the id of the message."

const BOARD_CREATE =
	"Create a new empty board in the Library of this Space, shown in the Library of the person right away. A name already taken is refused and nothing is created. To draw on a board that already exists, add to it with board_add, never create another one. It answers the name the board stands under, its kind and its updatedAt."

const BOARD_NAME =
	"The name of the board in the Library of this Space, ending in .canvas, such as roadmap.canvas, without any folder."

const BOARD_READ =
	"Read a board of the Library of this Space as it stands now with what everyone has drawn on it. It answers every node with its id, its kind, its x, y, width and height, its text (the label of a section) and the id of the section that holds it, and every edge with its id, its fromNode, its toNode and its label."

const BOARD_ADD =
	"Draw a whole diagram on a board of the Library of this Space in one call, landing at once for the people who have it open. Give every node a key of your own; place a node beside another one, of this call by its key or of the board by its id, or inside a section, and the board computes where it lands without covering another node. A node without a place lands right of the node before it, the first one right of everything on the board. An edge joins two nodes named by key or id. One invalid node or edge refuses the whole call with its index and the reason, and nothing changes. It answers the id each key got."

const NODES =
	"The nodes to draw, in order: each node without a place lands right of the one before it."

const KEY =
	"A name of your own for this node, unique in this call, that the place, the section and the edges of this call use to point at it."

const NODE_KIND = "One of sticky, text, shape or section."

const NODE_TEXT = "The text the node shows; for a section, its label."

const COLOR = "A colour, a preset from 1 to 6 or a hex such as #4a90d9."

const FILL = "For a sticky only, one of yellow, green, pink, blue or orange."

const SHAPE = "For a shape only, one of rectangle, ellipse or diamond."

const COORDINATE =
	"An exact board coordinate, given with its pair; left out, the board places the node."

const SIZE = "In board units; left out, the default size of the kind."

const PLACE =
	"Where the node lands next to another one, at a fixed gap and centred on it."

const SIDE = "One of right, left, below or above."

const OF =
	"The key of a node of this call or the id of a node of the board the node lands beside."

const SECTION =
	"The key of a section of this call or the id of a section of the board the node lands inside; the section grows to hold it."

const EDGES = "The edges to draw between the nodes."

const ENDPOINT =
	"The key of a node of this call or the id of a node of the board."

const EDGE_LABEL = "The text written on the edge."

const BOARD_UPDATE =
	"Change fields of nodes of a board of the Library of this Space, every other field kept as it stands, in one change the people who have it open see at once. An id absent from the board or a field the node refuses refuses the whole call with its index and the reason, and nothing changes. It answers the ids of the nodes changed."

const CHANGES = "The nodes to change, each by its id with the fields to set."

const NODE_ID = "The id of a node of the board, as board_read answered it."

const BOARD_REMOVE =
	"Remove nodes from a board of the Library of this Space, with every edge attached to them, in one change. An id absent from the board refuses the whole call with its index and nothing changes. It answers the ids of the nodes and of the edges removed."

const REMOVED_IDS =
	"The ids of the nodes to remove, as board_read answered them."

type ToolInput = Record<string, z.ZodType>

const LISTED: ToolInput = {
	kind: z.enum(["document", "image", "board"]).optional().describe(KIND),
	limit: z.number().int().optional().describe(LIMIT),
	cursor: z.string().optional().describe(CURSOR),
}

const SEARCHED: ToolInput = { query: z.string().describe(QUERY) }

const NAMED: ToolInput = { name: z.string().describe(NAME) }

const CREATED: ToolInput = {
	name: z.string().describe(CREATED_NAME),
	template: z
		.enum([
			"meeting-notes",
			"project-brief",
			"decision-record",
			"weekly-update",
		])
		.optional()
		.describe(TEMPLATE),
}

const WRITTEN: ToolInput = {
	...NAMED,
	text: z.string().describe(TEXT),
	after: z.string().describe(AFTER).optional(),
	replace: z.string().describe(REPLACE).optional(),
	whole: z.boolean().describe(WHOLE).optional(),
}

const IMPORTED: ToolInput = {
	path: z.string().describe(PATH),
	overwrite: z.string().describe(OVERWRITE).optional(),
}

const RENAMED: ToolInput = {
	...NAMED,
	newName: z.string().describe(NEW_NAME),
}

const BOARD_NAMED: ToolInput = { name: z.string().describe(BOARD_NAME) }

const LOOK = {
	text: z.string().optional().describe(NODE_TEXT),
	color: z.string().optional().describe(COLOR),
	fill: z.string().optional().describe(FILL),
	shape: z.string().optional().describe(SHAPE),
}

const GEOMETRY = {
	x: z.number().int().optional().describe(COORDINATE),
	y: z.number().int().optional().describe(COORDINATE),
	width: z.number().int().optional().describe(SIZE),
	height: z.number().int().optional().describe(SIZE),
}

const DRAWN: ToolInput = {
	...BOARD_NAMED,
	nodes: z
		.array(
			z
				.object({
					key: z.string().describe(KEY),
					kind: z.string().describe(NODE_KIND),
					...LOOK,
					...GEOMETRY,
					place: z
						.object({
							side: z.string().describe(SIDE),
							of: z.string().describe(OF),
						})
						.strict()
						.optional()
						.describe(PLACE),
					section: z.string().optional().describe(SECTION),
				})
				.strict(),
		)
		.describe(NODES),
	edges: z
		.array(
			z
				.object({
					from: z.string().describe(ENDPOINT),
					to: z.string().describe(ENDPOINT),
					label: z.string().optional().describe(EDGE_LABEL),
				})
				.strict(),
		)
		.optional()
		.describe(EDGES),
}

const CHANGED: ToolInput = {
	...BOARD_NAMED,
	nodes: z
		.array(
			z
				.object({ id: z.string().describe(NODE_ID), ...LOOK, ...GEOMETRY })
				.strict(),
		)
		.describe(CHANGES),
}

const REMOVED: ToolInput = {
	...BOARD_NAMED,
	ids: z.array(z.string()).describe(REMOVED_IDS),
}

type ImageRead = { form: "image"; mimeType: string; content: string }

const isImageRead = (answer: unknown): answer is ImageRead =>
	(answer as ImageRead | null)?.form === "image"

const shownToTheModel = (answer: unknown) =>
	isImageRead(answer)
		? {
				content: [
					{
						type: "image" as const,
						data: answer.content,
						mimeType: answer.mimeType,
					},
				],
			}
		: spoken(answer)

const asked = carriedTo(SUBTYPE)

const read = carriedTo(SUBTYPE, shownToTheModel)

type ImportInput = { path: string }

export const libraryTools = (
	session: string | undefined,
	scope: AttachScope,
): SdkMcpToolDefinition<ToolInput>[] => [
	tool("library_list", LIST, LISTED, (input) => asked(session, "list", input)),
	tool("library_search", SEARCH, SEARCHED, (input) =>
		asked(session, "search", input),
	),
	tool("library_read", READ, NAMED, (input) => read(session, "read", input)),
	tool("library_create", CREATE, CREATED, (input) =>
		asked(session, "create", input),
	),
	tool("library_write", WRITE, WRITTEN, (input) =>
		asked(session, "write", input),
	),
	tool("library_import", IMPORT, IMPORTED, (input) =>
		onReadablePath(scope, (input as ImportInput).path, (path) =>
			asked(session, "import", { ...input, path }),
		),
	),
	tool("library_rename", RENAME, RENAMED, (input) =>
		asked(session, "rename", input),
	),
	tool("library_delete", DELETE, NAMED, (input) =>
		asked(session, "delete", input),
	),
	tool("conversation_post_document", POST_DOCUMENT, NAMED, (input) =>
		asked(session, "postDocument", input),
	),
	tool("board_create", BOARD_CREATE, BOARD_NAMED, (input) =>
		asked(session, "boardCreate", input),
	),
	tool("board_read", BOARD_READ, BOARD_NAMED, (input) =>
		asked(session, "boardRead", input),
	),
	tool("board_add", BOARD_ADD, DRAWN, (input) =>
		asked(session, "boardAdd", input),
	),
	tool("board_update", BOARD_UPDATE, CHANGED, (input) =>
		asked(session, "boardUpdate", input),
	),
	tool("board_remove", BOARD_REMOVE, REMOVED, (input) =>
		asked(session, "boardRemove", input),
	),
]
