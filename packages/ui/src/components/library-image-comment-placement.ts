type ScreenPoint = { x: number; y: number }

type CardSize = { width: number; height: number }

type StageEdges = { left: number; top: number; right: number; bottom: number }

const PIN_SIZE = 32
const GAP_AFTER_PIN = 8
const GAP_BEFORE_PIN = 12

const clampBetween = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(value, max))

const imageCardCornerOf = (
	pinTail: ScreenPoint,
	card: CardSize,
	stage: StageEdges,
): ScreenPoint => {
	const afterPin = pinTail.x + PIN_SIZE + GAP_AFTER_PIN
	const beforePin = pinTail.x - GAP_BEFORE_PIN - card.width
	const fitsAfterPin = afterPin + card.width <= stage.right
	const fitsBeforePin = beforePin >= stage.left

	return {
		x: clampBetween(
			fitsAfterPin || !fitsBeforePin ? afterPin : beforePin,
			stage.left,
			stage.right - card.width,
		),
		y: clampBetween(
			pinTail.y - PIN_SIZE,
			stage.top,
			stage.bottom - card.height,
		),
	}
}

export { imageCardCornerOf }
