import type { LibraryLightboxImage } from "@workspace/ui/components/library-lightbox"
import { i18n } from "@workspace/ui/lib/i18n"

import { raiseReportedFailure } from "../failure-report"

const IMAGE_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
}

const imageTypeOf = (name: string) =>
	IMAGE_TYPES[name.slice(name.lastIndexOf(".") + 1).toLowerCase()] ??
	"application/octet-stream"

const readImage = async (src: string) => {
	const response = await fetch(src)
	if (!response.ok) {
		throw new Error(`library image ${response.status}`)
	}
	return response.blob()
}

const writeImage = ({ name, src }: LibraryLightboxImage) =>
	navigator.clipboard.write([
		new ClipboardItem({ [imageTypeOf(name)]: readImage(src) }),
	])

export const copyImage = (image: LibraryLightboxImage) =>
	writeImage(image).catch(() =>
		raiseReportedFailure(
			{ title: i18n.t("chat:missions.menu.failed.copy") },
			{ raisedIn: "library-clipboard" },
		),
	)
