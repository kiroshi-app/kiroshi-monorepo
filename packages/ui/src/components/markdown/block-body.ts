type BlockRecord = Record<string, string>

type BlockBody = {
	fields: BlockRecord
	items: BlockRecord[]
}

type RecordShape = {
	required: readonly string[]
	optional?: readonly string[]
	urls?: readonly string[]
}

type BodyShape = {
	fields: RecordShape
	item?: RecordShape
}

const BLOCK_FIELD = /^([a-z][a-z-]*):(.*)$/
const ITEM_OPENING = /^- ([a-z][a-z-]*):(.*)$/
const ITEM_FIELD = /^ {2}([a-z][a-z-]*):(.*)$/

const isBlank = (line: string) => line.trim() === ""

const withField = (record: BlockRecord, key: string, rawValue: string) => {
	const value = rawValue.trim()
	if (value === "" || Object.hasOwn(record, key)) return false
	record[key] = value
	return true
}

const readLine = (body: BlockBody, line: string) => {
	const opening = ITEM_OPENING.exec(line)
	if (opening) {
		const item: BlockRecord = {}
		body.items.push(item)
		return withField(item, opening[1], opening[2])
	}

	const itemField = ITEM_FIELD.exec(line)
	if (itemField) {
		const item = body.items.at(-1)
		return item ? withField(item, itemField[1], itemField[2]) : false
	}

	const blockField = BLOCK_FIELD.exec(line)
	if (blockField && body.items.length === 0) {
		return withField(body.fields, blockField[1], blockField[2])
	}

	return false
}

const readBody = (source: string): BlockBody | null => {
	const body: BlockBody = { fields: {}, items: [] }
	const lines = source.split("\n").filter((line) => !isBlank(line))

	return lines.every((line) => readLine(body, line)) ? body : null
}

const isHttpsUrl = (value: string) => {
	try {
		return new URL(value).protocol === "https:"
	} catch {
		return false
	}
}

const fitsShape = (record: BlockRecord, shape: RecordShape) => {
	const allowed = new Set([...shape.required, ...(shape.optional ?? [])])
	const keys = Object.keys(record)

	return (
		keys.every((key) => allowed.has(key)) &&
		shape.required.every((key) => Object.hasOwn(record, key)) &&
		(shape.urls ?? []).every(
			(key) => !Object.hasOwn(record, key) || isHttpsUrl(record[key]),
		)
	)
}

const readShapedBody = (source: string, shape: BodyShape) => {
	const body = readBody(source)
	if (!body || !fitsShape(body.fields, shape.fields)) return null

	const { item } = shape
	const hasValidItems = item
		? body.items.length > 0 &&
			body.items.every((entry) => fitsShape(entry, item))
		: body.items.length === 0

	return hasValidItems ? body : null
}

export { type BlockBody, type BlockRecord, isHttpsUrl, readShapedBody }
