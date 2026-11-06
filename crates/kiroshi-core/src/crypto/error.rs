#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CryptoError {
	NotContributory,
	ForgedSignature,
	Unauthentic,
	Truncated,
	MalformedKey,
	NonceMismatch,
	ForeignSender,
	Replay,
	InstanceTooLong,
	NoRandomness,
}
