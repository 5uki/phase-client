use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::task::AbortHandle;
use zeroize::Zeroizing;

use crate::api;
use crate::crypto;
use crate::totp;
use crate::vault::{self, LocalVaultData, SessionData};

// ── Session handle store ───────────────────────────────────────────────────

struct CryptoState {
    encryption_key: Zeroizing<[u8; 32]>,
}

static SESSIONS: Lazy<Mutex<HashMap<String, CryptoState>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// ── TOTP ticker ───────────────────────────────────────────────────────────

static TICKER_HANDLE: Lazy<Mutex<Option<AbortHandle>>> = Lazy::new(|| Mutex::new(None));

fn store_session(enc_key: [u8; 32]) -> String {
    let handle = uuid::new_v4_string();
    SESSIONS.lock().unwrap().insert(
        handle.clone(),
        CryptoState {
            encryption_key: Zeroizing::new(enc_key),
        },
    );
    handle
}

fn get_enc_key(handle: &str) -> Result<[u8; 32], String> {
    SESSIONS
        .lock()
        .unwrap()
        .get(handle)
        .map(|s| *s.encryption_key)
        .ok_or_else(|| "Invalid or expired session handle".to_string())
}

mod uuid {
    use rand::RngCore;
    pub fn new_v4_string() -> String {
        let mut bytes = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut bytes);
        bytes[6] = (bytes[6] & 0x0F) | 0x40;
        bytes[8] = (bytes[8] & 0x3F) | 0x80;
        format!(
            "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
            bytes[0], bytes[1], bytes[2], bytes[3],
            bytes[4], bytes[5],
            bytes[6], bytes[7],
            bytes[8], bytes[9],
            bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
        )
    }
}

fn device_name() -> String {
    std::env::var_os("COMPUTERNAME")
        .or_else(|| std::env::var_os("HOSTNAME"))
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "Phase Client".to_string())
}

// ── Response/arg types for commands ───────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionResult {
    pub handle: String,
    pub jwt: String,
    pub device_id: Option<String>,
    pub vault_json: String,
    pub vault_version: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TotpEntry {
    pub id: String,
    pub secret: String,
    pub algorithm: String,
    pub digits: u32,
    pub period: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TotpCode {
    pub id: String,
    pub code: String,
    pub seconds_remaining: u64,
}

// ── Health ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_health(
    server_url: String,
    instance_token: Option<String>,
) -> Result<api::HealthResponse, String> {
    api::health(&server_url, instance_token.as_deref()).await
}

// ── Self-hosted setup (first time) ────────────────────────────────────────

/// Called when the server reports initialized=false.
/// Derives encryption key from master password + instanceSalt,
/// encrypts an empty vault, stores it on server, returns session.
#[tauri::command]
pub async fn cmd_sh_setup(
    app: AppHandle,
    server_url: String,
    instance_token: String,
    instance_salt: String,
    _master_password: String,
) -> Result<SessionResult, String> {
    let (enc_key, _auth_hash) = crypto::derive_keys(&instance_token, &instance_salt)?;

    let empty_vault = r#"{"version":1,"tokens":[],"settings":{"groups":[],"defaultGroup":"","sortOrder":"manual","displayMode":"list"},"lastModified":0}"#;
    let encrypted_vault = crypto::encrypt_vault(empty_vault, &enc_key)?;

    let dev_name = device_name();
    let auth_resp = api::setup(&server_url, &instance_token, &encrypted_vault, &dev_name).await?;
    let jwt = auth_resp.token.clone();
    let handle = store_session(enc_key);

    vault::save_session(
        &app,
        &SessionData {
            jwt: jwt.clone(),
            server_url: server_url.clone(),
            connection_mode: "selfhosted".to_string(),
            instance_token: Some(instance_token),
            device_id: auth_resp.device_id.clone(),
            vault_version: 1,
        },
    )?;

    vault::save_local(
        &app,
        &LocalVaultData {
            encrypted_b64: encrypted_vault,
            version: 1,
        },
    )?;

    Ok(SessionResult {
        handle,
        jwt,
        device_id: auth_resp.device_id,
        vault_json: empty_vault.to_string(),
        vault_version: 1,
    })
}

// ── Self-hosted open (subsequent unlock) ──────────────────────────────────

/// Called when server reports initialized=true.
/// Derives encryption key, creates a new session, fetches + decrypts vault.
#[tauri::command]
pub async fn cmd_sh_open(
    app: AppHandle,
    server_url: String,
    instance_token: String,
    instance_salt: String,
    _master_password: String,
    device_id: Option<String>,
) -> Result<SessionResult, String> {
    let (enc_key, _auth_hash) = crypto::derive_keys(&instance_token, &instance_salt)?;

    let dev_name = device_name();
    let auth_resp = api::open(
        &server_url,
        &instance_token,
        &dev_name,
        device_id.as_deref(),
    )
    .await?;
    let jwt = auth_resp.token.clone();

    // Fetch and decrypt vault
    let vault_resp = api::get_vault(&server_url, &jwt, Some(&instance_token)).await?;
    let vault_json = crypto::decrypt_vault(&vault_resp.encrypted_vault, &enc_key)?;

    let handle = store_session(enc_key);

    vault::save_session(
        &app,
        &SessionData {
            jwt: jwt.clone(),
            server_url: server_url.clone(),
            connection_mode: "selfhosted".to_string(),
            instance_token: Some(instance_token.clone()),
            device_id: auth_resp.device_id.clone(),
            vault_version: vault_resp.version,
        },
    )?;

    vault::save_local(
        &app,
        &LocalVaultData {
            encrypted_b64: vault_resp.encrypted_vault,
            version: vault_resp.version,
        },
    )?;

    Ok(SessionResult {
        handle,
        jwt,
        device_id: auth_resp.device_id,
        vault_json,
        vault_version: vault_resp.version,
    })
}

// ── Vault ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_encrypt_vault(handle: String, vault_json: String) -> Result<String, String> {
    let key = get_enc_key(&handle)?;
    crypto::encrypt_vault(&vault_json, &key)
}

#[tauri::command]
pub async fn cmd_put_vault(
    app: AppHandle,
    handle: String,
    server_url: String,
    jwt: String,
    instance_token: Option<String>,
    vault_json: String,
    expected_version: i64,
) -> Result<i64, String> {
    let key = get_enc_key(&handle)?;
    let encrypted = crypto::encrypt_vault(&vault_json, &key)?;

    let resp = api::put_vault(
        &server_url,
        &jwt,
        instance_token.as_deref(),
        &encrypted,
        expected_version,
    )
    .await?;

    vault::save_local(
        &app,
        &LocalVaultData {
            encrypted_b64: encrypted,
            version: resp.version,
        },
    )?;

    Ok(resp.version)
}

#[tauri::command]
pub fn cmd_load_local_vault(app: AppHandle) -> Result<Option<LocalVaultData>, String> {
    vault::load_local(&app)
}

#[tauri::command]
pub fn cmd_clear_session(app: AppHandle, handle: String) -> Result<(), String> {
    SESSIONS.lock().unwrap().remove(&handle);
    vault::clear_session(&app)?;
    Ok(())
}

// ── TOTP ticker ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_totp_start_ticker(app: AppHandle, entries: Vec<TotpEntry>) -> Result<(), String> {
    {
        let mut guard = TICKER_HANDLE.lock().unwrap();
        if let Some(handle) = guard.take() {
            handle.abort();
        }
    }

    let app_clone = app.clone();
    let handle = tokio::spawn(async move {
        loop {
            let codes: Vec<TotpCode> = entries
                .iter()
                .map(|entry| {
                    match totp::generate_totp(
                        &entry.secret,
                        &entry.algorithm,
                        entry.digits,
                        entry.period,
                    ) {
                        Ok((code, secs)) => TotpCode {
                            id: entry.id.clone(),
                            code,
                            seconds_remaining: secs,
                        },
                        Err(_) => TotpCode {
                            id: entry.id.clone(),
                            code: "------".to_string(),
                            seconds_remaining: 0,
                        },
                    }
                })
                .collect();

            let _ = app_clone.emit("totp-tick", &codes);
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }
    });

    *TICKER_HANDLE.lock().unwrap() = Some(handle.abort_handle());
    Ok(())
}

#[tauri::command]
pub async fn cmd_totp_stop_ticker() -> Result<(), String> {
    if let Some(handle) = TICKER_HANDLE.lock().unwrap().take() {
        handle.abort();
    }
    Ok(())
}

// ── Sessions management ───────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_get_sessions(
    server_url: String,
    jwt: String,
    instance_token: Option<String>,
) -> Result<api::SessionsResponse, String> {
    api::get_sessions(&server_url, &jwt, instance_token.as_deref()).await
}

#[tauri::command]
pub async fn cmd_delete_session(
    server_url: String,
    jwt: String,
    instance_token: Option<String>,
    session_id: String,
) -> Result<(), String> {
    api::delete_session(&server_url, &jwt, instance_token.as_deref(), &session_id).await
}

#[tauri::command]
pub async fn cmd_logout(
    app: AppHandle,
    server_url: String,
    jwt: String,
    instance_token: Option<String>,
    handle: String,
) -> Result<(), String> {
    let _ = api::logout(&server_url, &jwt, instance_token.as_deref()).await;
    SESSIONS.lock().unwrap().remove(&handle);
    vault::clear_session(&app)?;
    vault::clear_local(&app)?;
    Ok(())
}

// ── Re-encrypt vault (master password change) ─────────────────────────────
// Note: the new key is derived from the same instanceSalt + new password.
// The server only stores the encrypted blob — no auth_hash is needed.

#[tauri::command]
pub async fn cmd_reencrypt_vault(
    app: AppHandle,
    old_handle: String,
    server_url: String,
    jwt: String,
    instance_token: Option<String>,
    instance_salt: String,
    new_password: String,
    vault_json: String,
    version: i64,
) -> Result<String, String> {
    // Validate old handle still exists
    let _ = get_enc_key(&old_handle)?;

    let (new_enc_key, _new_auth_hash) = crypto::derive_keys(&new_password, &instance_salt)?;
    let encrypted_vault = crypto::encrypt_vault(&vault_json, &new_enc_key)?;

    let resp = api::put_vault(
        &server_url,
        &jwt,
        instance_token.as_deref(),
        &encrypted_vault,
        version,
    )
    .await?;

    vault::save_local(
        &app,
        &LocalVaultData {
            encrypted_b64: encrypted_vault,
            version: resp.version,
        },
    )?;

    // Replace old session with new key
    let new_handle = store_session(new_enc_key);
    SESSIONS.lock().unwrap().remove(&old_handle);

    Ok(new_handle)
}

// ── Session restore ───────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub server_url: String,
    pub connection_mode: String,
    pub instance_token: Option<String>,
    pub device_id: Option<String>,
    pub vault_version: i64,
}

/// Attempts to restore a previous session from local storage.
/// Checks if session.json and vault.bin exist on disk.
/// Returns session metadata so the frontend can show the quick-unlock screen.
#[tauri::command]
pub async fn cmd_restore_session(app: AppHandle) -> Result<Option<RestoreResult>, String> {
    let session = match vault::load_session(&app)? {
        Some(s) => s,
        None => return Ok(None),
    };

    // Check if local vault blob exists
    if vault::load_local(&app)?.is_none() {
        return Ok(None);
    }

    Ok(Some(RestoreResult {
        server_url: session.server_url,
        connection_mode: session.connection_mode,
        instance_token: session.instance_token,
        device_id: session.device_id,
        vault_version: session.vault_version,
    }))
}

// ── Decrypt local vault blob ───────────────────────────────────────────────

#[tauri::command]
pub fn cmd_decrypt_local_vault(app: AppHandle, handle: String) -> Result<String, String> {
    let key = get_enc_key(&handle)?;
    let local = vault::load_local(&app)?.ok_or("No local vault found")?;
    crypto::decrypt_vault(&local.encrypted_b64, &key)
}
