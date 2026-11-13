"use client"

import {
	type ComponentPropsWithoutRef,
	Fragment,
	type ReactNode,
	useContext,
	useDeferredValue,
	useMemo,
	useState,
} from "react"
import { useTranslation } from "react-i18next"
import type { ExtraProps } from "react-markdown"

import { CodeLine } from "@workspace/ui/components/code-block"
import { IconSwap } from "@workspace/ui/components/icon-swap"
import { Icons } from "@workspace/ui/components/icons"
import {
	MarkdownAnswerBlock,
	PendingAnswerBlock,
} from "@workspace/ui/components/markdown/answer-block"
import {
	isAnswerBlockLabel,
	readAnswerBlock,
} from "@workspace/ui/components/markdown/answer-block-source"
import {
	AnswerCard,
	AnswerCardAction,
	AnswerCardHeader,
} from "@workspace/ui/components/markdown/answer-card"
import { PENDING_PROPERTY } from "@workspace/ui/components/markdown/answer-marks"
import { useMarkdownImageResolver } from "@workspace/ui/components/markdown/image-resolver"
import {
	MATH_LANGUAGE,
	MarkdownMath,
} from "@workspace/ui/components/markdown/math"
import {
	MarkdownMermaid,
	MERMAID_LANGUAGE,
} from "@workspace/ui/components/markdown/mermaid"
import { MARKDOWN_ESCAPED_BLOCK_CLASS } from "@workspace/ui/components/markdown/prose"
import { MarkdownSizeContext } from "@workspace/ui/components/markdown/size"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
import { useCodeHighlightReady } from "@workspace/ui/hooks/use-code-highlight-ready"
import { useCopyText } from "@workspace/ui/hooks/use-copy-text"
import { highlightCode, toCodeLines } from "@workspace/ui/lib/code-highlight"

export type MarkdownCodeProps = ComponentPropsWithoutRef<"code"> & ExtraProps
export type MarkdownPreProps = ComponentPropsWithoutRef<"pre"> & ExtraProps

interface MarkdownFenceProps {
	code: string
	language?: string
	header?: ReactNode
	body?: ReactNode
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

export const MarkdownFence = ({
	code,
	language,
	header,
	body,
}: MarkdownFenceProps) => {
	const { t } = useTranslation("chat")
	const { copied, copy } = useCopyText(code)
	const named = language?.trim()
	const snippetLabel = named
		? t("code.namedSnippet", { name: named })
		: t("code.snippet")

	return (
		<div data-slot="markdown-fence" className={FENCE_CLASS}>
			<pre>
				{header}
				{body ?? (
					<span
						// biome-ignore lint/a11y/noNoninteractiveTabindex: an overflowing fence must be keyboard scrollable
						tabIndex={0}
						role="group"
						aria-label={snippetLabel}
						className="mr-8 block overflow-x-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
					>
						<FenceCode code={code} language={language} />
					</span>
				)}
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
					<IconSwap
						icon={<Icons.Copy />}
						isSwapped={copied}
						swappedIcon={<Icons.Check />}
					/>
				</TooltipButton>
			</span>
		</div>
	)
}

const ANSWER_FENCE_BODY_CLASS =
	"rounded-none! bg-card-raised! p-3.5! font-mono text-compact leading-5.5 ring-0!"

const AnswerFence = ({ code, language }: MarkdownFenceProps) => {
	const { t } = useTranslation("chat")
	const { copied, copy } = useCopyText(code)
	const named = language?.trim()

	return (
		<AnswerCard slot="markdown-fence">
			<AnswerCardHeader label={named} labelFont="mono">
				<AnswerCardAction
					icon={<Icons.Copy className="size-3.5" />}
					isDone={copied}
					doneAnnouncement={t("code.copyAnnounced")}
					name={t("code.copy")}
					onPress={() => {
						void copy()
					}}
				>
					{t("code.copyTooltip")}
				</AnswerCardAction>
			</AnswerCardHeader>
			<pre className={ANSWER_FENCE_BODY_CLASS}>
				<span
					// biome-ignore lint/a11y/noNoninteractiveTabindex: an overflowing fence must be keyboard scrollable
					tabIndex={0}
					role="group"
					aria-label={
						named ? t("code.namedSnippet", { name: named }) : t("code.snippet")
					}
					className="block overflow-x-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
				>
					<FenceCode code={code} language={language} />
				</span>
			</pre>
		</AnswerCard>
	)
}

export const MarkdownPre = ({ node, children, ...props }: MarkdownPreProps) => {
	const resolveImage = useMarkdownImageResolver()
	const size = useContext(MarkdownSizeContext)
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
		const block = readAnswerBlock(language, source, {
			hasImageResolver: resolveImage !== undefined,
		})
		if (block) return <MarkdownAnswerBlock block={block} />
	}

	return size === "answer" ? (
		<AnswerFence code={source} language={language} />
	) : (
		<MarkdownFence code={source} language={language} />
	)
}

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

	return (
		<div data-slot="markdown-fence" className={FENCE_CLASS}>
			<pre>
				<span className="block overflow-hidden">
					<FenceCode code={source} language={language} />
				</span>
			</pre>
		</div>
	)
}
