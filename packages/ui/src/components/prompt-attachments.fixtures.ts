import type { PromptAttachment } from "@workspace/ui/components/prompt-attachments"

export const REPLY_CHIP_MIN_WIDTH = 236

export const REPLY_CHIP_MAX_WIDTH = 360

const SCREENSHOT_PREVIEW =
	"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20fill%3D%22%231e293b%22%2F%3E%3Ccircle%20cx%3D%2240%22%20cy%3D%2224%22%20r%3D%2214%22%20fill%3D%22%23f97316%22%2F%3E%3C%2Fsvg%3E"

const DIAGRAM_PREVIEW =
	"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20fill%3D%22%230f766e%22%2F%3E%3Ccircle%20cx%3D%2240%22%20cy%3D%2224%22%20r%3D%2214%22%20fill%3D%22%23a7f3d0%22%2F%3E%3C%2Fsvg%3E"

export const PROMPT_ATTACHMENTS: PromptAttachment[] = [
	{ id: "notes", name: "release-notes.md", size: 4212 },
	{
		id: "screenshot",
		name: "composer-empty.png",
		size: 184320,
		previewUrl: SCREENSHOT_PREVIEW,
	},
]

export const LONG_PROMPT_ATTACHMENTS: PromptAttachment[] = [
	...PROMPT_ATTACHMENTS,
	{
		id: "report",
		name: "release-notes-for-the-desktop-shell-and-the-chat-surface.md",
		size: 731,
	},
	{
		id: "diagram",
		name: "transport-diagram.svg",
		size: 9871,
		previewUrl: DIAGRAM_PREVIEW,
	},
	{ id: "session", name: "session-2026-03-04.log", size: 1268934 },
	{ id: "manifest", name: "components.json", size: 512 },
]

export const DROPPED_PROMPT_FILE = new File(["# notes"], "dropped-notes.md", {
	type: "text/markdown",
})

export const PASTED_PROMPT_FILE = new File(["<svg />"], "pasted-capture.svg", {
	type: "image/svg+xml",
})
