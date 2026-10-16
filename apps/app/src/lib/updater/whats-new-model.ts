import type { WhatsNewDialogProps } from "@workspace/ui/components/whats-new-dialog"
import { i18n } from "@workspace/ui/lib/i18n"

import { releaseNotesUrlOf } from "./badge-model"

import type { ReleaseNotes } from "../bindings"

type WhatsNewContent = Pick<
	WhatsNewDialogProps,
	"version" | "visual" | "headline" | "subline" | "notes" | "releaseNotesUrl"
>

const MARKDOWN_BLOCK = /^(#{1,6}|[-*+])\s/

const fallbackHeadlineOf = (version: string) =>
	i18n.t("settings:about.kiroshi.whatsNew", { version })

const splitFirstLine = (text: string): [string, string] => {
	const [line = "", ...rest] = text.split("\n")
	return [line.trim(), rest.join("\n").trim()]
}

const headOf = (body: string, version: string) => {
	if (!body || MARKDOWN_BLOCK.test(body))
		return { headline: fallbackHeadlineOf(version), subline: "", notes: body }

	const [headline, afterHeadline] = splitFirstLine(body)
	if (MARKDOWN_BLOCK.test(afterHeadline))
		return { headline, subline: "", notes: afterHeadline }

	const [subline, notes] = splitFirstLine(afterHeadline)
	return { headline, subline, notes }
}

export const toWhatsNewContent = ({
	version,
	body,
	visualUrl,
}: ReleaseNotes): WhatsNewContent => ({
	version,
	visual: visualUrl ? { src: visualUrl, alt: "" } : undefined,
	...headOf((body ?? "").trim(), version),
	releaseNotesUrl: releaseNotesUrlOf(version),
})
