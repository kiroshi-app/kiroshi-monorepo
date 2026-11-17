import { search } from "@workspace/ui/lib/i18n-en/search"
import { settings } from "@workspace/ui/lib/i18n-en/settings"

import { bots } from "./i18n-en/bots"
import { chat } from "./i18n-en/chat"
import { common } from "./i18n-en/common"

const en = { bots, chat, common, search, settings } as const

export { en }
