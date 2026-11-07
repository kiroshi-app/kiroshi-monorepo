pub mod s01_chrome;
pub mod s02_rail;
pub mod s03_roster;
pub mod s04_boot;
pub mod s05_thread;
pub mod s06_composer;
pub mod s07_approvals;
pub mod s08_missions;
pub mod s09_routines;
pub mod s10_agent_settings;
pub mod s11_applications;
pub mod s12_person_settings;
pub mod s13_space_settings;
pub mod s14_library;
pub mod s15_boards;

#[derive(Default)]
pub struct Surfaces {
	pub s01_chrome: s01_chrome::State,
	pub s02_rail: s02_rail::State,
	pub s03_roster: s03_roster::State,
	pub s04_boot: s04_boot::State,
	pub s05_thread: s05_thread::State,
	pub s06_composer: s06_composer::State,
	pub s07_approvals: s07_approvals::State,
	pub s08_missions: s08_missions::State,
	pub s09_routines: s09_routines::State,
	pub s10_agent_settings: s10_agent_settings::State,
	pub s11_applications: s11_applications::State,
	pub s12_person_settings: s12_person_settings::State,
	pub s13_space_settings: s13_space_settings::State,
	pub s14_library: s14_library::State,
	pub s15_boards: s15_boards::State,
}
