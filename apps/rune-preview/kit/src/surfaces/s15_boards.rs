use crate::strings::{Key, Language};

pub mod canvas;
pub mod card;
pub mod chrome;
pub mod lines;
pub mod model;
pub mod objects;
pub mod palette;
pub mod presence;
pub mod route;
pub mod selection;
pub mod viewport;

pub trait Emit<S>: Fn(&mut S, model::Event) + Clone + 'static {}

impl<S, F: Fn(&mut S, model::Event) + Clone + 'static> Emit<S> for F {}

pub fn say(key: Key) -> String {
	key.text(Language::En).to_owned()
}

pub fn counted(one: Key, other: Key, count: usize) -> String {
	say(if count == 1 { one } else { other }).replace("{{count}}", &count.to_string())
}
