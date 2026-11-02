import type { LibraryLightboxImage } from "@workspace/ui/components/library-lightbox"
import { i18n } from "@workspace/ui/lib/i18n"

import { raiseReportedFailure } from "../failure-report"

const CLIPBOARD_IMAGE_TYPE = "image/png"

const readImage = async (src: string) => {
	const response = await fetch(src)
	if (!response.ok) {
		throw new Error(`library image ${response.status}`)
	}
	return response.blob()
}

const toPng = async (src: string) => {
	const bitmap = await createImageBitmap(await readImage(src))
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
	const context = canvas.getContext("2d")
	if (!context) {
		throw new Error("library image canvas unavailable")
	}
	context.drawImage(bitmap, 0, 0)
	bitmap.close()
	return canvas.convertToBlob({ type: CLIPBOARD_IMAGE_TYPE })
}

const writeImage = ({ src }: LibraryLightboxImage) =>
	navigator.clipboard.write([
		new ClipboardItem({ [CLIPBOARD_IMAGE_TYPE]: toPng(src) }),
	])

export const copyImage = (image: LibraryLightboxImage) =>
	writeImage(image).catch(() =>
		raiseReportedFailure(
			{ title: i18n.t("chat:missions.menu.failed.copy") },
			{ raisedIn: "library-clipboard" },
		),
	)
