export const rosterRowNamed = (name: string) =>
	[...document.querySelectorAll('[data-slot="roster-row-name"]')]
		.find((label) => label.textContent === name)
		?.closest("button") ?? null

export const rosterRowOf = (name: string) => {
	const row = rosterRowNamed(name)
	if (!row) throw new Error(`no roster row for ${name}`)
	return row
}
