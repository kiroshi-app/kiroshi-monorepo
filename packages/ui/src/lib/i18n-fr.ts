import type { Catalogue } from "@workspace/ui/lib/i18n-catalogue"
import type { en } from "@workspace/ui/lib/i18n-en"
import { search } from "@workspace/ui/lib/i18n-fr/search"
import { settings } from "@workspace/ui/lib/i18n-fr/settings"

import { bots } from "./i18n-fr/bots"
import { chat } from "./i18n-fr/chat"
import { common } from "./i18n-fr/common"

const fr = {
	bots,
	chat,
	common,
	search,
	settings,
} as const satisfies Catalogue<typeof en>

export { fr }
