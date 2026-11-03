import {
	type BlockRecord,
	fitsShape,
	type RecordShape,
	readShapedBody,
} from "@workspace/ui/components/markdown/block-body"
import {
	compileFormula,
	type Formula,
} from "@workspace/ui/components/markdown/formula"

type OptionsBlock = {
	label: "options"
	question?: string
	subtitle?: string
	options: { title: string; text: string }[]
}

type IllustratedListBlock = {
	label: "illustrated-list"
	items: {
		title: string
		image: string
		text?: string
		badge?: string
		meta?: string
	}[]
}

type ChecklistBlock = {
	label: "checklist"
	title: string
	items: { text: string; isDone: boolean; assignee?: string }[]
}

type GalleryBlock = {
	label: "gallery"
	images: { image: string; alt: string; caption?: string }[]
}

type Measure = {
	currency?: string
	unit?: string
}

type InteractiveSlider = {
	name: string
	label: string
	min: number
	max: number
	step: number
	defaultValue: number
	measure: Measure
}

type InteractiveTemplate = readonly (string | Formula)[]

type InteractiveBlock = {
	label: "interactive"
	title?: string
	result: Formula
	resultLabel: string
	measure: Measure
	note?: InteractiveTemplate
	meter?: { ratio: Formula; caption: InteractiveTemplate }
	breakdown: { label: string; value: Formula }[]
	source?: string
	sliders: InteractiveSlider[]
}

type CollapsibleSection = {
	title: string
	value?: string
	content: string
}

type CollapsibleBlock = {
	label: "collapsible"
	sections: CollapsibleSection[]
}

type WebPageBlock = {
	label: "web-page"
	url: string
	title: string
	site?: string
	image?: string
	alt?: string
}

type VideoBlock = {
	label: "video"
	url: string
	title: string
	duration: number
	source?: string
	poster?: string
	marker?: { time: number; label?: string }
}

type MapPlace = {
	name: string
	latitude: number
	longitude: number
}

type MapBlock = {
	label: "map"
	title: string
	subtitle?: string
	area?: string
	link?: string
	places: MapPlace[]
}

type AnswerBlock =
	| OptionsBlock
	| IllustratedListBlock
	| ChecklistBlock
	| GalleryBlock
	| InteractiveBlock
	| CollapsibleBlock
	| WebPageBlock
	| VideoBlock
	| MapBlock

type AnswerBlockLabel = AnswerBlock["label"]

const SLIDER_NAME = /^[a-z][a-z0-9_]*$/
const DECIMAL = /^-?\d+(?:\.\d+)?$/
const CLOCK_TIME = /^(?:(\d+):)?([0-5]?\d):([0-5]\d)$/
const MAX_SLIDERS = 5
const FENCE_LINE = /^ {0,3}(?:`{3,}|~{3,})/m
const CURRENCY_CODE = /^[A-Z]{3}$/
const PLACEHOLDER = /\{([^{}]*)\}/
const BRACE = /[{}]/
const SECTION_HEAD_LINE = /^(?:title|value):/
const DONE_STATES: Readonly<Record<string, boolean>> = { yes: true, no: false }

const SLIDER_SHAPE: RecordShape = {
	required: ["name", "label", "min", "max", "step", "default"],
	optional: ["currency", "unit"],
}
const BREAKDOWN_ROW_SHAPE: RecordShape = { required: ["row", "value"] }

const isPresent = <Value>(value: Value | null): value is Value => value !== null

const readOptions = (source: string): OptionsBlock | null => {
	const body = readShapedBody(source, {
		fields: { required: [], optional: ["question", "subtitle"] },
		item: { required: ["title", "text"] },
	})
	if (!body) return null

	return {
		label: "options",
		question: body.fields.question,
		subtitle: body.fields.subtitle,
		options: body.items.map(({ title, text }) => ({ title, text })),
	}
}

const readIllustratedList = (source: string): IllustratedListBlock | null => {
	const body = readShapedBody(source, {
		fields: { required: [] },
		item: {
			required: ["title", "image"],
			optional: ["text", "link", "badge", "meta"],
			urls: ["image", "link"],
		},
	})
	if (!body) return null

	return {
		label: "illustrated-list",
		items: body.items.map(({ title, image, text, badge, meta }) => ({
			title,
			image,
			text,
			badge,
			meta,
		})),
	}
}

const readChecklist = (source: string): ChecklistBlock | null => {
	const body = readShapedBody(source, {
		fields: { required: ["title"] },
		item: { required: ["text"], optional: ["done", "assignee"] },
	})
	if (!body) return null

	const items = body.items.map(({ text, done = "no", assignee }) =>
		Object.hasOwn(DONE_STATES, done)
			? { text, isDone: DONE_STATES[done], assignee }
			: null,
	)
	if (!items.every(isPresent)) return null

	return { label: "checklist", title: body.fields.title, items }
}

const readGallery = (source: string): GalleryBlock | null => {
	const body = readShapedBody(source, {
		fields: { required: [] },
		item: {
			required: ["image", "alt"],
			optional: ["caption", "source"],
			urls: ["image", "source"],
		},
	})
	if (!body) return null

	return {
		label: "gallery",
		images: body.items.map(({ image, alt, caption }) => ({
			image,
			alt,
			caption,
		})),
	}
}

const readMeasure = ({ currency, unit }: BlockRecord): Measure | null => {
	if (currency !== undefined && unit !== undefined) return null
	if (currency !== undefined && !CURRENCY_CODE.test(currency)) return null
	return { currency, unit }
}

const readSlider = (item: BlockRecord): InteractiveSlider | null => {
	const numbers = [item.min, item.max, item.step, item.default]
	const measure = readMeasure(item)
	if (!fitsShape(item, SLIDER_SHAPE) || !measure) return null
	if (!SLIDER_NAME.test(item.name)) return null
	if (!numbers.every((value) => DECIMAL.test(value))) return null

	const [min, max, step, defaultValue] = numbers.map(Number)
	const holds =
		max > min && step > 0 && defaultValue >= min && defaultValue <= max

	return holds
		? {
				name: item.name,
				label: item.label,
				min,
				max,
				step,
				defaultValue,
				measure,
			}
		: null
}

const compileTemplate = (
	source: string,
	names: ReadonlySet<string>,
): InteractiveTemplate | null => {
	const parts = source
		.split(PLACEHOLDER)
		.map((piece, index) =>
			index % 2 === 1
				? compileFormula(piece, names)
				: BRACE.test(piece)
					? null
					: piece,
		)
	return parts.every(isPresent) ? parts : null
}

const readMeter = (fields: BlockRecord, names: ReadonlySet<string>) => {
	const { meter, "meter-caption": caption } = fields
	if (meter === undefined && caption === undefined) return undefined
	if (meter === undefined || caption === undefined) return null

	const ratio = compileFormula(meter, names)
	const captionTemplate = compileTemplate(caption, names)
	return ratio && captionTemplate ? { ratio, caption: captionTemplate } : null
}

const readBreakdownRow = (item: BlockRecord, names: ReadonlySet<string>) => {
	const value = fitsShape(item, BREAKDOWN_ROW_SHAPE)
		? compileFormula(item.value, names)
		: null
	return value ? { label: item.row, value } : null
}

const isBreakdownRow = (item: BlockRecord) => Object.hasOwn(item, "row")

const readInteractive = (source: string): InteractiveBlock | null => {
	const body = readShapedBody(source, {
		fields: {
			required: ["result", "result-label"],
			optional: [
				"title",
				"currency",
				"unit",
				"note",
				"meter",
				"meter-caption",
				"source",
			],
		},
		item: {
			required: [],
			optional: [
				...SLIDER_SHAPE.required,
				...(SLIDER_SHAPE.optional ?? []),
				...BREAKDOWN_ROW_SHAPE.required,
			],
		},
	})
	if (!body) return null

	const sliderItems = body.items.filter((item) => !isBreakdownRow(item))
	if (sliderItems.length === 0 || sliderItems.length > MAX_SLIDERS) return null

	const sliders = sliderItems.map(readSlider)
	if (!sliders.every(isPresent)) return null

	const names = new Set(sliders.map(({ name }) => name))
	if (names.size !== sliders.length) return null

	const { fields } = body
	const result = compileFormula(fields.result, names)
	const measure = readMeasure(fields)
	const note =
		fields.note === undefined ? undefined : compileTemplate(fields.note, names)
	const meter = readMeter(fields, names)
	const breakdown = body.items
		.filter(isBreakdownRow)
		.map((item) => readBreakdownRow(item, names))
	const holds = result && measure && note !== null && meter !== null
	if (!holds || !breakdown.every(isPresent)) return null

	return {
		label: "interactive",
		title: fields.title,
		result,
		resultLabel: fields["result-label"],
		measure,
		note,
		meter,
		breakdown,
		source: fields.source,
		sliders,
	}
}

const splitAtFirstBlankLine = (source: string) => {
	const lines = source.split("\n")
	const blank = lines.findIndex((line) => line.trim() === "")
	if (blank === -1) return null

	return {
		head: lines.slice(0, blank).join("\n"),
		content: lines
			.slice(blank + 1)
			.join("\n")
			.trim(),
	}
}

const readSection = (source: string): CollapsibleSection | null => {
	const parts = splitAtFirstBlankLine(source)
	if (!parts || parts.content === "" || FENCE_LINE.test(parts.content)) {
		return null
	}

	const body = readShapedBody(parts.head, {
		fields: { required: ["title"], optional: ["value"] },
	})
	if (!body) return null

	const { title, value } = body.fields
	return { title, value, content: parts.content }
}

const isSectionStart = (lines: readonly string[], index: number) => {
	if (index > 0 && lines[index - 1].trim() !== "") return false
	if (!lines[index].startsWith("title:")) return false

	const blank = lines.findIndex(
		(line, position) => position > index && line.trim() === "",
	)
	return lines
		.slice(index, blank === -1 ? undefined : blank)
		.every((line) => SECTION_HEAD_LINE.test(line))
}

const readCollapsible = (source: string): CollapsibleBlock | null => {
	const lines = source.split("\n")
	const starts = lines.flatMap((_, index) =>
		index > 0 && isSectionStart(lines, index) ? [index] : [],
	)
	const sections = [0, ...starts].map((start, position) =>
		readSection(lines.slice(start, starts[position]).join("\n")),
	)
	if (!sections.every(isPresent)) return null

	return { label: "collapsible", sections }
}

const readWebPage = (source: string): WebPageBlock | null => {
	const body = readShapedBody(source, {
		fields: {
			required: ["url", "title"],
			optional: ["description", "site", "image", "alt"],
			urls: ["url", "image"],
		},
	})
	if (!body) return null

	const { url, title, site, image, alt } = body.fields
	return { label: "web-page", url, title, site, image, alt }
}

const readSeconds = (time: string) => {
	const match = CLOCK_TIME.exec(time)
	if (!match) return null

	const [, hours = "0", minutes, seconds] = match
	return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
}

const readVideo = (source: string): VideoBlock | null => {
	const body = readShapedBody(source, {
		fields: {
			required: ["url", "title", "duration"],
			optional: ["source", "poster", "marker", "marker-label"],
			urls: ["url", "poster"],
		},
	})
	if (!body) return null

	const { url, title, poster, marker } = body.fields
	const duration = readSeconds(body.fields.duration)
	const markerTime = marker === undefined ? undefined : readSeconds(marker)
	if (!duration || markerTime === null || (markerTime ?? 0) > duration) {
		return null
	}

	return {
		label: "video",
		url,
		title,
		duration,
		source: body.fields.source,
		poster,
		marker:
			markerTime === undefined
				? undefined
				: { time: markerTime, label: body.fields["marker-label"] },
	}
}

const readPlace = (item: BlockRecord): MapPlace | null => {
	if (!DECIMAL.test(item.lat) || !DECIMAL.test(item.lon)) return null

	const latitude = Number(item.lat)
	const longitude = Number(item.lon)
	return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
		? { name: item.name, latitude, longitude }
		: null
}

const readMap = (source: string): MapBlock | null => {
	const body = readShapedBody(source, {
		fields: {
			required: ["title"],
			optional: ["subtitle", "area", "link"],
			urls: ["link"],
		},
		item: { required: ["name", "lat", "lon"] },
	})
	if (!body) return null

	const places = body.items.map(readPlace)
	if (!places.every((place) => place !== null)) return null

	const { title, subtitle, area, link } = body.fields
	return { label: "map", title, subtitle, area, link, places }
}

const READERS: Readonly<
	Record<AnswerBlockLabel, (source: string) => AnswerBlock | null>
> = {
	options: readOptions,
	"illustrated-list": readIllustratedList,
	checklist: readChecklist,
	gallery: readGallery,
	interactive: readInteractive,
	collapsible: readCollapsible,
	"web-page": readWebPage,
	video: readVideo,
	map: readMap,
}

const isAnswerBlockLabel = (label?: string): label is AnswerBlockLabel =>
	label !== undefined && Object.hasOwn(READERS, label)

const readAnswerBlock = (label: AnswerBlockLabel, source: string) =>
	READERS[label](source)

export {
	type AnswerBlock,
	type AnswerBlockLabel,
	type InteractiveBlock,
	type InteractiveTemplate,
	isAnswerBlockLabel,
	type Measure,
	readAnswerBlock,
}
