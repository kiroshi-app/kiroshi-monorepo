import type { WhatsNewDialogProps } from "@workspace/ui/components/whats-new-dialog"
import { i18n } from "@workspace/ui/lib/i18n"

import { linesOf, releaseNotesUrlOf } from "./badge-model"

import type { ReleaseNotes } from "../bindings"

type WhatsNewContent = Pick<
	WhatsNewDialogProps,
	"version" | "visual" | "headline" | "subline" | "notes" | "releaseNotesUrl"
>

const HEADING = /^#+\s*/

const fallbackHeadlineOf = (version: string) =>
	i18n.t("settings:about.kiroshi.whatsNew", { version })

export const toWhatsNewContent = ({
	version,
	body,
	visualUrl,
}: ReleaseNotes): WhatsNewContent => {
	const [headline, subline = "", ...notes] = linesOf(body).map((line) =>
		line.replace(HEADING, ""),
	)
	return {
		version,
		visual: visualUrl ? { src: visualUrl, alt: "" } : undefined,
		headline: headline ?? fallbackHeadlineOf(version),
		subline,
		notes,
		releaseNotesUrl: releaseNotesUrlOf(version),
	}
}
