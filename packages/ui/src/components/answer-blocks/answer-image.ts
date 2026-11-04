type AnswerImage = {
	src: string
	alt?: string
	caption?: string
}

const accessibleNameOf = (image: AnswerImage, blockTitle: string) =>
	image.alt?.trim() || image.caption?.trim() || blockTitle

export { type AnswerImage, accessibleNameOf }
