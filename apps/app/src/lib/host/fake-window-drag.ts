const DRAG_REGION = "data-tauri-drag-region"

const CLICKABLE_TAGS = new Set([
	"A",
	"BUTTON",
	"INPUT",
	"SELECT",
	"TEXTAREA",
	"LABEL",
	"SUMMARY",
])

const INTERACTIVE_ROLES = new Set([
	"button",
	"link",
	"menuitem",
	"tab",
	"checkbox",
	"radio",
	"switch",
	"option",
])

const isEditable = (element: Element) =>
	element.hasAttribute("contenteditable") &&
	element.getAttribute("contenteditable") !== "false"

const isFocusable = (element: Element) =>
	element.hasAttribute("tabindex") && element.getAttribute("tabindex") !== "-1"

const isClickable = (element: Element) =>
	CLICKABLE_TAGS.has(element.tagName) ||
	isEditable(element) ||
	isFocusable(element) ||
	INTERACTIVE_ROLES.has(element.getAttribute("role") ?? "")

const pathFrom = (pressed: Element) => {
	const path: Element[] = []
	for (
		let element: Element | null = pressed;
		element;
		element = element.parentElement
	)
		path.push(element)

	return path
}

export const takesPress = (element: Element) =>
	!element
		.closest(".pointer-events-none, .pointer-events-auto")
		?.classList.contains("pointer-events-none")

export const startsWindowDrag = (pressed: Element) => {
	if (!takesPress(pressed)) return false

	for (const element of pathFrom(pressed)) {
		const region = element.getAttribute(DRAG_REGION)
		if (region === null && isClickable(element)) return false
		if (region === null) continue
		if (region === "deep") return true
		if (region === "false") return false
		return element === pressed
	}

	return false
}
