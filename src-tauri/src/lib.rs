mod api;
mod commands;
mod crypto;
mod totp;
mod vault;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::Manager;

#[cfg(target_os = "windows")]
use window_vibrancy::{apply_acrylic, apply_mica};

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|_app| {
            // Desktop-only: spotlight window, vibrancy, tray icon
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let app = _app;

                // Create the spotlight window programmatically (desktop only)
                use tauri::WebviewWindowBuilder;
                let spotlight = WebviewWindowBuilder::new(
                    app,
                    "spotlight",
                    tauri::WebviewUrl::App("index.html".into()),
                )
                .title("Quick Search")
                .inner_size(640.0, 400.0)
                .decorations(false)
                .visible(false)
                .always_on_top(true)
                .center()
                .skip_taskbar(true)
                .build()?;

                // Apply Vibrancy to Spotlight window
                #[cfg(target_os = "windows")]
                {
                    if apply_mica(&spotlight, None).is_err() {
                        let _ = apply_acrylic(&spotlight, Some((18, 18, 18, 125)));
                    }
                }

                #[cfg(target_os = "macos")]
                {
                    let _ = apply_vibrancy(&spotlight, NSVisualEffectMaterial::HudWindow, None, None);
                }

                // System tray
                use tauri::{
                    menu::{Menu, MenuItem},
                    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
                };

                let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let show_i =
                    MenuItem::with_id(app, "show", "Open Main Window", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

                TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("Phase")
                    .menu(&menu)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } => {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::cmd_health,
            commands::cmd_sh_setup,
            commands::cmd_sh_open,
            commands::cmd_encrypt_vault,
            commands::cmd_put_vault,
            commands::cmd_load_local_vault,
            commands::cmd_decrypt_local_vault,
            commands::cmd_clear_session,
            commands::cmd_totp_start_ticker,
            commands::cmd_totp_stop_ticker,
            commands::cmd_get_sessions,
            commands::cmd_delete_session,
            commands::cmd_logout,
            commands::cmd_reencrypt_vault,
            commands::cmd_restore_session,
            commands::cmd_offline_unlock,
            commands::cmd_set_spotlight_shortcut,
        ]);

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let _ = window.hide();
                api.prevent_close();
            }
            _ => {}
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
