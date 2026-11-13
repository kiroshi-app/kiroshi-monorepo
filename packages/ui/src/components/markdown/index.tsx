import { useContext, useId, useMemo } from "react"
import ReactMarkdown, { type Options } from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"

import {
	type MarkdownAnswerActions,
	MarkdownAnswerContext,
} from "@workspace/ui/components/markdown/answer-actions"
import { rehypeAnswerMarks } from "@workspace/ui/components/markdown/answer-marks"
import {
	keepDrivePaths,
	MarkdownAttachmentsContext,
	type OpenAttachment,
	useMarkdownAttachments,
} from "@workspace/ui/components/markdown/attachments"
import {
	MarkdownBoardLinkContext,
	type MarkdownBoardLinkRenderer,
} from "@workspace/ui/components/markdown/board-link"
import { remarkBotMentions } from "@workspace/ui/components/markdown/bot-mentions"
import {
	MARKDOWN_COMPONENTS,
	MARKDOWN_STATIC_COMPONENTS,
} from "@workspace/ui/components/markdown/components"
import {
	MarkdownImageResolverContext,
	useMarkdownImageResolver,
} from "@workspace/ui/components/markdown/image-resolver"
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
import {
	type MarkdownSize,
	MarkdownSizeContext,
} from "@workspace/ui/components/markdown/size"
import { MarkdownTaskToggleContext } from "@workspace/ui/components/markdown/task-list"
import type { ResolveImage } from "@workspace/ui/hooks/use-shown-images"
import { cn } from "@workspace/ui/lib/utils"

export interface MarkdownProps {
	children: string
	className?: string
	runs?: MarkdownRun[]
	renderRun?: MarkdownRunRenderer
	renderBoardLink?: MarkdownBoardLinkRenderer
	isWriting?: boolean
	answerActions?: MarkdownAnswerActions
	onToggleTask?: (box: HTMLInputElement) => void
	isStatic?: boolean
	resolveImage?: ResolveImage
	resolveAttachment?: ResolveImage
	onOpenAttachment?: OpenAttachment
}

const MARKDOWN_REMARK_PLUGINS = [
	remarkGfm,
	remarkMath,
	remarkLiteralHtml,
	remarkBotMentions,
]

export const MARKDOWN_CLASS = cn(
	MARKDOWN_TYPESET_CLASS,
	MARKDOWN_CODE_SURFACE_CLASS,
	MARKDOWN_WHITESPACE_CLASS,
	"text-sm leading-6",
)

const MARKDOWN_SIZE_CLASS = {
	chat: MARKDOWN_CLASS,
	answer: cn(
		"typeset typeset-answer",
		MARKDOWN_CODE_SURFACE_CLASS,
		MARKDOWN_WHITESPACE_CLASS,
	),
} as const satisfies Record<MarkdownSize, string>

export const Markdown = ({
	children,
	className,
	runs,
	renderRun,
	renderBoardLink,
	isWriting = false,
	answerActions,
	onToggleTask,
	isStatic = false,
	resolveImage,
	resolveAttachment,
	onOpenAttachment,
}: MarkdownProps) => {
	const scope = useId()
	const size = useContext(MarkdownSizeContext)
	const inheritedResolveImage = useMarkdownImageResolver()
	const inheritedAttachments = useMarkdownAttachments()
	const remarkPlugins = useMemo<Options["remarkPlugins"]>(
		() =>
			runs?.length
				? [...MARKDOWN_REMARK_PLUGINS, [remarkRuns, { runs }]]
				: MARKDOWN_REMARK_PLUGINS,
		[runs],
	)

	return (
		<div
			data-slot="markdown"
			className={cn(MARKDOWN_SIZE_CLASS[size], className)}
		>
			<NestedMarkdownContext value={Markdown}>
				<MarkdownAnswerContext value={answerActions ?? null}>
					<MarkdownRunContext value={renderRun ?? null}>
						<MarkdownBoardLinkContext value={renderBoardLink ?? null}>
							<MarkdownTaskToggleContext value={onToggleTask ?? null}>
								<MarkdownImageResolverContext
									value={resolveImage ?? inheritedResolveImage}
								>
									<MarkdownAttachmentsContext
										value={{
											resolveAttachment:
												resolveAttachment ??
												inheritedAttachments.resolveAttachment,
											onOpenAttachment:
												onOpenAttachment ??
												inheritedAttachments.onOpenAttachment,
										}}
									>
										<ReactMarkdown
											components={
												isStatic
													? MARKDOWN_STATIC_COMPONENTS
													: MARKDOWN_COMPONENTS
											}
											rehypePlugins={[
												[rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA],
												[rehypeScopeIds, { scope }],
												[rehypeAnswerMarks, { isWriting }],
											]}
											remarkPlugins={remarkPlugins}
											urlTransform={keepDrivePaths}
										>
											{children}
										</ReactMarkdown>
									</MarkdownAttachmentsContext>
								</MarkdownImageResolverContext>
							</MarkdownTaskToggleContext>
						</MarkdownBoardLinkContext>
					</MarkdownRunContext>
				</MarkdownAnswerContext>
			</NestedMarkdownContext>
		</div>
	)
}
