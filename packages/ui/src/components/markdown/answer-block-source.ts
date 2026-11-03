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

type AnswerBlock =
	| OptionsBlock
	| IllustratedListBlock
	| GalleryBlock
	| InteractiveBlock
	| CollapsibleBlock

type AnswerBlockLabel = AnswerBlock["label"]

const SLIDER_NAME = /^[a-z][a-z0-9_]*$/
const SLIDER_NUMBER = /^-?\d+(?:\.\d+)?$/
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
	if (!numbers.every((value) => SLIDER_NUMBER.test(value))) return null

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

const READERS: Readonly<
	Record<AnswerBlockLabel, (source: string) => AnswerBlock | null>
> = {
	options: readOptions,
	"illustrated-list": readIllustratedList,
	gallery: readGallery,
	interactive: readInteractive,
	collapsible: readCollapsible,
}

const isAnswerBlockLabel = (label?: string): label is AnswerBlockLabel =>
	label !== undefined && Object.hasOwn(READERS, label)

const readAnswerBlock = (label: AnswerBlockLabel, source: string) =>
	READERS[label](source)

export {
	type AnswerBlock,
	type AnswerBlockLabel,
	type InteractiveBlock,
	type InteractiveSlider,
	isAnswerBlockLabel,
	readAnswerBlock,
}
