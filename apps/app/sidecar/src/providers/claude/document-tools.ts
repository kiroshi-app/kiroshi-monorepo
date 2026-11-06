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
	"Read an item of the Library of this Space by its name. A document answers its text as it stands now with what everyone has typed in it; to change a Markdown document, read its blocks with document_tree instead. A board answers its JSON Canvas text; an image is shown to you; an image too large to show answers its name, its type and its size."

const CREATE =
	"Create a new Markdown document in the Library of this Space, empty or filled from a template, shown in the Library of the person right away. A name already taken is refused. To change a document that already exists, edit its blocks with document_tree then document_replace_block or document_insert_after, never create another one. It answers the name the document stands under, its kind and its updatedAt."

const CREATED_NAME =
	"The name of the new document, ending in .md, such as minutes.md, without any folder."

const TEMPLATE =
	"One of meeting-notes, project-brief, decision-record or weekly-update to start the document from that template; left out, the document starts empty."

const NAME =
	"The name of the item in the Library of this Space, with its extension, such as notes.md."

const DOCUMENT_NAME =
	"The name of a Markdown document of the Library of this Space, such as notes.md."

const DOCUMENT_INFO =
	"Describe a Markdown document of the Library of this Space in one short answer: its name, its updatedAt in milliseconds since the epoch, how many blocks it holds and the id of its first heading, null when it has none. Call it first to size a document before you read its tree."

const DOCUMENT_TREE =
	"List the blocks of a Markdown document of the Library of this Space in order, as they stand now with what everyone has typed in it. Each block answers its id, its kind (heading, paragraph, list, checklist, quote, code, table, rule or image), its level for a heading, and its first words. Read the tree before you change a document: every other document tool targets a block by its id."

const DOCUMENT_READ_BLOCK =
	"Read one block of a Markdown document of the Library of this Space by its id, as document_tree answered it. It answers the kind of the block and its Markdown."

const DOCUMENT_INSERT_AFTER =
	"Write new blocks into a Markdown document of the Library of this Space, live, beside the people editing it, right after the block named in after, or at the start of the document when after is left out. To add at the end, name the id of the last block of document_tree. It answers the ids of the new blocks, in order."

const DOCUMENT_REPLACE_BLOCK =
	"Replace one block of a Markdown document of the Library of this Space with new Markdown, live, beside the people editing it: a new title, a rewritten paragraph or list. The first new block keeps the id of the block it replaces. Changing a document that already exists means editing it here in place, never creating a new one. It answers the id of every resulting block, in order."

const DOCUMENT_DELETE_BLOCK =
	"Remove blocks of a Markdown document of the Library of this Space by their ids, live, beside the people editing it. One id absent from the document refuses the whole call and nothing changes. It answers the ids removed."

const DOCUMENT_FIND =
	"Find the blocks of a Markdown document of the Library of this Space holding the text you give, whatever its case. It answers each matching block with its id, its kind and the first line of it that holds the text."

const BLOCK_ID =
	"The id of a block of the document, as document_tree answered it. An id absent from the document is refused and nothing changes."

const AFTER_BLOCK =
	"The id of the block the new blocks land right after, as document_tree answered it; left out, they land at the start of the document."

const BLOCKS_MARKDOWN =
	"The Markdown of one or more blocks, such as a heading, paragraphs, a list or a table, blocks apart by a blank line. Write no block id: each new block gets its own."

const DELETED_IDS =
	"The ids of the blocks to remove, as document_tree answered them."

const FOUND_TEXT = "The text to look for, matched whatever its case."

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

const HEADED =
	"Every answer also carries a header: the name of the board, its updatedAt and a hash of its content that changes whenever a node or an arrow changes and stays equal otherwise, so a hash other than the one you hold means someone drew on the board since."

const BOARD_CREATE = `Create a new empty board in the Library of this Space, shown in the Library of the person right away. A name already taken is refused and nothing is created. To draw on a board that already exists, write into it with board_write, never create another one. It answers the name the board stands under, its kind and its updatedAt. ${HEADED}`

const BOARD_NAME =
	"The name of the board in the Library of this Space, ending in .canvas, such as roadmap.canvas, without any folder."

const BOARD_INFO = `Orient on a board of the Library of this Space before reading it in detail, whoever drew on it. It answers how many nodes of each kind it holds, how many arrows, the bounds of all its nodes, and the id, label, x, y, width and height of every section at its top level. ${HEADED}`

const BOARD_TREE = `List the nodes of a board of the Library of this Space under a parent, the board itself or one of its sections, as they stand now with what everyone has drawn. Each node answers its id, its kind, an excerpt of its text of 60 characters at most (the label of a section, the file of an image or a libraryCard, the title or the url of a linkCard), its x, y, width and height, its z-order and its parent, the smallest section whose rectangle holds it. Given a depth, it stops that many levels down and answers for each node at that limit the count of its children it left out. It also lists every arrow whose two ends lie under that parent, with its id, its fromNode or fromPoint, its toNode or toPoint and its label. A parent absent from the board, or that is not a section, is refused with its id. ${HEADED}`

const PARENT =
	"The id of a section of the board, as board_tree answered it; left out, the board itself."

const DEPTH =
	"How many levels under the parent to list, 1 for its children alone; left out, every level."

const BOARD_NODE_INFO = `Read every JSON Canvas field of nodes and arrows of a board of the Library of this Space by id. A node answers its kind, x, y, width, height, z-order, text or label, color, fill, shape and any other field it carries, such as the file of an image: call board_view with its id to see an image. An arrow answers its fromNode or fromPoint, fromSide, fromAnchor, fromEnd, toNode or toPoint, toSide, toAnchor, toEnd, color, label, labelPosition, bend, routing and headSize. A field never set answers its default, or null. An id absent from the board refuses the whole call with that id. ${HEADED}`

const BOARD_CANVAS = `Read the JSON Canvas text of a board of the Library of this Space, or of one of its sections with every node the section holds and the arrows between them. ${HEADED}`

const BOARD_VIEW = `Show you an image node of a board of the Library of this Space as an image, whoever dropped it there. A node that is not an image, an image whose file is not in the Library of this Space, or an image too large to show is refused with the node id and the reason, the size and the limit for one too large, and nothing is shown. ${HEADED}`

const VIEWED_ID =
	"The id of an image node of the board, as board_tree answered it."

const BOARD_WRITE = `Write one group of nodes and arrows into a parent of a board of the Library of this Space, the board itself or one of its sections, landing at once for the people who have it open. Give every node a key of your own; place it at x and y, beside another node with place, or inside a section with section, and the board computes where it lands without covering another node. A node with no section lands inside the parent, which grows to hold it. An arrow names its ends with fromNode and toNode, each the key of a node of this call or the id of a node of the board, or leaves an end free at fromPoint or toPoint. An arrow without routing is an elbow tied on the sides of its two nodes that face each other. In replace mode, what the parent holds and every arrow tied to it are removed in the same change. An id absent from the board, or one invalid node or arrow, refuses the whole call with its element, its index and the reason, and nothing changes. It answers the id each key got. ${HEADED}`

const WRITE_MODE =
	"insert to add the group beside what the parent holds, replace to remove what the parent holds first."

const NODES =
	"The nodes to write, in order: each node without a place lands right of the one before it, inside the parent."

const KEY =
	"A name of your own for this node, unique in this call, that the place, the section and the arrows of this call use to point at it."

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
	"The key of a section of this call or the id of a section of the board the node lands inside; the section grows to hold it. Left out, the parent."

const ARROWS = "The arrows to write between the nodes."

const ARROW_KEY =
	"A name of your own for this arrow, unique in this call, to find its id in the answer."

const ARROW_NODE =
	"The node this end ties to: the key of a node of this call or the id of a node of the board."

const ARROW_SIDE =
	"One of top, right, bottom or left: the side of the node this end ties to; never with an anchor."

const ARROW_ANCHOR =
	"The exact point of the node this end ties to, x and y from 0 to 1 across it; never with a side."

const ARROW_POINT = "A free end at a board x and y, tied to no node."

const ARROW_END = "One of none or arrow: whether this end draws an arrowhead."

const ARROW_LABEL = "The text written on the arrow."

const LABEL_POSITION =
	"Where the label sits along the arrow, from 0 at its start to 1 at its end, 0.5 by default."

const BEND = "How far the arrow bows, in board units, 0 for none."

const ROUTING = "One of straight or elbow; left out on a new arrow, elbow."

const HEAD_SIZE = "One of small, medium or large."

const BOARD_UPDATE = `Change fields of nodes and of arrows of a board of the Library of this Space by id, drawn by you or by a person, every field a patch does not name kept as it stands, in one change the people who have it open see at once. x, y, width and height move and resize a node of any kind, an image and a libraryCard included; text, color, fill and shape apply only to a kind that carries them. Tying an end of an arrow to a node frees its point and the reverse; a side replaces an anchor and the reverse. An id absent from the board, or a field the node or the arrow refuses, refuses the whole call with its element, its index and the reason, and nothing changes. It answers the ids of the nodes and of the arrows changed. ${HEADED}`

const NODE_PATCHES =
	"The nodes to change, each by its id with the fields to set."

const ARROW_PATCHES =
	"The arrows to change, each by its id with the fields to set."

const NODE_ID = "The id of a node of the board, as board_tree answered it."

const ARROW_ID = "The id of an arrow of the board, as board_tree answered it."

const BOARD_MOVE = `Move nodes of a board of the Library of this Space into a parent, the board itself or one of its sections, the top left of their bounds landing at x and y. Every node keeps its id and every arrow stays tied to it; a moved section carries every node it holds by the same offset, and the target section grows to hold what lands in it. An id absent from the board, or a section moved into itself, refuses the whole call and nothing changes. It answers the ids of the nodes moved. ${HEADED}`

const MOVED_IDS = "The ids of the nodes to move, as board_tree answered them."

const TARGET =
	"The board x or y the top left of the bounds of the nodes lands at, given with its pair."

const BOARD_DUPLICATE = `Copy nodes of a board of the Library of this Space, with every node a copied section holds and every arrow whose two ends are copied, right of the originals clear of the other nodes, or with the top left of their bounds at x and y. An id absent from the board refuses the whole call and nothing changes. It answers each old node id and each old arrow id with the id of its copy. ${HEADED}`

const COPIED_IDS = "The ids of the nodes to copy, as board_tree answered them."

const BOARD_DELETE = `Remove nodes and arrows of any kind from a board of the Library of this Space by id, drawn by you or by a person, a section with every node it holds and every arrow tied to a removed node, in one change. An id absent from the board refuses the whole call with that id and nothing changes. It answers the ids of the nodes and of the arrows removed. ${HEADED}`

const REMOVED_NODES =
	"The ids of the nodes to remove, as board_tree answered them."

const REMOVED_ARROWS =
	"The ids of the arrows to remove, as board_tree answered them."

const BOARD_FIND = `Find the nodes of a board of the Library of this Space matching every criterion you give among the text they show, whatever its case, their kind, color, fill and shape. It answers their ids, lowest z-order first; given no criterion, every node. ${HEADED}`

const SHOWN_TEXT = "Words the node shows, its text or the label of a section."

const FOUND_KIND =
	"One of sticky, text, shape, section, image, linkCard or libraryCard."

const DETAILED_NODES =
	"The ids of the nodes to read, as board_tree answered them."

const DETAILED_ARROWS =
	"The ids of the arrows to read, as board_tree answered them."

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

const DOCUMENT_NAMED: ToolInput = { name: z.string().describe(DOCUMENT_NAME) }

const BLOCK_NAMED: ToolInput = {
	...DOCUMENT_NAMED,
	id: z.string().describe(BLOCK_ID),
}

const BLOCKS_INSERTED: ToolInput = {
	...DOCUMENT_NAMED,
	after: z.string().optional().describe(AFTER_BLOCK),
	markdown: z.string().describe(BLOCKS_MARKDOWN),
}

const BLOCK_REPLACED: ToolInput = {
	...BLOCK_NAMED,
	markdown: z.string().describe(BLOCKS_MARKDOWN),
}

const BLOCKS_DELETED: ToolInput = {
	...DOCUMENT_NAMED,
	ids: z.array(z.string()).describe(DELETED_IDS),
}

const BLOCKS_SOUGHT: ToolInput = {
	...DOCUMENT_NAMED,
	text: z.string().describe(FOUND_TEXT),
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

const PAIR = z.object({ x: z.number(), y: z.number() }).strict()

const arrowEnd = (end: "from" | "to") => ({
	[`${end}Node`]: z.string().optional().describe(ARROW_NODE),
	[`${end}Side`]: z.string().optional().describe(ARROW_SIDE),
	[`${end}Anchor`]: PAIR.optional().describe(ARROW_ANCHOR),
	[`${end}Point`]: PAIR.optional().describe(ARROW_POINT),
	[`${end}End`]: z.string().optional().describe(ARROW_END),
})

const ARROW_FIELDS = {
	...arrowEnd("from"),
	...arrowEnd("to"),
	color: z.string().optional().describe(COLOR),
	label: z.string().optional().describe(ARROW_LABEL),
	labelPosition: z.number().optional().describe(LABEL_POSITION),
	bend: z.number().optional().describe(BEND),
	routing: z.string().optional().describe(ROUTING),
	headSize: z.string().optional().describe(HEAD_SIZE),
}

const PARENTED: ToolInput = {
	...BOARD_NAMED,
	parent: z.string().optional().describe(PARENT),
}

const TREED: ToolInput = {
	...PARENTED,
	depth: z.number().int().min(1).optional().describe(DEPTH),
}

const DETAILED: ToolInput = {
	...BOARD_NAMED,
	nodes: z.array(z.string()).optional().describe(DETAILED_NODES),
	arrows: z.array(z.string()).optional().describe(DETAILED_ARROWS),
}

const WRITTEN_GROUP: ToolInput = {
	...PARENTED,
	mode: z.enum(["insert", "replace"]).describe(WRITE_MODE),
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
		.optional()
		.describe(NODES),
	arrows: z
		.array(
			z
				.object({
					key: z.string().optional().describe(ARROW_KEY),
					...ARROW_FIELDS,
				})
				.strict(),
		)
		.optional()
		.describe(ARROWS),
}

const PATCHED: ToolInput = {
	...BOARD_NAMED,
	nodes: z
		.array(
			z
				.object({ id: z.string().describe(NODE_ID), ...LOOK, ...GEOMETRY })
				.strict(),
		)
		.optional()
		.describe(NODE_PATCHES),
	arrows: z
		.array(
			z.object({ id: z.string().describe(ARROW_ID), ...ARROW_FIELDS }).strict(),
		)
		.optional()
		.describe(ARROW_PATCHES),
}

const MOVED: ToolInput = {
	...BOARD_NAMED,
	nodes: z.array(z.string()).describe(MOVED_IDS),
	parent: z.string().optional().describe(PARENT),
	x: z.number().int().describe(TARGET),
	y: z.number().int().describe(TARGET),
}

const DUPLICATED: ToolInput = {
	...BOARD_NAMED,
	nodes: z.array(z.string()).describe(COPIED_IDS),
	x: z.number().int().optional().describe(TARGET),
	y: z.number().int().optional().describe(TARGET),
}

const DELETED: ToolInput = {
	...BOARD_NAMED,
	nodes: z.array(z.string()).optional().describe(REMOVED_NODES),
	arrows: z.array(z.string()).optional().describe(REMOVED_ARROWS),
}

const SOUGHT: ToolInput = {
	...BOARD_NAMED,
	text: z.string().optional().describe(SHOWN_TEXT),
	kind: z.string().optional().describe(FOUND_KIND),
	color: z.string().optional().describe(COLOR),
	fill: z.string().optional().describe(FILL),
	shape: z.string().optional().describe(SHAPE),
}

const VIEWED: ToolInput = {
	...BOARD_NAMED,
	id: z.string().describe(VIEWED_ID),
}

type ImageRead = {
	form: "image"
	mimeType: string
	content: string
	header?: unknown
}

const isImageRead = (answer: unknown): answer is ImageRead =>
	(answer as ImageRead | null)?.form === "image"

const headerOf = ({ header }: ImageRead) =>
	header === undefined
		? []
		: [{ type: "text" as const, text: JSON.stringify({ header }) }]

const shownToTheModel = (answer: unknown) =>
	isImageRead(answer)
		? {
				content: [
					{
						type: "image" as const,
						data: answer.content,
						mimeType: answer.mimeType,
					},
					...headerOf(answer),
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
	tool("document_info", DOCUMENT_INFO, DOCUMENT_NAMED, (input) =>
		asked(session, "documentInfo", input),
	),
	tool("document_tree", DOCUMENT_TREE, DOCUMENT_NAMED, (input) =>
		asked(session, "documentTree", input),
	),
	tool("document_read_block", DOCUMENT_READ_BLOCK, BLOCK_NAMED, (input) =>
		asked(session, "documentReadBlock", input),
	),
	tool(
		"document_insert_after",
		DOCUMENT_INSERT_AFTER,
		BLOCKS_INSERTED,
		(input) => asked(session, "documentInsertAfter", input),
	),
	tool(
		"document_replace_block",
		DOCUMENT_REPLACE_BLOCK,
		BLOCK_REPLACED,
		(input) => asked(session, "documentReplaceBlock", input),
	),
	tool(
		"document_delete_block",
		DOCUMENT_DELETE_BLOCK,
		BLOCKS_DELETED,
		(input) => asked(session, "documentDeleteBlock", input),
	),
	tool("document_find", DOCUMENT_FIND, BLOCKS_SOUGHT, (input) =>
		asked(session, "documentFind", input),
	),
	tool("board_create", BOARD_CREATE, BOARD_NAMED, (input) =>
		asked(session, "boardCreate", input),
	),
	tool("board_info", BOARD_INFO, BOARD_NAMED, (input) =>
		asked(session, "boardInfo", input),
	),
	tool("board_tree", BOARD_TREE, TREED, (input) =>
		asked(session, "boardTree", input),
	),
	tool("board_node_info", BOARD_NODE_INFO, DETAILED, (input) =>
		asked(session, "boardNodeInfo", input),
	),
	tool("board_canvas", BOARD_CANVAS, PARENTED, (input) =>
		asked(session, "boardCanvas", input),
	),
	tool("board_write", BOARD_WRITE, WRITTEN_GROUP, (input) =>
		asked(session, "boardWrite", input),
	),
	tool("board_update", BOARD_UPDATE, PATCHED, (input) =>
		asked(session, "boardUpdate", input),
	),
	tool("board_move", BOARD_MOVE, MOVED, (input) =>
		asked(session, "boardMove", input),
	),
	tool("board_duplicate", BOARD_DUPLICATE, DUPLICATED, (input) =>
		asked(session, "boardDuplicate", input),
	),
	tool("board_delete", BOARD_DELETE, DELETED, (input) =>
		asked(session, "boardDelete", input),
	),
	tool("board_find", BOARD_FIND, SOUGHT, (input) =>
		asked(session, "boardFind", input),
	),
	tool("board_view", BOARD_VIEW, VIEWED, (input) =>
		read(session, "boardView", input),
	),
]
