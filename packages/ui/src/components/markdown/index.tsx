import { useId, useMemo } from "react"
import ReactMarkdown, { type Options } from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"

import {
	type MarkdownAnswerActions,
	MarkdownAnswerContext,
} from "@workspace/ui/components/markdown/answer-actions"
import { rehypeAnswerMarks } from "@workspace/ui/components/markdown/answer-marks"
import { remarkBotMentions } from "@workspace/ui/components/markdown/bot-mentions"
import { MARKDOWN_COMPONENTS } from "@workspace/ui/components/markdown/components"
import { NestedMarkdownContext } from "@workspace/ui/components/markdown/nested-markdown"
import {
	MARKDOWN_CODE_SURFACE_CLASS,
	MARKDOWN_TYPESET_CLASS,
	MARKDOWN_WHITESPACE_CLASS,
} from "@workspace/ui/components/markdown/prose"
import { remarkLiteralHtml } from "@workspace/ui/components/markdown/raw-html"
import {
	MarkdownRunContext,
	type MarkdownRunRenderer,
} from "@workspace/ui/components/markdown/run"
import {
	type MarkdownRun,
	remarkRuns,
} from "@workspace/ui/components/markdown/runs"
import { MARKDOWN_SANITIZE_SCHEMA } from "@workspace/ui/components/markdown/sanitize"
import { rehypeScopeIds } from "@workspace/ui/components/markdown/scope-ids"
import { cn } from "@workspace/ui/lib/utils"

export interface MarkdownProps {
	children: string
	className?: string
	runs?: MarkdownRun[]
	renderRun?: MarkdownRunRenderer
	isWriting?: boolean
	answerActions?: MarkdownAnswerActions
}

const MARKDOWN_REMARK_PLUGINS = [
	remarkGfm,
	remarkMath,
	remarkLiteralHtml,
	remarkBotMentions,
]

const MARKDOWN_CLASS = cn(
	MARKDOWN_TYPESET_CLASS,
	MARKDOWN_CODE_SURFACE_CLASS,
	MARKDOWN_WHITESPACE_CLASS,
	"text-sm leading-6",
)

export const Markdown = ({
	children,
	className,
	runs,
	renderRun,
	isWriting = false,
	answerActions,
}: MarkdownProps) => {
	const scope = useId()
	const remarkPlugins = useMemo<Options["remarkPlugins"]>(
		() =>
			runs?.length
				? [...MARKDOWN_REMARK_PLUGINS, [remarkRuns, { runs }]]
				: MARKDOWN_REMARK_PLUGINS,
		[runs],
	)

	return (
		<div data-slot="markdown" className={cn(MARKDOWN_CLASS, className)}>
			<NestedMarkdownContext value={Markdown}>
				<MarkdownAnswerContext value={answerActions ?? null}>
					<MarkdownRunContext value={renderRun ?? null}>
						<ReactMarkdown
							components={MARKDOWN_COMPONENTS}
							rehypePlugins={[
								[rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA],
								[rehypeScopeIds, { scope }],
								[rehypeAnswerMarks, { isWriting }],
							]}
							remarkPlugins={remarkPlugins}
						>
							{children}
						</ReactMarkdown>
					</MarkdownRunContext>
				</MarkdownAnswerContext>
			</NestedMarkdownContext>
		</div>
	)
}
