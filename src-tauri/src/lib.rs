use std::process::{Child, Command};
use tauri::Manager;

static mut SERVER_PROCESS: Option<Child> = None;

fn find_project_root() -> std::path::PathBuf {
    // 打包后 exe 旁边有 _up_/ 指向项目根目录
    // dev 模式直接用相对路径
    if cfg!(debug_assertions) {
        std::path::PathBuf::from("..")
    } else {
        std::env::current_exe()
            .unwrap()
            .parent()
            .unwrap()
            .to_path_buf()
    }
}

fn start_server() {
    let root = find_project_root();
    let server_dir = root.join("server");

    // Windows 上使用 npx.cmd / cmd /c
    let (cmd, args) = if cfg!(windows) {
        ("cmd", vec!["/C".to_string(), "npx".to_string(), "tsx".to_string(), "watch".to_string(),
                     server_dir.join("src/index.ts").to_str().unwrap().to_string()])
    } else {
        ("npx", vec!["tsx".to_string(), "watch".to_string(), server_dir.join("src/index.ts").to_str().unwrap().to_string()])
    };

    match Command::new(cmd)
        .args(&args)
        .env("PORT", "3201")
        .current_dir(&server_dir)
        .spawn()
    {
        Ok(child) => {
            println!("[Sidecar] Server started (pid: {})", child.id());
            unsafe { SERVER_PROCESS = Some(child); }
        }
        Err(e) => {
            eprintln!("[Sidecar] Failed to start server: {}", e);
        }
    }
}

fn stop_server() {
    unsafe {
        if let Some(ref mut child) = SERVER_PROCESS {
            let _ = child.kill();
            // Windows 上还需要 kill 子进程树
            #[cfg(windows)]
            {
                let _ = Command::new("taskkill")
                    .args(["/PID", &child.id().to_string(), "/T", "/F"])
                    .spawn();
            }
            println!("[Sidecar] Server stopped");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            start_server();

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                stop_server();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
