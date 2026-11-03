import type { Components } from "react-markdown"

import {
	MarkdownBlockquote,
	MarkdownFigure,
} from "@workspace/ui/components/markdown/answer-elements"
import {
	MarkdownCode,
	MarkdownPre,
} from "@workspace/ui/components/markdown/code"
import { MarkdownLink } from "@workspace/ui/components/markdown/link"
import { MarkdownSpan } from "@workspace/ui/components/markdown/mention"
import { MarkdownTable } from "@workspace/ui/components/markdown/table"
import { MarkdownTaskCheckbox } from "@workspace/ui/components/markdown/task-list"

export const MARKDOWN_COMPONENTS: Components = {
	a: MarkdownLink,
	blockquote: MarkdownBlockquote,
	code: MarkdownCode,
	figure: MarkdownFigure,
	input: MarkdownTaskCheckbox,
	pre: MarkdownPre,
	span: MarkdownSpan,
	table: MarkdownTable,
}
