pub mod commands;
pub use kiroshi_core::updates::contract;
mod flow;
mod release_notes;

pub use flow::{check_on, Updates};
