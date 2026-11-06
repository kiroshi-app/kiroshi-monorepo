const ID_SLOT = "^ID"

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const markdownWithIds = (markdown: string) =>
	new RegExp(`^${markdown.split(ID_SLOT).map(escaped).join("\\^[a-z0-9]{6}")}$`)

export { markdownWithIds }
