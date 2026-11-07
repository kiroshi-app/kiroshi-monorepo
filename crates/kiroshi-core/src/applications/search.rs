const SHORTEST_TERM: usize = 3;

pub(super) fn terms(query: &str) -> Vec<String> {
	query
		.split_whitespace()
		.filter(|term| term.chars().count() >= SHORTEST_TERM)
		.map(str::to_lowercase)
		.collect()
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_query_keeps_only_the_terms_of_three_characters_or_more_in_lowercase() {
		assert_eq!(terms("My Issues an"), ["issues"]);
		assert_eq!(terms("an my"), Vec::<String>::new());
		assert_eq!(terms(""), Vec::<String>::new());
	}
}
