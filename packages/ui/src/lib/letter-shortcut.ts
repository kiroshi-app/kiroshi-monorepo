import { isMacPlatform } from "@workspace/ui/lib/platform"

const LATIN_LETTER = /^[a-z]$/i

const UNREPORTED_KEY_CODE = 0

const LEGACY_COMPOSITION_KEY_CODE = 229

const isComposing = (event: KeyboardEvent) =>
	event.isComposing || event.keyCode === LEGACY_COMPOSITION_KEY_CODE

const printsLetter = (
	{ key, keyCode, code }: KeyboardEvent,
	letter: string,
) => {
	const capital = letter.toUpperCase()
	if (LATIN_LETTER.test(key)) return key.toUpperCase() === capital
	if (keyCode !== UNREPORTED_KEY_CODE) return keyCode === capital.charCodeAt(0)
	return code === `Key${capital}`
}

export const isCommandAltLetter = (event: KeyboardEvent, letter: string) =>
	!isComposing(event) &&
	(isMacPlatform() ? event.metaKey : event.ctrlKey) &&
	event.altKey &&
	printsLetter(event, letter)
