import {
	type Layout,
	MOVE_EPSILON,
	type ViewportTrace,
} from "@workspace/ui/lib/scroll-trace-model"

export const readerTopOf = (
	viewport: HTMLElement,
	element: Element | undefined,
) =>
	element?.isConnected
		? element.getBoundingClientRect().top - viewport.getBoundingClientRect().top
		: null

export const readLayout = (
	{ viewport, content, readTop }: ViewportTrace,
	reader: Element | undefined,
): Layout => {
	const items = content ? Array.from(content.children) : []
	return {
		scrollTop: readTop(),
		scrollHeight: viewport.scrollHeight,
		clientHeight: viewport.clientHeight,
		clientWidth: viewport.clientWidth,
		items,
		heights: new Map(
			items.map((item) => [item, item.getBoundingClientRect().height]),
		),
		reader,
		readerTop: readerTopOf(viewport, reader),
	}
}

export const firstRowInView = ({ viewport, content }: ViewportTrace) => {
	const top = viewport.getBoundingClientRect().top
	const rows = Array.from(
		content?.querySelectorAll(":scope > [data-message-id]") ?? [],
	)
	return (
		rows.find((row) => row.getBoundingClientRect().top >= top - MOVE_EPSILON) ??
		rows.at(-1)
	)
}
