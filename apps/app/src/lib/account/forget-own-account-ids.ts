const OWN_ACCOUNTS_KEY = "ownAccountIds"

export const forgetOwnAccountIds = () => {
	localStorage.removeItem(OWN_ACCOUNTS_KEY)
}
