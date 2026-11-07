import { describe, expect, it } from "vitest"

import { opensInItsApp } from "./open-attachment"

const STORED = "/Users/me/Library/kiroshi/attachments/space-1"
const NAME = "0b6f2c1e-4a1d-4c8e-9f3a-2d7e5b8c9a10"
const WINDOWS_STORED = "C:\\Users\\me\\kiroshi\\attachments\\space-1"

const storedPathOf = (extension: string) => `${STORED}/${NAME}.${extension}`

const INERT = [
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
]

const ACTIVE = [
	"html",
	"htm",
	"svg",
	"xml",
	"docm",
	"xlsm",
	"pptm",
	"zip",
	"dmg",
	"pkg",
	"command",
	"terminal",
	"sh",
	"app",
	"jar",
	"bat",
	"cmd",
	"ps1",
	"js",
	"vbs",
	"hta",
	"lnk",
	"exe",
	"msi",
]

describe("opensInItsApp", () => {
	it.each(INERT)("opens a .%s file in its app", (extension) => {
		expect(opensInItsApp(storedPathOf(extension))).toBe(true)
	})

	it.each(ACTIVE)("only reveals a .%s file in its folder", (extension) => {
		expect(opensInItsApp(storedPathOf(extension))).toBe(false)
	})

	it("reads the extension whatever its case", () => {
		expect(opensInItsApp(storedPathOf("PDF"))).toBe(true)
	})

	it("reads the extension from a Windows path", () => {
		expect(opensInItsApp(`${WINDOWS_STORED}\\${NAME}.pdf`)).toBe(true)
		expect(opensInItsApp(`${WINDOWS_STORED}\\${NAME}.exe`)).toBe(false)
	})

	it("reads the extension from the file name, not its folder", () => {
		expect(opensInItsApp("/Users/me/notes.pdf/run")).toBe(false)
	})

	it("only reveals a file with no extension", () => {
		expect(opensInItsApp(`${STORED}/${NAME}`)).toBe(false)
	})

	it("only reveals a dot-file", () => {
		expect(opensInItsApp(`${STORED}/.pdf`)).toBe(false)
	})
})
