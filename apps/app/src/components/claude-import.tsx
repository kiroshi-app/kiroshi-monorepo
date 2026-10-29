import { ImportScreen } from "@workspace/ui/components/import-screen"
import { OnboardingShell } from "@workspace/ui/components/onboarding-shell"

import {
	type ClaudeImportInput,
	useClaudeImport,
} from "@/lib/onboarding/use-claude-import"

export const ClaudeImport = (input: ClaudeImportInput) => {
	const screen = useClaudeImport(input)

	return screen ? <ImportScreen {...screen} /> : <OnboardingShell />
}
