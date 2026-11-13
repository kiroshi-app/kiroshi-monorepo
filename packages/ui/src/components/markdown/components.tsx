import type { Components } from "react-markdown"

import {
	MarkdownBlockquote,
	MarkdownFigure,
	MarkdownImage,
	MarkdownStaticImage,
} from "@workspace/ui/components/markdown/answer-elements"
import {
	MarkdownCode,
	MarkdownPre,
	MarkdownStaticPre,
} from "@workspace/ui/components/markdown/code"
import {
	MarkdownLink,
	MarkdownStaticLink,
} from "@workspace/ui/components/markdown/link"
import {
	MarkdownSpan,
	MarkdownStaticSpan,
} from "@workspace/ui/components/markdown/mention"
import { MarkdownOrderedList } from "@workspace/ui/components/markdown/ordered-list"
import { MarkdownParagraph } from "@workspace/ui/components/markdown/paragraph"
import {
	MarkdownStaticTable,
	MarkdownTable,
} from "@workspace/ui/components/markdown/table"
import {
	MarkdownListItem,
	MarkdownStaticTaskBox,
	MarkdownTaskCheckbox,
} from "@workspace/ui/components/markdown/task-list"

export const MARKDOWN_COMPONENTS: Components = {
	a: MarkdownLink,
	blockquote: MarkdownBlockquote,
	code: MarkdownCode,
	figure: MarkdownFigure,
	img: MarkdownImage,
	input: MarkdownTaskCheckbox,
	li: MarkdownListItem,
	ol: MarkdownOrderedList,
	p: MarkdownParagraph,
	pre: MarkdownPre,
	span: MarkdownSpan,
	table: MarkdownTable,
}

export const MARKDOWN_STATIC_COMPONENTS: Components = {
	a: MarkdownStaticLink,
	blockquote: MarkdownBlockquote,
	code: MarkdownCode,
	img: MarkdownStaticImage,
	input: MarkdownStaticTaskBox,
	ol: MarkdownOrderedList,
	pre: MarkdownStaticPre,
	span: MarkdownStaticSpan,
	table: MarkdownStaticTable,
}
