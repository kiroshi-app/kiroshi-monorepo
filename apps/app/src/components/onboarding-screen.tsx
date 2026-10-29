import { useState } from "react"

import { OnboardingAccountScreen } from "@workspace/ui/components/onboarding-account-screen"
import { OnboardingConnectScreen } from "@workspace/ui/components/onboarding-connect-screen"
import { OnboardingShell } from "@workspace/ui/components/onboarding-shell"
import {
	OnboardingWelcomeScreen,
	type OnboardingWelcomeStep,
} from "@workspace/ui/components/onboarding-welcome-screen"

import { ClaudeImport } from "@/components/claude-import"
import { useAccount, type WatchedAccount } from "@/lib/account/use-account"
import type { ClaudeImportScene } from "@/lib/onboarding/claude-import-controller"
import {
	connectAccountOf,
	connectStepOf,
	type OnboardingScreenStep,
} from "@/lib/onboarding/onboarding-screen"
import type { OnboardingFlow } from "@/lib/onboarding/use-onboarding-flow"

const WELCOME_STEPS: OnboardingWelcomeStep[] = [
	"companions",
	"conversations",
	"tools",
]

const LAST_WELCOME_PAGE = WELCOME_STEPS.length - 1

type OnboardingStepProps = {
	flow: OnboardingFlow
}

const OnboardingWelcome = ({ flow }: OnboardingStepProps) => {
	const [page, setPage] = useState(0)
	const leaveIntro = () => void flow.controller.leaveIntro()

	return (
		<OnboardingWelcomeScreen
			onBack={() => setPage(Math.max(page - 1, 0))}
			onNext={page === LAST_WELCOME_PAGE ? leaveIntro : () => setPage(page + 1)}
			onSkip={leaveIntro}
			step={WELCOME_STEPS[page] ?? "companions"}
		/>
	)
}

const OnboardingConnect = ({ flow }: OnboardingStepProps) => {
	const [code, setCode] = useState("")
	const [apiKey, setApiKey] = useState("")
	const { state, controller } = flow

	if (!state.connection) {
		return <OnboardingShell />
	}

	const signIn = () => {
		setCode("")
		void controller.signIn()
	}

	const tryAnotherKey = () => {
		setApiKey("")
		controller.askApiKey()
	}

	return (
		<OnboardingConnectScreen
			account={connectAccountOf(state.connection)}
			apiKey={apiKey}
			code={code}
			onApiKeyChange={setApiKey}
			onCodeChange={setCode}
			onDownloadAgain={() => void controller.downloadAgain()}
			onPasteKey={() => void controller.pasteKeyInstead()}
			onReopenSignIn={signIn}
			onSignIn={signIn}
			onSubmitCode={(value) => void controller.submitCode(value)}
			onSubmitKey={(value) => void controller.submitApiKey(value)}
			onTryAnotherKey={tryAnotherKey}
			onUseAccount={() => void controller.acceptAccount()}
			onUseAnotherAccount={controller.changeAccount}
			step={connectStepOf(state.connection, state.isBusy)}
		/>
	)
}

type OnboardingImportProps = OnboardingStepProps & {
	importScene: ClaudeImportScene
}

const OnboardingImport = ({ flow, importScene }: OnboardingImportProps) => (
	<ClaudeImport
		variant="onboarding"
		world={{
			...importScene,
			leave: () => void flow.controller.skipImport(),
		}}
	/>
)

type OnboardingAccountProps = OnboardingStepProps & {
	account: WatchedAccount
	readerName: string
}

const OnboardingAccount = ({
	flow,
	account,
	readerName,
}: OnboardingAccountProps) => {
	const { panel } = useAccount(account, readerName)
	const finish = () => void flow.controller.finish()

	return (
		<OnboardingAccountScreen
			account={panel.account}
			onCancel={panel.onCancel}
			onContinue={finish}
			onCopySignInLink={panel.onCopySignInLink}
			onSignIn={panel.onSignIn}
			onSkip={finish}
		/>
	)
}

type OnboardingScreenProps = OnboardingAccountProps & {
	step: OnboardingScreenStep
	importScene: ClaudeImportScene
}

export const OnboardingScreen = ({
	step,
	flow,
	account,
	readerName,
	importScene,
}: OnboardingScreenProps) => {
	switch (step) {
		case "welcome":
			return <OnboardingWelcome flow={flow} />
		case "connect":
			return <OnboardingConnect flow={flow} />
		case "import":
			return <OnboardingImport flow={flow} importScene={importScene} />
		case "account":
			return (
				<OnboardingAccount
					account={account}
					flow={flow}
					readerName={readerName}
				/>
			)
	}
}
