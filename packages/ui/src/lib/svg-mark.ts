const SVG_NAMESPACE = "http://www.w3.org/2000/svg"

const ALLOWED_ELEMENTS = new Set([
	"svg",
	"g",
	"path",
	"circle",
	"ellipse",
	"rect",
	"line",
	"polyline",
	"polygon",
	"title",
	"desc",
])

const TEXT_HOLDERS = new Set(["title", "desc"])

const ROOT_ONLY_ATTRIBUTES = new Set(["version", "xmlns:xlink"])

const ALLOWED_ATTRIBUTES = new Set([
	"xmlns",
	"class",
	"viewBox",
	"width",
	"height",
	"fill",
	"fill-rule",
	"clip-rule",
	"stroke",
	"stroke-width",
	"stroke-linecap",
	"stroke-linejoin",
	"opacity",
	"d",
	"cx",
	"cy",
	"r",
	"rx",
	"ry",
	"x",
	"y",
	"x1",
	"y1",
	"x2",
	"y2",
	"points",
	"transform",
])

const isAllowedChild = (
	child: ChildNode,
	parent: Element,
	namespace: string | null,
): boolean => {
	if (child.nodeType === child.TEXT_NODE) {
		return (
			TEXT_HOLDERS.has(parent.localName) || child.textContent?.trim() === ""
		)
	}
	return (
		child.nodeType === child.ELEMENT_NODE &&
		isAllowedElement(child as Element, namespace)
	)
}

const isAllowedElement = (
	element: Element,
	namespace: string | null,
): boolean =>
	ALLOWED_ELEMENTS.has(element.localName) &&
	element.namespaceURI === namespace &&
	Array.from(element.attributes).every(
		(attribute) =>
			ALLOWED_ATTRIBUTES.has(attribute.name) ||
			(element === element.ownerDocument.documentElement &&
				ROOT_ONLY_ATTRIBUTES.has(attribute.name)),
	) &&
	Array.from(element.childNodes).every((child) =>
		isAllowedChild(child, element, namespace),
	)

const allowedSvgMark = (mark: string): string | null => {
	if (
		typeof DOMParser === "undefined" ||
		typeof XMLSerializer === "undefined"
	) {
		return null
	}

	const document = new DOMParser().parseFromString(mark, "image/svg+xml")
	const root = document.documentElement
	const namespace = root.namespaceURI
	const isSvgRoot =
		root.localName === "svg" &&
		(namespace === SVG_NAMESPACE || namespace === null)

	if (
		document.getElementsByTagName("parsererror").length > 0 ||
		!isSvgRoot ||
		!isAllowedElement(root, namespace)
	) {
		return null
	}

	return new XMLSerializer().serializeToString(root)
}

export { allowedSvgMark }
