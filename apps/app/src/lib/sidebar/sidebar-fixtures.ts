export const sidebarItemNamed = (name: string) =>
	[
		...document.querySelectorAll(
			'[data-slot="collapsed-sidebar-conversation"]',
		),
	].find((item) => item.getAttribute("aria-label") === name) ?? null

export const sidebarItemOf = (name: string) => {
	const item = sidebarItemNamed(name)
	if (!item) throw new Error(`no sidebar item for ${name}`)
	return item
}
