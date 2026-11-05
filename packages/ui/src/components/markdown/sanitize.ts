import { defaultSchema, type Options } from "rehype-sanitize"

import {
	BOT_MENTION_ATTRIBUTE,
	BOT_MENTION_COUNT_ATTRIBUTE,
} from "@workspace/ui/components/markdown/bot-mentions"
import {
	MARKDOWN_RUN_ATTRIBUTE,
	MARKDOWN_RUN_END_ATTRIBUTE,
} from "@workspace/ui/components/markdown/runs"

const WINDOWS_DRIVES = [
	..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
]

export const MARKDOWN_SANITIZE_SCHEMA: Options = {
	...defaultSchema,
	clobber: [],
	protocols: {
		...defaultSchema.protocols,
		href: [...(defaultSchema.protocols?.href ?? []), ...WINDOWS_DRIVES],
		src: [...(defaultSchema.protocols?.src ?? []), ...WINDOWS_DRIVES],
	},
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
