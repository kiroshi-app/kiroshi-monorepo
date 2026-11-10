type GreetingPeriod = "morning" | "afternoon" | "evening" | "night"

const MORNING_FROM = 5
const AFTERNOON_FROM = 12
const EVENING_FROM = 18
const NIGHT_FROM = 22

const greetingPeriodOf = (hour: number): GreetingPeriod => {
	if (hour >= NIGHT_FROM || hour < MORNING_FROM) return "night"
	if (hour >= EVENING_FROM) return "evening"
	if (hour >= AFTERNOON_FROM) return "afternoon"
	return "morning"
}

export { type GreetingPeriod, greetingPeriodOf }
