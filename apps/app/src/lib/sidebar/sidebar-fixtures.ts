const sidebarItemNamed = (name: string) =>
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

export const rosterRowNamed = (name: string) =>
	[...document.querySelectorAll('[data-slot="roster-row-name"]')]
		.find((label) => label.textContent === name)
		?.closest("button") ?? null

export const rosterRowOf = (name: string) => {
	const row = rosterRowNamed(name)
	if (!row) throw new Error(`no roster row for ${name}`)
	return row
}
