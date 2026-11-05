import type { ReactNode } from "react"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import { CASA_DO_RIO_TERRACE } from "@workspace/ui/components/answer-blocks/answer-blocks.fixtures"
import {
	AGENT_AUTHOR,
	LIBRARY_DOCUMENT,
	LINK_CARD,
	PERSON_AUTHOR,
	STICKY_TEXT,
} from "@workspace/ui/components/board/board.fixtures"
import { BoardImage } from "@workspace/ui/components/board/board-image"
import { BoardLibraryCard } from "@workspace/ui/components/board/board-library-card"
import { BoardLinkCard } from "@workspace/ui/components/board/board-link-card"
import { BoardSection } from "@workspace/ui/components/board/board-section"
import { BoardShape } from "@workspace/ui/components/board/board-shape"
import { BoardSticky } from "@workspace/ui/components/board/board-sticky"
import { BoardText } from "@workspace/ui/components/board/board-text"

type PlayContext = { canvasElement: HTMLElement }

type PlacedProps = { x: number; y: number; children: ReactNode }

const Placed = ({ x, y, children }: PlacedProps) => (
	<div className="absolute" style={{ left: x, top: y }}>
		{children}
	</div>
)

const OBJECT_SLOTS = [
	"board-text",
	"board-section",
	"board-sticky",
	"board-shape",
	"board-link-card",
	"board-image",
	"board-image-source",
	"board-library-card",
]

const LinkAndImagePastedBoard = () => (
	<div className="relative" style={{ width: 1120, height: 680 }}>
		<Placed x={40} y={40}>
			<BoardText
				body="Everything the team needs before Friday: the plan, the open questions and who owns each one."
				heading="Launch week"
			/>
		</Placed>
		<Placed x={40} y={170}>
			<BoardSection height={470} tint="blue" title="Research" width={560} />
		</Placed>
		<Placed x={64} y={226}>
			<BoardSticky author={AGENT_AUTHOR} colour="yellow" text={STICKY_TEXT} />
		</Placed>
		<Placed x={240} y={226}>
			<BoardSticky
				author={PERSON_AUTHOR}
				colour="green"
				text="Ask support which onboarding step loses people"
			/>
		</Placed>
		<Placed x={416} y={226}>
			<BoardSticky
				author={AGENT_AUTHOR}
				colour="pink"
				text="Three teams asked for a calmer empty state"
			/>
		</Placed>
		<Placed x={64} y={420}>
			<BoardLinkCard {...LINK_CARD} />
		</Placed>
		<Placed x={384} y={420}>
			<BoardImage
				alt="A rooftop pool above the city"
				height={136}
				src={LINK_CARD.preview}
				width={200}
			/>
		</Placed>
		<Placed x={640} y={40}>
			<BoardSection height={300} tint="purple" title="Ideas" width={440} />
		</Placed>
		<Placed x={664} y={96}>
			<BoardShape
				height={80}
				kind="rounded-rectangle"
				label="Research"
				width={144}
			/>
		</Placed>
		<Placed x={840} y={92}>
			<BoardShape height={88} kind="ellipse" label="Ship" width={136} />
		</Placed>
		<Placed x={664} y={220}>
			<BoardShape
				height={72}
				kind="rounded-rectangle"
				label="Measure"
				width={152}
			/>
		</Placed>
		<Placed x={640} y={380}>
			<BoardImage
				alt="A terrace over the river at dusk"
				height={136}
				source="example.com/terrace-at-dusk"
				src={CASA_DO_RIO_TERRACE}
				width={200}
			/>
		</Placed>
		<Placed x={864} y={380}>
			<BoardLibraryCard {...LIBRARY_DOCUMENT} />
		</Placed>
	</div>
)

const playEveryObject = async ({ canvasElement }: PlayContext) => {
	for (const slot of OBJECT_SLOTS) {
		await expect(slotsIn(canvasElement, slot).length, slot).toBeGreaterThan(0)
	}
}

const meta = preview.meta({
	title: "Board/BoardObjects",
	render: () => <LinkAndImagePastedBoard />,
	parameters: { layout: "padded" },
	play: playEveryObject,
})

export const LinkAndImagePasted = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every board object placed together, after a link and an image were pasted: text, two sections, stickies by an agent and a person, three shapes, a link card, an image with and without its source, and a Library card at rest. Reach for it to review the objects side by side with the 5b artboard.",
			},
		},
	},
})

export const LinkAndImagePastedDark = meta.story({
	globals: { theme: "dark" },
})
