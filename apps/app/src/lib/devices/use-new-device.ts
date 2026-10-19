import { skipToken, useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"

import type {
	NewDeviceScreenProps,
	NewDeviceStep,
} from "@workspace/ui/components/new-device-screen"

import { answerOf, deviceFailureNotice } from "./device-actions"
import { fingerprintOf } from "./device-mapping"
import { deviceApprovalQuery } from "./device-queries"
import { deviceQueryKeys } from "./device-query-keys"

import {
	type AccountState,
	commands,
	DEVICE_APPROVAL_CHANGED_EVENT,
	type DeviceApproval,
} from "../bindings"
import { useAccount, type WatchedAccount } from "../account/use-account"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"

const RAISED_IN = "use-new-device"

const FAILURE_META = { failureNotice: deviceFailureNotice, raisedIn: RAISED_IN }

const readIdentity = () => answerOf(commands.getDeviceIdentity())

const isRefused = (state: AccountState | undefined) =>
	state?.kind === "signedOut" && state.reason === "deviceRefused"

const stepOf = (
	approval: DeviceApproval | undefined,
	state: AccountState | undefined,
	isCodeAsked: boolean,
): NewDeviceStep | null => {
	if (isRefused(state)) return "rejected"
	if (approval?.kind === "expired") return "expired"
	if (approval?.kind !== "pending") return null
	return isCodeAsked ? "code" : "waiting"
}

const useLastSignedInEmail = (state: AccountState | undefined) => {
	const [lastEmail, setLastEmail] = useState("")
	const email = state?.kind === "signedIn" ? state.email : lastEmail
	if (email !== lastEmail) setLastEmail(email)
	return email
}

export const useNewDevice = (
	watched: WatchedAccount,
): NewDeviceScreenProps | null => {
	const { state } = watched
	const [isCodeAsked, setCodeAsked] = useState(false)
	const email = useLastSignedInEmail(state)
	const { panel } = useAccount(watched, "")

	const { data: approval } = useQuery(deviceApprovalQuery)
	useInvalidateOnHostEvent(DEVICE_APPROVAL_CHANGED_EVENT, [
		deviceQueryKeys.approval(),
	])
	if (isCodeAsked && approval?.kind !== "pending") setCodeAsked(false)
	const step = stepOf(approval, state, isCodeAsked)

	const { data: identity } = useQuery({
		queryKey: deviceQueryKeys.identity(),
		queryFn: step ? readIdentity : skipToken,
		staleTime: Number.POSITIVE_INFINITY,
		meta: FAILURE_META,
	})
	const retry = useMutation({
		mutationFn: () => answerOf(commands.deviceApprovalRetry()),
		meta: FAILURE_META,
	})
	const codeRequest = useMutation({
		mutationFn: () => answerOf(commands.deviceApprovalCodeRequest()),
		meta: FAILURE_META,
	})
	const codeSubmission = useMutation({
		mutationFn: (code: string) =>
			answerOf(commands.deviceApprovalCodeSubmit(code)),
		meta: FAILURE_META,
	})

	if (!step) return null
	return {
		step,
		email,
		device: {
			kind: "laptop",
			// TODO: no binding gives a pending device its own name.
			name: "",
			fingerprint: fingerprintOf(identity?.fingerprint ?? null),
		},
		onUseCode: () => {
			setCodeAsked(true)
			codeRequest.mutate()
		},
		onApproveWithCode: (code) => codeSubmission.mutate(code),
		onResendCode: () => codeRequest.mutate(),
		onAskAgain: () => retry.mutate(),
		onSignOut: panel.onSignOut,
		onBackToSignIn: panel.onSignIn,
	}
}
