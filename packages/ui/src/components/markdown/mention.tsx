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
import { Mention } from "@workspace/ui/components/mention"

export type MarkdownSpanProps = ComponentPropsWithoutRef<"span"> &
	ExtraProps & {
		[BOT_MENTION_ATTRIBUTE]?: string
		[BOT_MENTION_COUNT_ATTRIBUTE]?: string | number
		[MARKDOWN_RUN_ATTRIBUTE]?: string
		[MARKDOWN_RUN_END_ATTRIBUTE]?: string
	}

export const MarkdownSpan = ({
	node,
	children,
	...props
}: MarkdownSpanProps) => {
	const botId = props[BOT_MENTION_ATTRIBUTE]

	if (botId)
		return (
			<Mention
				botId={botId}
				className="not-typeset"
				count={Number(props[BOT_MENTION_COUNT_ATTRIBUTE] ?? 1)}
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

	return <span {...props}>{children}</span>
}
