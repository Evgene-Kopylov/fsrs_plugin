/// Макрос для логирования предупреждений, работает в нативных тестах.
/// В WASM не выводит ничего — ошибки обрабатываются на стороне TypeScript.
#[macro_export]
macro_rules! log_warn {
    ($($arg:tt)*) => {
        #[cfg(not(target_arch = "wasm32"))]
        eprintln!("WARN: {}", format!($($arg)*));
    };
}

/// Макрос для информационного логирования.
/// В WASM — web_sys::console::log_1, в тестах — println.
#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => {
        #[cfg(target_arch = "wasm32")]
        web_sys::console::log_1(&format!($($arg)*).into());
        #[cfg(not(target_arch = "wasm32"))]
        println!("INFO: {}", format!($($arg)*));
    };
}

/// Макрос для логирования ошибок.
/// В WASM — web_sys::console::error_1, в тестах — eprintln.
#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => {
        #[cfg(target_arch = "wasm32")]
        web_sys::console::error_1(&format!($($arg)*).into());
        #[cfg(not(target_arch = "wasm32"))]
        eprintln!("ERROR: {}", format!($($arg)*));
    };
}
