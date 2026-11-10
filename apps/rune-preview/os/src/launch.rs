pub const LINKS_FOLLOW: &str = "--";

const LINK_PREFIX: &str = "kiroshi:";

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Launch {
	pub flags: Vec<String>,
	pub links: Vec<String>,
	pub dropped: usize,
}

pub fn split(args: &[String]) -> Launch {
	let Some(boundary) = args.iter().position(|arg| arg == LINKS_FOLLOW) else {
		return Launch { flags: args.to_vec(), links: links_among(args), dropped: 0 };
	};
	let (flags, after) = (&args[..boundary], &args[boundary + 1..]);
	let links = links_among(after);
	Launch { flags: flags.to_vec(), dropped: after.len() - links.len(), links }
}

fn links_among(args: &[String]) -> Vec<String> {
	args.iter().filter(|arg| is_link(arg)).cloned().collect()
}

fn is_link(arg: &str) -> bool {
	arg.get(..LINK_PREFIX.len()).is_some_and(|prefix| prefix.eq_ignore_ascii_case(LINK_PREFIX))
}

#[cfg(test)]
mod tests {
	use super::*;

	fn args(raw: &[&str]) -> Vec<String> {
		raw.iter().map(|arg| arg.to_string()).collect()
	}

	#[test]
	fn without_a_boundary_every_argument_is_a_flag_and_the_kiroshi_ones_are_links() {
		let launch = split(&args(&["kiroshi", "--dev-host", "KIROSHI://conversation/a", "kiro"]));

		assert_eq!(
			launch.flags,
			args(&["kiroshi", "--dev-host", "KIROSHI://conversation/a", "kiro"])
		);
		assert_eq!(launch.links, args(&["KIROSHI://conversation/a"]));
		assert_eq!(launch.dropped, 0);
	}

	#[test]
	fn flags_come_before_the_boundary_and_links_after_it() {
		let launch = split(&args(&["kiroshi", "--dev-host", "--", "kiroshi://conversation/a"]));

		assert_eq!(launch.flags, args(&["kiroshi", "--dev-host"]));
		assert_eq!(launch.links, args(&["kiroshi://conversation/a"]));
		assert_eq!(launch.dropped, 0);
	}

	#[test]
	fn a_link_split_by_a_quote_cannot_smuggle_a_flag() {
		let clicked = args(&[
			"kiroshi",
			"--dev-host",
			"--",
			"kiroshi://conversation/a",
			"--smoke-send",
			"hello",
			"--",
			"--register-scheme",
		]);

		let launch = split(&clicked);

		assert_eq!(launch.flags, args(&["kiroshi", "--dev-host"]));
		assert_eq!(launch.links, args(&["kiroshi://conversation/a"]));
		assert_eq!(launch.dropped, 4);
	}

	#[test]
	fn a_link_before_the_boundary_is_not_a_link() {
		let launch = split(&args(&["kiroshi", "kiroshi://conversation/a", "--"]));

		assert_eq!(launch.links, Vec::<String>::new());
		assert_eq!(launch.dropped, 0);
	}
}
