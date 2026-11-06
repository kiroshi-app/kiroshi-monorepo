use rune::Icon;

pub static PREVIOUS: Icon = Icon {
	name: "keyline-ChevronLeftIcon-outline1.6",
	view: 24.0,
	body: r#"<path d="M15 6L9 12L15 18" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static NEXT: Icon = Icon {
	name: "keyline-ChevronRightIcon-outline1.6",
	view: 24.0,
	body: r#"<path d="M9 6L15 12L9 18" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static FOLDER: Icon = Icon {
	name: "keyline-FolderIcon-outline",
	view: 24.0,
	body: r#"<path d="M3 7C3 5.3431 4.3431 4 6 4L8.6716 4C9.202 4 9.7107 4.2107 10.0858 4.5858L11.4142 5.9142C11.7893 6.2893 12.298 6.5 12.8284 6.5L18 6.5C19.6569 6.5 21 7.8431 21 9.5L21 17C21 18.6569 19.6569 20 18 20L6 20C4.3431 20 3 18.6569 3 17Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static SERVER: Icon = Icon {
	name: "keyline-ServerIcon-outline",
	view: 24.0,
	body: r#"<path d="M6 2L18 2C19.1046 2 20 2.8954 20 4L20 8C20 9.1046 19.1046 10 18 10L6 10C4.8954 10 4 9.1046 4 8L4 4C4 2.8954 4.8954 2 6 2ZM6 14L18 14C19.1046 14 20 14.8954 20 16L20 20C20 21.1046 19.1046 22 18 22L6 22C4.8954 22 4 21.1046 4 20L4 16C4 14.8954 4.8954 14 6 14Z" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"></path><path d="M9 6C9 6.5523 8.5523 7 8 7C7.4477 7 7 6.5523 7 6C7 5.4477 7.4477 5 8 5C8.5523 5 9 5.4477 9 6ZM13 6C13 6.5523 12.5523 7 12 7C11.4477 7 11 6.5523 11 6C11 5.4477 11.4477 5 12 5C12.5523 5 13 5.4477 13 6ZM9 18C9 18.5523 8.5523 19 8 19C7.4477 19 7 18.5523 7 18C7 17.4477 7.4477 17 8 17C8.5523 17 9 17.4477 9 18ZM13 18C13 18.5523 12.5523 19 12 19C11.4477 19 11 18.5523 11 18C11 17.4477 11.4477 17 12 17C12.5523 17 13 17.4477 13 18Z" fill="currentColor" stroke="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>"#,
};

pub static CODE: Icon = Icon {
	name: "keyline-CodeIcon-outline",
	view: 24.0,
	body: r#"<path d="M8 5L2 12L8 19M16 5L22 12L16 19" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static FILE: Icon = Icon {
	name: "keyline-FileTextIcon-outline",
	view: 24.0,
	body: r#"<path d="M14 2H8C5.79086 2 4 3.79086 4 6V18C4 20.2091 5.79086 22 8 22H16C18.2091 22 20 20.2091 20 18V8L14 2ZM14 2V5C14 6.65685 15.3431 8 17 8H20M8 13H12M8 17H16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static SKILL: Icon = Icon {
	name: "keyline-SparklesIcon-outline",
	view: 24.0,
	body: r#"<path d="M15.4651 9.1794L16.7409 12.4141C16.8933 12.8006 17.1994 13.1067 17.5859 13.2591L20.8206 14.5349C21.0117 14.6102 21.1372 14.7947 21.1372 15C21.1372 15.2053 21.0117 15.3898 20.8206 15.4651L17.5859 16.7409C17.1994 16.8933 16.8933 17.1994 16.7409 17.5859L15.4651 20.8206C15.3898 21.0117 15.2053 21.1372 15 21.1372C14.7947 21.1372 14.6102 21.0117 14.5349 20.8206L13.2591 17.5859C13.1067 17.1994 12.8006 16.8933 12.4141 16.7409L9.1794 15.4651C8.9883 15.3898 8.8628 15.2053 8.8628 15C8.8628 14.7947 8.9883 14.6102 9.1794 14.5349L12.4141 13.2591C12.8006 13.1067 13.1067 12.8006 13.2591 12.4141L14.5349 9.1794C14.6102 8.9883 14.7947 8.8628 15 8.8628C15.2053 8.8628 15.3898 8.9883 15.4651 9.1794ZM6.7151 3.1794L7.2131 4.4419C7.3655 4.8285 7.6715 5.1345 8.0581 5.2869L9.3206 5.7849C9.5117 5.8602 9.6372 6.0447 9.6372 6.25C9.6372 6.4553 9.5117 6.6398 9.3206 6.7151L8.0581 7.2131C7.6715 7.3655 7.3655 7.6715 7.2131 8.0581L6.7151 9.3206C6.6398 9.5117 6.4553 9.6372 6.25 9.6372C6.0447 9.6372 5.8602 9.5117 5.7849 9.3206L5.2869 8.0581C5.1345 7.6715 4.8285 7.3655 4.4419 7.2131L3.1794 6.7151C2.9883 6.6398 2.8628 6.4553 2.8628 6.25C2.8628 6.0447 2.9883 5.8602 3.1794 5.7849L4.4419 5.2869C4.8285 5.1345 5.1345 4.8285 5.2869 4.4419L5.7849 3.1794C5.8602 2.9883 6.0447 2.8628 6.25 2.8628C6.4553 2.8628 6.6398 2.9883 6.7151 3.1794Z" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"></path>"#,
};

pub static CHECK: Icon = Icon {
	name: "keyline-CheckIcon-outline",
	view: 24.0,
	body: r#"<path d="M5 12L9.66667 17L19 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static EXTERNAL_LINK: Icon = Icon {
	name: "keyline-SquareArrowUpRightIcon-outline",
	view: 24.0,
	body: r#"<path d="M6 3H18C19.6569 3 21 4.34315 21 6V18C21 19.6569 19.6569 21 18 21H6C4.34315 21 3 19.6569 3 18V6C3 4.34315 4.34315 3 6 3Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path><path d="M9 9H14.4994C14.7756 9 15 9.22386 15 9.5V15M9 15L14.5 9.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static SEND: Icon = Icon {
	name: "keyline-ArrowUpIcon-outline",
	view: 24.0,
	body: r#"<path d="M5 11.8771L11.5875 5.17385C11.8153 4.94205 12.1847 4.94205 12.4125 5.17385L19 11.8771M12 19V5.94129" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static PLUS: Icon = Icon {
	name: "keyline-PlusIcon-outline",
	view: 24.0,
	body: r#"<path d="M5 12H19M11.995 19.005V5.005" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static SEARCH: Icon = Icon {
	name: "keyline-SearchIcon-outline",
	view: 24.0,
	body: r#"<path d="M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10ZM15 15L21 21" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static SETTINGS: Icon = Icon {
	name: "keyline-SettingsIcon-outline",
	view: 24.0,
	body: r#"<path d="M13.5 4.8845C13.5 5.3482 13.8221 5.7434 14.2571 5.9041C14.4124 5.9615 14.5649 6.0247 14.7143 6.0933C15.1356 6.2869 15.6427 6.2353 15.9706 5.9076L16.5966 5.2819C16.9872 4.8916 17.6202 4.8917 18.0106 5.2821L18.7175 5.989C19.1081 6.3796 19.108 7.0129 18.7173 7.4034L18.0922 8.0283C17.7641 8.3562 17.7124 8.8636 17.9062 9.2851C17.975 9.4347 18.0383 9.5874 18.0958 9.7429C18.2566 10.1779 18.6518 10.5 19.1155 10.5L20 10.5C20.5523 10.5 21 10.9477 21 11.5L21 12.5C21 13.0523 20.5523 13.5 20 13.5L19.1155 13.5C18.6518 13.5 18.2566 13.8221 18.0956 14.257C18.0381 14.4123 17.9749 14.5648 17.9061 14.7143C17.7123 15.1355 17.7639 15.6428 18.0918 15.9707L18.7177 16.5966C19.1082 16.9871 19.1082 17.6203 18.7177 18.0108L18.0108 18.7177C17.6203 19.1082 16.9871 19.1082 16.5966 18.7177L15.9707 18.0918C15.6428 17.7639 15.1355 17.7123 14.7141 17.9058C14.5647 17.9745 14.4123 18.0376 14.2571 18.0949C13.8221 18.2556 13.5 18.6508 13.5 19.1145L13.5 20C13.5 20.5523 13.0523 21 12.5 21L11.5 21C10.9477 21 10.5 20.5523 10.5 20L10.5 19.1145C10.5 18.6508 10.1779 18.2556 9.7429 18.0951C9.5874 18.0377 9.4348 17.9746 9.2852 17.9059C8.8636 17.7124 8.3562 17.7641 8.0283 18.0922L7.4034 18.7173C7.0129 19.108 6.3796 19.1081 5.989 18.7175L5.2821 18.0106C4.8917 17.6202 4.8916 16.9872 5.2819 16.5966L5.9076 15.9706C6.2353 15.6427 6.2869 15.1356 6.0933 14.7143C6.0247 14.5649 5.9615 14.4124 5.9041 14.2571C5.7434 13.8221 5.3482 13.5 4.8845 13.5L4 13.5C3.4477 13.5 3 13.0523 3 12.5L3 11.5C3 10.9477 3.4477 10.5 4 10.5L4.8845 10.5C5.3482 10.5 5.7434 10.1779 5.904 9.7429C5.9614 9.5874 6.0245 9.4346 6.0933 9.285C6.2867 8.8635 6.2351 8.3562 5.9072 8.0283L5.2823 7.4034C4.8918 7.0129 4.8918 6.3797 5.2823 5.9892L5.9892 5.2823C6.3797 4.8918 7.0129 4.8918 7.4034 5.2823L8.0283 5.9072C8.3562 6.2351 8.8635 6.2867 9.285 6.0933C9.4346 6.0245 9.5874 5.9614 9.7429 5.904C10.1779 5.7434 10.5 5.3482 10.5 4.8845L10.5 4C10.5 3.4477 10.9477 3 11.5 3L12.5 3C13.0523 3 13.5 3.4477 13.5 4L13.5 4.8845ZM12 9.5C13.3807 9.5 14.5 10.6193 14.5 12C14.5 13.3807 13.3807 14.5 12 14.5C10.6193 14.5 9.5 13.3807 9.5 12C9.5 10.6193 10.6193 9.5 12 9.5Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static CONVERSATIONS: Icon = Icon {
	name: "keyline-MessageIcon-fill",
	view: 24.0,
	body: r#"<path d="M12 2 C17.8553 2 23 5.8327 23 11 C23 16.1673 17.8553 20 12 20 C11.2351 20 10.4723 19.9337 9.7236 19.8047 L5.4385 21.8984 C5.1434 22.0425 4.7961 22.0329 4.5098 21.8721 C4.2235 21.7112 4.0344 21.4197 4.0039 21.0928 L3.6084 16.8252 C1.9521 15.2269 1 13.1718 1 11 C1 5.8327 6.1447 2 12 2 Z" fill="currentColor" ></path>"#,
};

pub static MISSIONS: Icon = Icon {
	name: "keyline-FlagIcon-outline",
	view: 24.0,
	body: r#"<path d="M4 13.3739C4 13.7715 4.2356 14.1313 4.6 14.2904C5.6724 14.7584 6.8299 15 8 15C9.3952 15 10.7689 14.6566 12 14C13.2311 13.3434 14.6048 13 16 13C16.9123 13 17.8186 13.1469 18.6842 13.435C18.786 13.4688 18.8927 13.4861 19 13.4861C19.5523 13.4861 20 13.0384 20 12.4861L20 3.6261C20 3.2285 19.7644 2.8687 19.4 2.7096C18.3276 2.2416 17.1701 2 16 2C14.6048 2 13.2311 2.3434 12 3C10.7689 3.6566 9.3952 4 8 4C6.6048 4 5.2311 3.6566 4 3L4 22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static MESSAGE: Icon = Icon {
	name: "keyline-MessageSquareIcon-outline",
	view: 24.0,
	body: r#"<path d="M6 3L18 3C19.6569 3 21 4.3431 21 6L21 14C21 15.6569 19.6569 17 18 17L7 17L3 21L3 6C3 4.3431 4.3431 3 6 3Z" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"></path>"#,
};

pub static PIN: Icon = Icon {
	name: "keyline-PinIcon-outline",
	view: 24.0,
	body: r#"<path d="M13.7336 3.293C13.9211 3.1054 14.1754 3.0001 14.4407 3.0001C14.7059 3.0001 14.9602 3.1054 15.1478 3.293L20.707 8.8522C20.8946 9.0398 20.9999 9.2941 20.9999 9.5593C20.9999 9.8246 20.8946 10.0789 20.707 10.2664L19.3319 11.6416C19.1443 11.8292 18.89 11.9345 18.6248 11.9345C18.3595 11.9345 18.1052 11.8292 17.9176 11.6416L16.8814 10.6054L14.5233 12.9635C14.3358 13.151 14.2304 13.4053 14.2304 13.6706C14.2304 13.7692 14.245 13.8672 14.2737 13.9616C14.8295 15.7886 15.1207 17.6858 15.1385 19.5954C15.1386 19.5985 15.1386 19.6017 15.1386 19.6048C15.1386 19.87 15.0332 20.1243 14.8457 20.3119L14.4504 20.7072C14.2629 20.8947 14.0085 21.0001 13.7433 21.0001C13.4781 21.0001 13.2237 20.8947 13.0362 20.7072L3.2928 10.9638C3.1053 10.7763 2.9999 10.5219 2.9999 10.2567C2.9999 9.9915 3.1053 9.7371 3.2928 9.5496L3.6881 9.1543C3.8757 8.9668 4.13 8.8614 4.3952 8.8614C4.3983 8.8614 4.4015 8.8614 4.4046 8.8615C6.3142 8.8793 8.2114 9.1705 10.0384 9.7263C10.1328 9.755 10.2308 9.7696 10.3294 9.7696C10.5947 9.7696 10.849 9.6642 11.0365 9.4767L13.3946 7.1186L12.3584 6.0824C12.1708 5.8948 12.0655 5.6405 12.0655 5.3752C12.0655 5.11 12.1708 4.8557 12.3584 4.6681L13.7336 3.293ZM8.1645 15.8355L3.9804 20.0196" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"></path>"#,
};

pub static ARROW_DOWN: Icon = Icon {
	name: "keyline-ArrowDownIcon-outline",
	view: 24.0,
	body: r#"<path d="M5 12.1229L11.5875 18.8261C11.8153 19.058 12.1847 19.058 12.4125 18.8261L19 12.1229M12 5V18.0587" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static KIROSHI_RING: Icon = Icon {
	name: "kiroshi-kiroshi-ring",
	view: 401.0,
	body: r#"<path fill="currentColor" fill-rule="evenodd" d="M 393.14 171.16 A 58.68 58.68 0 0 1 393.14 229.84 L 322.23 352.66 A 58.68 58.68 0 0 1 271.41 382.00 L 129.59 382.00 A 58.68 58.68 0 0 1 78.77 352.66 L 7.86 229.84 A 58.68 58.68 0 0 1 7.86 171.16 L 78.77 48.34 A 58.68 58.68 0 0 1 129.59 19.00 L 271.41 19.00 A 58.68 58.68 0 0 1 322.23 48.34 Z M 327.98 174.3 A 52.39 52.39 0 0 1 327.98 226.7 L 286.93 297.8 A 52.39 52.39 0 0 1 241.55 324 L 159.45 324 A 52.39 52.39 0 0 1 114.07 297.8 L 73.02 226.7 A 52.39 52.39 0 0 1 73.02 174.3 L 114.07 103.2 A 52.39 52.39 0 0 1 159.45 77 L 241.55 77 A 52.39 52.39 0 0 1 286.93 103.2 Z"/>"#,
};
pub static CLOSE: Icon = Icon {
	name: "keyline-XIcon-outline",
	view: 24.0,
	body: r#"<path d="M7 7L17 17M17 7L7 17" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static BELL: Icon = Icon {
	name: "keyline-BellIcon-outline",
	view: 24.0,
	body: r#"<path d="M12 3C14.7614 3 17 5.23858 17 8C17 13 19 14 19 15C19 15.5523 18.5523 16 18 16H6C5.44772 16 5 15.5523 5 15C5 14 7 13 7 8C7 5.23858 9.23858 3 12 3ZM10.2679 20C10.6252 20.6188 11.2855 21 12 21C12.7145 21 13.3748 20.6188 13.7321 20" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static ERROR: Icon = Icon {
	name: "keyline-CircleXIcon-outline",
	view: 24.0,
	body: r#"<path d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path><path d="M9 9L15 15M15 9L9 15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static SUCCESS: Icon = Icon {
	name: "keyline-CircleCheckIcon-outline",
	view: 24.0,
	body: r#"<path d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path><path d="M8 12L10.6667 15L16 9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};
pub static GITHUB: Icon = Icon {
	name: "kiroshi-GitHub-ui",
	view: 16.0,
	body: r#"<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A7.995 7.995 0 0 0 16 8c0-4.42-3.58-8-8-8z" fill="currentColor"></path>"#,
};

pub static LINEAR: Icon = Icon {
	name: "kiroshi-Linear-ui",
	view: 100.0,
	body: r#"<path d="M1.22541 61.5228c-.2-.9086.87652-1.5125 1.53266-.8563l36.5471 36.5471c.6562.6562.0523 1.7327-.8563 1.5327-9.5313-2.098-18.4276-6.6428-25.7566-13.9718-7.32893-7.3289-11.87373-16.2252-13.9718-25.7567zM.00189135 46.8891c-.01764375.2833.08887215.5599.28957165.7606l52.0501 52.0501c.2007.2007.4773.3072.7606.2896 2.3692-.1476 4.6938-.46 6.9624-.9259.7645-.157 1.0301-1.0963.4782-1.6481L2.57343 39.4485c-.55184-.5518-1.49109-.2863-1.648174.4782-.465915 2.2686-.77835 4.5932-.92598465 6.9624zM4.21093 29.7054c-.16649.3738-.08169.8106.20765 1.1l64.77602 64.776c.2894.2894.7262.3742 1.1.2077 1.7861-.7956 3.5171-1.6927 5.1855-2.684.5521-.328.6373-1.0867.1832-1.5407L8.43566 24.3865c-.45409-.4541-1.21271-.3689-1.54074.1832-.99132 1.6684-1.88843 3.3994-2.68399 5.1857zM12.6587 18.074c-.3701-.3701-.393-.9637-.0443-1.3541C21.7795 6.45931 35.1114 0 49.9519 0 77.5927 0 100 22.4073 100 50.0481c0 14.8405-6.4593 28.1724-16.7199 37.3375-.3903.3487-.984.3258-1.354-.0443L12.6587 18.074z" fill="currentColor"></path>"#,
};

pub static SUPERSET: Icon = Icon {
	name: "kiroshi-Superset-ui",
	view: 24.0,
	body: r#"<path d="M5.25 6H3.75V10H1.5V14H3.75V18H5.25M11.25 6H9.75V10H7.5V14H9.75V18H11.25M12.75 6H14.25V10H16.5V14H14.25V18H12.75M18.75 6H20.25V10H22.5V14H20.25V18H18.75" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter" fill="none" stroke="currentColor"></path>"#,
};

pub static TOOL: Icon = Icon {
	name: "kiroshi-Tool-ui",
	view: 24.0,
	body: r#"<path d="M18.682 8.8536L20.2678 7.2678C20.4553 7.0802 20.7097 6.9749 20.9749 6.9749C21.4902 6.9749 21.9211 7.3664 21.9703 7.8794C21.9901 8.0857 22 8.2928 22 8.5C22 12.0899 19.0899 15 15.5 15C11.9101 15 9 12.0899 9 8.5C9 4.9101 11.9101 2 15.5 2C15.7072 2 15.9143 2.0099 16.1206 2.0297C16.6336 2.0789 17.0251 2.5098 17.0251 3.0251C17.0251 3.2903 16.9198 3.5447 16.7322 3.7322L15.1464 5.318C14.6776 5.7869 14.4142 6.4227 14.4142 7.0858C14.4142 8.4665 15.5335 9.5858 16.9142 9.5858C17.5773 9.5858 18.2131 9.3224 18.682 8.8536ZM15.3955 14.9992C15.3688 14.9987 15.342 14.9985 15.3152 14.9985C13.9891 14.9985 12.7173 15.5253 11.7797 16.463L7.1213 21.1213C6.5587 21.6839 5.7956 22 5 22C3.3431 22 2 20.6569 2 19C2 18.2044 2.3161 17.4413 2.8787 16.8787L7.537 12.2203C8.4747 11.2827 9.0015 10.0109 9.0015 8.6848C9.0015 8.658 9.0013 8.6312 9.0008 8.6045" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static BOOKMARK: Icon = Icon {
	name: "kiroshi-Bookmark-ui",
	view: 24.0,
	body: r#"<path d="M4 5C4 3.3431 5.3431 2 7 2L17 2C18.6569 2 20 3.3431 20 5L20 20.9983C20 21.7895 19.1248 22.2673 18.4592 21.8395L12.8111 18.8514C12.317 18.5338 11.683 18.5338 11.1889 18.8514L5.5408 21.8395C4.8752 22.2673 4 21.7895 4 20.9983Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"></path>"#,
};

pub static PAPER: Icon = Icon {
	name: "kiroshi-Paper-ui",
	view: 78.0,
	body: r#"<path d="M12 0h66v12H12zM0 12h12v36H0zM48 12h30v36H48zM0 48h48v30H0z" fill="currentColor"></path>"#,
};
