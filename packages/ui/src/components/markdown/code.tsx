"use client"

import {
	type ComponentPropsWithoutRef,
	Fragment,
	useDeferredValue,
	useMemo,
	useState,
} from "react"
import { useTranslation } from "react-i18next"
import type { ExtraProps } from "react-markdown"

import { CodeLine } from "@workspace/ui/components/code-block"
import { Icons } from "@workspace/ui/components/icons"
import {
	MarkdownAnswerBlock,
	PendingAnswerBlock,
} from "@workspace/ui/components/markdown/answer-block"
import {
	isAnswerBlockLabel,
	readAnswerBlock,
} from "@workspace/ui/components/markdown/answer-block-source"
import { PENDING_PROPERTY } from "@workspace/ui/components/markdown/answer-marks"
import {
	MATH_LANGUAGE,
	MarkdownMath,
} from "@workspace/ui/components/markdown/math"
import {
	MarkdownMermaid,
	MERMAID_LANGUAGE,
} from "@workspace/ui/components/markdown/mermaid"
import { MARKDOWN_ESCAPED_BLOCK_CLASS } from "@workspace/ui/components/markdown/prose"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
import { useCodeHighlightReady } from "@workspace/ui/hooks/use-code-highlight-ready"
import { useCopyText } from "@workspace/ui/hooks/use-copy-text"
import { highlightCode, toCodeLines } from "@workspace/ui/lib/code-highlight"

export type MarkdownCodeProps = ComponentPropsWithoutRef<"code"> & ExtraProps
export type MarkdownPreProps = ComponentPropsWithoutRef<"pre"> & ExtraProps

interface MarkdownFenceProps {
	code: string
	language?: string
}

type FenceNode = NonNullable<ExtraProps["node"]>
type FenceChild = FenceNode["children"][number]
type FenceElement = Extract<FenceChild, { tagName: string }>

const LANGUAGE_PREFIX = "language-"

const HIGHLIGHT_BUDGET_LINES = 200

const isCodeElement = (child: FenceChild): child is FenceElement =>
	child.type === "element" && child.tagName === "code"

const codeChildOf = (node?: FenceNode) => node?.children.find(isCodeElement)

const sourceOf = (node: FenceElement) =>
	node.children
		.map((child) => (child.type === "text" ? child.value : ""))
		.join("")
		.replace(/\n$/, "")

const languageOf = (node: FenceElement) => {
	const names = node.properties?.className
	if (!Array.isArray(names)) return undefined

	return names
		.filter((name): name is string => typeof name === "string")
		.find((name) => name.startsWith(LANGUAGE_PREFIX))
		?.slice(LANGUAGE_PREFIX.length)
}

const fitsInOneFrame = (code: string) =>
	code.split("\n", HIGHLIGHT_BUDGET_LINES + 1).length <= HIGHLIGHT_BUDGET_LINES

export const MarkdownCode = ({
	node,
	children,
	...props
}: MarkdownCodeProps) => {
	if (node && languageOf(node) === MATH_LANGUAGE) {
		return <MarkdownMath source={sourceOf(node)} />
	}

	return <code {...props}>{children}</code>
}

const FenceCode = ({ code, language }: MarkdownFenceProps) => {
	const [firstPaint] = useState(() => (fitsInOneFrame(code) ? code : ""))
	const painted = useDeferredValue(code, firstPaint)
	const ready = useCodeHighlightReady(language)

	const lines = useMemo(() => {
		const paintable = ready && painted === code
		return toCodeLines(
			code,
			paintable ? highlightCode(code, language) : undefined,
		)
	}, [code, language, painted, ready])

	return (
		<code>
			{lines.map((line, index) => (
				<Fragment key={line.offset}>
					<CodeLine content={line.content} tokens={line.tokens} />
					{index < lines.length - 1 ? "\n" : null}
				</Fragment>
			))}
		</code>
	)
}

const FENCE_CLASS = `${MARKDOWN_ESCAPED_BLOCK_CLASS} relative my-2`

const MarkdownFence = ({ code, language }: MarkdownFenceProps) => {
	const { t } = useTranslation("chat")
	const { copied, copy } = useCopyText(code)
	const named = language?.trim()
	const snippetLabel = named
		? t("code.namedSnippet", { name: named })
		: t("code.snippet")

	return (
		<div data-slot="markdown-fence" className={FENCE_CLASS}>
			<pre>
				<span
					// biome-ignore lint/a11y/noNoninteractiveTabindex: an overflowing fence must be keyboard scrollable
					tabIndex={0}
					role="group"
					aria-label={snippetLabel}
					className="mr-8 block overflow-x-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
				>
					<FenceCode code={code} language={language} />
				</span>
			</pre>
			<span className="absolute top-2 right-2">
				<TooltipButton
					variant="ghost"
					size="icon-xs"
					aria-label={copied ? t("code.copied") : t("code.copy")}
					tooltip={copied ? t("code.copied") : t("code.copyTooltip")}
					onClick={() => {
						void copy()
					}}
				>
					{copied ? <Icons.Check /> : <Icons.Copy />}
				</TooltipButton>
			</span>
		</div>
	)
}

export const MarkdownPre = ({ node, children, ...props }: MarkdownPreProps) => {
	const code = codeChildOf(node)
	if (!code) return <pre {...props}>{children}</pre>

	const source = sourceOf(code)
	const language = languageOf(code)

	if (language === MATH_LANGUAGE)
		return <MarkdownMath display source={source} />
	if (language === MERMAID_LANGUAGE) return <MarkdownMermaid source={source} />
	if (isAnswerBlockLabel(language)) {
		if (node?.properties?.[PENDING_PROPERTY]) {
			return <PendingAnswerBlock label={language} />
		}
		const block = readAnswerBlock(language, source)
		if (block) return <MarkdownAnswerBlock block={block} />
	}

	return <MarkdownFence code={source} language={language} />
}

const MarkdownStaticFence = ({ code, language }: MarkdownFenceProps) => (
	<div data-slot="markdown-fence" className={FENCE_CLASS}>
		<pre>
			<span className="block overflow-hidden">
				<FenceCode code={code} language={language} />
			</span>
		</pre>
	</div>
)

export const MarkdownStaticPre = ({
	node,
	children,
	...props
}: MarkdownPreProps) => {
	const code = codeChildOf(node)
	if (!code) return <pre {...props}>{children}</pre>

	const source = sourceOf(code)
	const language = languageOf(code)

	if (language === MATH_LANGUAGE)
		return <MarkdownMath display source={source} />

	return <MarkdownStaticFence code={source} language={language} />
}
