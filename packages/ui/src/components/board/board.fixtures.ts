import { ROOFTOP_POOL } from "@workspace/ui/components/answer-blocks/answer-blocks.fixtures"
import type { BoardLibraryCardProps } from "@workspace/ui/components/board/board-library-card"
import type { BoardLinkCardProps } from "@workspace/ui/components/board/board-link-card"
import type { BoardStickyAuthor } from "@workspace/ui/components/board/board-sticky"

export const AGENT_AUTHOR: BoardStickyAuthor = {
	kind: "agent",
	name: "Juniper",
	hue: 257,
}

export const PERSON_AUTHOR: BoardStickyAuthor = {
	kind: "person",
	name: "Ada Martin",
}

export const STICKY_TEXT = "Draft the launch plan before Friday"

export const LINK_CARD: BoardLinkCardProps = {
	preview: ROOFTOP_POOL,
	title: "Designing calm interfaces for busy teams",
	description:
		"How quiet defaults, fewer modes and honest empty states keep a shared workspace readable as it grows.",
	domain: "example.com",
}

export const LIBRARY_DOCUMENT: BoardLibraryCardProps = {
	title: "Launch brief",
	excerpt:
		"What we’re making, who it’s for and why it matters now. The outcome this work commits to.",
}
