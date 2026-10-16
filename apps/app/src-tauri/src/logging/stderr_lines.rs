const LONGEST_STDERR_LINE: usize = 2048;

#[derive(Default)]
pub struct StderrLines {
	pending: Vec<u8>,
}

impl StderrLines {
	pub fn fed(&mut self, read: &[u8]) -> Vec<String> {
		let mut complete = Vec::new();
		for piece in read.split_inclusive(|byte| *byte == b'\n') {
			let (body, is_whole) = match piece.strip_suffix(b"\n") {
				Some(body) => (body, true),
				None => (piece, false),
			};
			let room = LONGEST_STDERR_LINE.saturating_sub(self.pending.len());
			self.pending.extend_from_slice(&body[..body.len().min(room)]);
			if is_whole {
				complete.push(self.taken());
			}
		}
		complete
	}

	pub fn rest(mut self) -> Option<String> {
		(!self.pending.is_empty()).then(|| self.taken())
	}

	fn taken(&mut self) -> String {
		let line = std::mem::take(&mut self.pending);
		String::from_utf8_lossy(&line).trim_end_matches('\r').to_owned()
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_line_split_across_two_reads_comes_out_whole() {
		let mut lines = StderrLines::default();
		assert!(lines.fed(b"token half-of-").is_empty());
		assert_eq!(lines.fed(b"the-value\nnext"), vec!["token half-of-the-value"]);
		assert_eq!(lines.rest().as_deref(), Some("next"));
	}

	#[test]
	fn a_line_over_the_cap_is_truncated_to_it() {
		let mut lines = StderrLines::default();
		let long = "x".repeat(LONGEST_STDERR_LINE * 2);
		lines.fed(long.as_bytes());
		let fed = lines.fed(b"tail\nshort\n");
		assert_eq!(fed[0].len(), LONGEST_STDERR_LINE);
		assert_eq!(fed[1], "short");
	}
}
