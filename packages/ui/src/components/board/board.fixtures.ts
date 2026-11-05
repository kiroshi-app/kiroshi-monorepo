import { ROOFTOP_POOL } from "@workspace/ui/components/answer-blocks/answer-blocks.fixtures"
import type { BoardLibraryCardProps } from "@workspace/ui/components/board/board-library-card"
import type { BoardLinkCardProps } from "@workspace/ui/components/board/board-link-card"
import type { BoardSnapshot } from "@workspace/ui/components/board/board-miniature"
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

export const PLANNING_BOARD_SNAPSHOT: BoardSnapshot = {
	bounds: { x: -40, y: 0, width: 820, height: 260 },
	objects: [
		{
			kind: "section",
			x: -40,
			y: 0,
			width: 440,
			height: 260,
			props: { tint: "blue", title: "This week" },
		},
		{
			kind: "sticky",
			x: -16,
			y: 64,
			width: 160,
			height: 160,
			props: { colour: "yellow", text: STICKY_TEXT, author: AGENT_AUTHOR },
		},
		{
			kind: "sticky",
			x: 176,
			y: 64,
			width: 160,
			height: 160,
			props: {
				colour: "pink",
				text: "Ask Ada for the final copy",
				author: PERSON_AUTHOR,
			},
		},
		{
			kind: "text",
			x: 440,
			y: 0,
			width: 300,
			height: 96,
			props: { heading: "Launch plan", body: "Three steps to Friday." },
		},
		{
			kind: "shape",
			x: 440,
			y: 124,
			width: 160,
			height: 96,
			props: { kind: "rounded-rectangle", label: "Ship" },
		},
		{
			kind: "sticky",
			x: 620,
			y: 100,
			width: 160,
			height: 160,
			props: {
				colour: "green",
				text: "Release notes drafted",
				author: AGENT_AUTHOR,
			},
		},
	],
}

export const REFERENCES_BOARD_SNAPSHOT: BoardSnapshot = {
	bounds: { x: 0, y: 0, width: 824, height: 380 },
	objects: [
		{
			kind: "image",
			x: 0,
			y: 0,
			width: 240,
			height: 180,
			props: { src: ROOFTOP_POOL, alt: "A rooftop pool at dusk" },
		},
		{ kind: "link", x: 264, y: 0, width: 300, height: 180, props: LINK_CARD },
		{
			kind: "library",
			x: 588,
			y: 0,
			width: 236,
			height: 160,
			props: LIBRARY_DOCUMENT,
		},
		{
			kind: "sticky",
			x: 0,
			y: 220,
			width: 160,
			height: 160,
			props: { colour: "blue", text: "Calm, not quiet", author: PERSON_AUTHOR },
		},
		{
			kind: "shape",
			x: 200,
			y: 220,
			width: 160,
			height: 160,
			props: { kind: "ellipse", label: "Mood" },
		},
	],
}

export const EMPTY_BOARD_SNAPSHOT: BoardSnapshot = {
	bounds: { x: 0, y: 0, width: 0, height: 0 },
	objects: [],
}
