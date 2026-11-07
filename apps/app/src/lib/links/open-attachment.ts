import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener"

import { isDesktopHost } from "../host"

const INERT_EXTENSIONS = new Set([
	"pdf",
	"txt",
	"md",
	"csv",
	"json",
	"log",
	"rtf",
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"heic",
	"bmp",
	"tif",
	"tiff",
	"mp3",
	"m4a",
	"wav",
	"mp4",
	"mov",
	"docx",
	"xlsx",
	"pptx",
	"odt",
	"ods",
	"odp",
	"pages",
	"numbers",
	"key",
])

const extensionOf = (path: string): string | null => {
	const fileName = path.split(/[\\/]/).at(-1) ?? ""
	const dotIndex = fileName.lastIndexOf(".")
	if (dotIndex <= 0) return null
	return fileName.slice(dotIndex + 1).toLowerCase()
}

export const opensInItsApp = (path: string): boolean => {
	const extension = extensionOf(path)
	return extension !== null && INERT_EXTENSIONS.has(extension)
}

export const openAttachment = (path: string): void => {
	if (!isDesktopHost()) {
		return
	}
	const handOver = opensInItsApp(path) ? openPath : revealItemInDir
	handOver(path).catch(() => undefined)
}
