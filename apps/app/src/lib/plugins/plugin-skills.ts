import type { BotSkillDraft as EditedSkill } from "@workspace/ui/components/bot-settings"

import type { Plugin } from "./use-plugin"

import { toSkillDraft, toSkillFiles, toSkillItem } from "../bots/skill-draft"

export const toPluginSkills = ({ state, actions }: Plugin) => ({
	skills: state.skills.map(toSkillItem),
	skillFiles: toSkillFiles(state.skills, state.file, actions),
	onSkillChange: (id: string, draft: EditedSkill) =>
		actions.saveSkill(
			id,
			toSkillDraft(
				draft,
				state.skills.find((skill) => skill.id === id),
			),
		),
	onSkillCreate: (draft: EditedSkill, isPreloaded: boolean) =>
		actions.createSkill(toSkillDraft(draft), isPreloaded),
	onSkillDelete: actions.removeSkill,
	onSkillPreloadedChange: actions.setSkillPreloaded,
})
