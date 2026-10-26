type MotionPreference = "reduce" | "no-preference"

type EmulateMotionPreference = (preference: MotionPreference) => Promise<void>

type StoryMotionContext = {
	parameters: { motionPreference?: MotionPreference }
}

const PROJECT_MOTION_PREFERENCE: MotionPreference = "reduce"

let emulateMotionPreference: EmulateMotionPreference | undefined

const provideMotionEmulation = (emulate: EmulateMotionPreference) => {
	emulateMotionPreference = emulate
}

const emulateStoryMotionPreference = async ({
	parameters,
}: StoryMotionContext) => {
	const emulate = emulateMotionPreference
	if (!emulate || !parameters.motionPreference) return
	await emulate(parameters.motionPreference)
	return () => emulate(PROJECT_MOTION_PREFERENCE)
}

export type { MotionPreference }
export { emulateStoryMotionPreference, provideMotionEmulation }
