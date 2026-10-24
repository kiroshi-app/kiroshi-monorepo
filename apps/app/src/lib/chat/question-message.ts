import type {
	AskedQuestion,
	QuestionAnswers,
	QuestionOption,
	QuestionRequest,
} from "../agent/contract"

export const oneLine = (text: string): string =>
	text.replace(/\s+/g, " ").trim()

const QUESTION_LINE_PREFIX = "### "

const OPTION_LINE_PREFIX = "- "

const OPTION_SEPARATOR = " \u2014 "

const optionLine = ({ label, description }: QuestionOption): string =>
	description
		? `${OPTION_LINE_PREFIX}${oneLine(label)}${OPTION_SEPARATOR}${oneLine(description)}`
		: `${OPTION_LINE_PREFIX}${oneLine(label)}`

const askedLines = (asked: AskedQuestion): string[] => [
	`${QUESTION_LINE_PREFIX}${oneLine(asked.question)}`,
	...asked.options.map(optionLine),
]

const QUESTION_MESSAGE_PREFIX = "question-"

export const questionMessageIdOf = (requestId: string): string =>
	`${QUESTION_MESSAGE_PREFIX}${requestId}`

export const isQuestionMessageId = (messageId: string): boolean =>
	messageId.startsWith(QUESTION_MESSAGE_PREFIX)

export const questionMessageText = (request: QuestionRequest): string =>
	request.questions.flatMap(askedLines).join("\n")

type WrittenOption = {
	label: string
	description: string
}

export type WrittenQuestion = {
	question: string
	options: WrittenOption[]
}

const writtenOptionOf = (line: string): WrittenOption => {
	const [label = "", ...description] = line
		.slice(OPTION_LINE_PREFIX.length)
		.split(OPTION_SEPARATOR)
	return { label, description: description.join(OPTION_SEPARATOR) }
}

export const writtenQuestionsOf = (text: string): WrittenQuestion[] | null => {
	const written: WrittenQuestion[] = []
	for (const line of text.split("\n")) {
		const current = written.at(-1)
		if (line.startsWith(QUESTION_LINE_PREFIX)) {
			written.push({
				question: line.slice(QUESTION_LINE_PREFIX.length),
				options: [],
			})
		} else if (current && line.startsWith(OPTION_LINE_PREFIX)) {
			current.options.push(writtenOptionOf(line))
		} else {
			return null
		}
	}
	return written
}

export const answersFromText = (
	request: QuestionRequest,
	text: string,
): QuestionAnswers => {
	const asked = request.questions[0]
	return asked ? { [asked.question]: text } : {}
}

export const answeredText = (
	request: QuestionRequest,
	answers: QuestionAnswers,
): string =>
	request.questions
		.flatMap(({ question }) => answers[question] || [])
		.join("\n\n")
