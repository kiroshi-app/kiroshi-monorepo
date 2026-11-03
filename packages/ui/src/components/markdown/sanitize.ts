import { defaultSchema, type Options } from "rehype-sanitize"

import {
	BOT_MENTION_ATTRIBUTE,
	BOT_MENTION_COUNT_ATTRIBUTE,
} from "@workspace/ui/components/markdown/bot-mentions"
import {
	MARKDOWN_RUN_ATTRIBUTE,
	MARKDOWN_RUN_END_ATTRIBUTE,
} from "@workspace/ui/components/markdown/runs"

export const MARKDOWN_SANITIZE_SCHEMA: Options = {
	...defaultSchema,
	clobber: [],
	attributes: {
		...defaultSchema.attributes,
		span: [
			...(defaultSchema.attributes?.span ?? []),
			BOT_MENTION_ATTRIBUTE,
			BOT_MENTION_COUNT_ATTRIBUTE,
			MARKDOWN_RUN_ATTRIBUTE,
			MARKDOWN_RUN_END_ATTRIBUTE,
		],
	},
}
