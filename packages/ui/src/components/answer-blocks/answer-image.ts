type AnswerImage = {
	src: string
	alt?: string
}

const accessibleNameOf = (image: AnswerImage, blockTitle: string) =>
	image.alt?.trim() || blockTitle

export { type AnswerImage, accessibleNameOf }
