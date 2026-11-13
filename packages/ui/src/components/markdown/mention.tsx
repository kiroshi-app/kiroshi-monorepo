import type { ComponentPropsWithoutRef } from "react"
import type { ExtraProps } from "react-markdown"

import {
	BOT_MENTION_ATTRIBUTE,
	BOT_MENTION_COUNT_ATTRIBUTE,
} from "@workspace/ui/components/markdown/bot-mentions"
import { MarkdownRunSpan } from "@workspace/ui/components/markdown/run"
import {
	MARKDOWN_RUN_ATTRIBUTE,
	MARKDOWN_RUN_END_ATTRIBUTE,
} from "@workspace/ui/components/markdown/runs"
import {
	MarkdownStreamingTail,
	STREAMING_TAIL_FIRST_WORD_PROPERTY,
	STREAMING_TAIL_LAST_STEP_PROPERTY,
} from "@workspace/ui/components/markdown/streaming-tail"
import { Mention } from "@workspace/ui/components/mention"

export type MarkdownSpanProps = ComponentPropsWithoutRef<"span"> &
	ExtraProps & {
		[BOT_MENTION_ATTRIBUTE]?: string
		[BOT_MENTION_COUNT_ATTRIBUTE]?: string | number
		[MARKDOWN_RUN_ATTRIBUTE]?: string
		[MARKDOWN_RUN_END_ATTRIBUTE]?: string
	}

type MarkdownSpanForkProps = MarkdownSpanProps & { isStatic: boolean }

const MarkdownSpanFork = ({
	node,
	children,
	isStatic,
	...props
}: MarkdownSpanForkProps) => {
	const botId = props[BOT_MENTION_ATTRIBUTE]

	if (botId)
		return (
			<Mention
				botId={botId}
				className="not-typeset"
				count={Number(props[BOT_MENTION_COUNT_ATTRIBUTE] ?? 1)}
				isStatic={isStatic}
			/>
		)

	const runId = props[MARKDOWN_RUN_ATTRIBUTE]

	if (runId)
		return (
			<MarkdownRunSpan
				id={runId}
				isEnd={props[MARKDOWN_RUN_END_ATTRIBUTE] === "true"}
			>
				{children}
			</MarkdownRunSpan>
		)

	const tailFirstWord = node?.properties[STREAMING_TAIL_FIRST_WORD_PROPERTY]

	if (typeof tailFirstWord === "number" && typeof children === "string")
		return (
			<MarkdownStreamingTail
				firstWordAt={tailFirstWord}
				lastWordStep={Number(
					node?.properties[STREAMING_TAIL_LAST_STEP_PROPERTY],
				)}
			>
				{children}
			</MarkdownStreamingTail>
		)

	return <span {...props}>{children}</span>
}

export const MarkdownSpan = (props: MarkdownSpanProps) => (
	<MarkdownSpanFork {...props} isStatic={false} />
)

export const MarkdownStaticSpan = (props: MarkdownSpanProps) => (
	<MarkdownSpanFork {...props} isStatic />
)
