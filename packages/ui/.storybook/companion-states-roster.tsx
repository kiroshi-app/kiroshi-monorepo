import { type ComponentType, useId, useState } from "react"
import { expect, userEvent, within } from "storybook/test"

import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import type {
	FieldAvatarProps,
	FieldState,
} from "@workspace/ui/components/companion-field"
import {
	RadioGroup,
	RadioGroupItem,
} from "@workspace/ui/components/ui/radio-group"

type RosterChoice = "mixed" | FieldState

type CompanionStatesRosterProps = {
	Avatar: ComponentType<FieldAvatarProps>
}

type RosterPlay = { canvasElement: HTMLElement }

type RosterCompanion = Required<Omit<FieldAvatarProps, "size">>

const ROSTER: RosterCompanion[] = [
	{ name: "Lyra", hue: BLOT_HUES.blue, state: "idle" },
	{ name: "Orion", hue: BLOT_HUES.blue, state: "thinking" },
	{ name: "Vega", hue: BLOT_HUES.orange, state: "idle" },
	{ name: "Atlas", hue: BLOT_HUES.green, state: "searching" },
	{ name: "Nova", hue: BLOT_HUES.purple, state: "idle" },
	{ name: "Sirius", hue: BLOT_HUES.pink, state: "writing" },
	{ name: "Castor", hue: BLOT_HUES.cyan, state: "working" },
]

const CHOICES: RosterChoice[] = [
	"mixed",
	"idle",
	"thinking",
	"searching",
	"working",
	"writing",
	"waiting",
]

const LADDER = [16, 40, 96]

const SWITCHED_STATE: FieldState = "working"

const RESTING_STATE: FieldState = "idle"

const STILL_WAIT = 300

const pause = (duration: number) =>
	new Promise((resolve) => setTimeout(resolve, duration))

export const CompanionStatesRoster = ({
	Avatar,
}: CompanionStatesRosterProps) => {
	const [choice, setChoice] = useState<RosterChoice>("mixed")
	const group = useId()
	const stateOf = (state: FieldState) => (choice === "mixed" ? state : choice)
	const [featured] = ROSTER

	return (
		<div className="flex flex-col gap-8 text-foreground text-sm">
			<RadioGroup
				aria-label="State"
				className="flex flex-wrap gap-4"
				onValueChange={(value) => setChoice(value as RosterChoice)}
				value={choice}
			>
				{CHOICES.map((option) => (
					<label
						className="flex items-center gap-2"
						htmlFor={`${group}-${option}`}
						key={option}
					>
						<RadioGroupItem id={`${group}-${option}`} value={option} />
						{option}
					</label>
				))}
			</RadioGroup>
			<fieldset aria-label="Roster" className="flex gap-4">
				{ROSTER.map((companion) => (
					<div
						className="flex flex-col items-center gap-2"
						key={companion.name}
					>
						<Avatar
							name={companion.name}
							size={40}
							state={stateOf(companion.state)}
							hue={companion.hue}
						/>
						<span className="text-muted-foreground text-xs">
							{companion.name}
						</span>
					</div>
				))}
			</fieldset>
			<fieldset aria-label="Sizes" className="flex items-end gap-4">
				{LADDER.map((size) => (
					<Avatar
						key={size}
						name={featured.name}
						size={size}
						state={stateOf(featured.state)}
						hue={featured.hue}
					/>
				))}
			</fieldset>
		</div>
	)
}

const statesIn = (roster: HTMLElement) =>
	within(roster)
		.getAllByRole("img")
		.map((avatar) => avatar.dataset.state)

const framesIn = (roster: HTMLElement) =>
	Array.from(roster.querySelectorAll("canvas"), (canvas) => canvas.toDataURL())

const pickState = (control: HTMLElement, state: FieldState) =>
	userEvent.click(within(control).getByRole("radio", { name: state }))

export const playCompanionStatesRoster = async ({
	canvasElement,
}: RosterPlay) => {
	const canvas = within(canvasElement)
	const controls = canvas.getAllByRole("radiogroup", { name: "State" })
	const rosters = canvas.getAllByRole("group", { name: "Roster" })

	await expect(rosters.length).toBeGreaterThan(0)
	await expect(rosters).toHaveLength(controls.length)

	for (const [index, roster] of rosters.entries()) {
		await expect(within(roster).getAllByRole("img")).toHaveLength(ROSTER.length)
		for (const { name } of ROSTER)
			await expect(within(roster).getByRole("img", { name })).toBeVisible()
		await expect(new Set(statesIn(roster)).size).toBe(5)

		await pickState(controls[index], SWITCHED_STATE)
		await expect(statesIn(roster)).toEqual(ROSTER.map(() => SWITCHED_STATE))

		await pickState(controls[index], RESTING_STATE)
		await expect(statesIn(roster)).toEqual(ROSTER.map(() => RESTING_STATE))
		const resting = framesIn(roster)
		await pause(STILL_WAIT)
		await expect(framesIn(roster)).toEqual(resting)
	}
}
