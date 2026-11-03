import {
	type BlockRecord,
	readShapedBody,
} from "@workspace/ui/components/markdown/block-body"
import {
	compileFormula,
	type Formula,
} from "@workspace/ui/components/markdown/formula"

type OptionsBlock = {
	label: "options"
	question?: string
	options: { title: string; text: string }[]
}

type IllustratedListBlock = {
	label: "illustrated-list"
	items: { title: string; image: string; text?: string }[]
}

type GalleryBlock = {
	label: "gallery"
	images: { image: string; alt: string; caption?: string }[]
}

type InteractiveSlider = {
	name: string
	label: string
	min: number
	max: number
	step: number
	defaultValue: number
}

type InteractiveBlock = {
	label: "interactive"
	result: Formula
	resultLabel: string
	sliders: InteractiveSlider[]
}

type CollapsibleBlock = {
	label: "collapsible"
	title: string
	content: string
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

const readOptions = (source: string): OptionsBlock | null => {
	const body = readShapedBody(source, {
		fields: { required: [], optional: ["question"] },
		item: { required: ["title", "text"] },
	})
	if (!body) return null

	return {
		label: "options",
		question: body.fields.question,
		options: body.items.map(({ title, text }) => ({ title, text })),
	}
}

const readIllustratedList = (source: string): IllustratedListBlock | null => {
	const body = readShapedBody(source, {
		fields: { required: [] },
		item: {
			required: ["title", "image"],
			optional: ["text", "link"],
			urls: ["image", "link"],
		},
	})
	if (!body) return null

	return {
		label: "illustrated-list",
		items: body.items.map(({ title, image, text }) => ({ title, image, text })),
	}
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

const readSlider = (item: BlockRecord): InteractiveSlider | null => {
	const numbers = [item.min, item.max, item.step, item.default]
	if (!SLIDER_NAME.test(item.name)) return null
	if (!numbers.every((value) => DECIMAL.test(value))) return null

	const [min, max, step, defaultValue] = numbers.map(Number)
	const holds =
		max > min && step > 0 && defaultValue >= min && defaultValue <= max

	return holds
		? { name: item.name, label: item.label, min, max, step, defaultValue }
		: null
}

const readInteractive = (source: string): InteractiveBlock | null => {
	const body = readShapedBody(source, {
		fields: { required: ["result", "result-label"] },
		item: { required: ["name", "label", "min", "max", "step", "default"] },
	})
	if (!body || body.items.length > MAX_SLIDERS) return null

	const sliders = body.items.map(readSlider)
	if (!sliders.every((slider) => slider !== null)) return null

	const names = new Set(sliders.map(({ name }) => name))
	if (names.size !== sliders.length) return null

	const result = compileFormula(body.fields.result, names)
	if (!result) return null

	return {
		label: "interactive",
		result,
		resultLabel: body.fields["result-label"],
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

const readCollapsible = (source: string): CollapsibleBlock | null => {
	const parts = splitAtFirstBlankLine(source)
	if (!parts || parts.content === "" || FENCE_LINE.test(parts.content)) {
		return null
	}

	const body = readShapedBody(parts.head, { fields: { required: ["title"] } })
	if (!body) return null

	return {
		label: "collapsible",
		title: body.fields.title,
		content: parts.content,
	}
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
	isAnswerBlockLabel,
	readAnswerBlock,
}
