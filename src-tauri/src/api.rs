use once_cell::sync::Lazy;
use reqwest::Client;
use serde::{Deserialize, Serialize};

static HTTP_CLIENT: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .use_rustls_tls()
        .build()
        .expect("Failed to build HTTP client")
});

// ── Response types ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: String,
    pub initialized: bool,
    pub version: String,
    pub instance_salt: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub token: String,
    pub device_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultResponse {
    pub encrypted_vault: String,
    pub version: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PutVaultResponse {
    pub version: i64,
}

/// Matches the SessionInfo shape returned by phase-server /api/v1/sessions
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSession {
    pub id: String,
    pub device_name: String,
    pub ip_address: Option<String>,
    pub created_at: i64,
    pub last_used_at: i64,
    pub is_current: bool,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionsResponse {
    pub sessions: Vec<DeviceSession>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DevicesResponse {
    #[serde(alias = "sessions")]
    devices: Vec<DeviceSession>,
}

// ── Helpers ────────────────────────────────────────────────────────────────

fn api_url(server_url: &str, path: &str) -> String {
    let base = server_url.trim_end_matches('/');
    format!("{base}/api/v1{path}")
}

fn with_instance_token(
    req: reqwest::RequestBuilder,
    instance_token: Option<&str>,
) -> reqwest::RequestBuilder {
    match instance_token {
        Some(token) => req.header("X-Instance-Token", token),
        None => req,
    }
}

async fn check_response_error(resp: reqwest::Response) -> Result<reqwest::Response, String> {
    let status = resp.status();
    if status.is_success() {
        Ok(resp)
    } else {
        let body = resp.text().await.unwrap_or_default();
        Err(format!("HTTP {status}: {body}"))
    }
}

// ── API functions ──────────────────────────────────────────────────────────

pub async fn health(
    server_url: &str,
    instance_token: Option<&str>,
) -> Result<HealthResponse, String> {
    let url = api_url(server_url, "/health");
    let req = with_instance_token(HTTP_CLIENT.get(&url), instance_token);
    let resp = req
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    let resp = check_response_error(resp).await?;
    resp.json::<HealthResponse>()
        .await
        .map_err(|e| format!("Parse error: {e}"))
}

/// First-time setup: stores encrypted vault on server, returns JWT.
pub async fn setup(
    server_url: &str,
    instance_token: &str,
    encrypted_vault: &str,
    device_name: &str,
) -> Result<AuthResponse, String> {
    let url = api_url(server_url, "/auth/init");
    let body = serde_json::json!({
        "encryptedVault": encrypted_vault,
        "deviceName": device_name,
    });
    let resp = with_instance_token(HTTP_CLIENT.post(&url), Some(instance_token))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    let resp = check_response_error(resp).await?;
    resp.json::<AuthResponse>()
        .await
        .map_err(|e| format!("Parse error: {e}"))
}

/// Subsequent unlock: creates a new session, returns JWT.
pub async fn open(
    server_url: &str,
    instance_token: &str,
    device_name: &str,
    device_id: Option<&str>,
) -> Result<AuthResponse, String> {
    let url = api_url(server_url, "/auth/unlock");
    let body = serde_json::json!({ "deviceName": device_name, "deviceId": device_id });
    let resp = with_instance_token(HTTP_CLIENT.post(&url), Some(instance_token))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    let resp = check_response_error(resp).await?;
    resp.json::<AuthResponse>()
        .await
        .map_err(|e| format!("Parse error: {e}"))
}

pub async fn get_vault(
    server_url: &str,
    jwt: &str,
    instance_token: Option<&str>,
) -> Result<VaultResponse, String> {
    let url = api_url(server_url, "/vault");
    let req = with_instance_token(HTTP_CLIENT.get(&url), instance_token);
    let resp = req
        .bearer_auth(jwt)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    let resp = check_response_error(resp).await?;
    resp.json::<VaultResponse>()
        .await
        .map_err(|e| format!("Parse error: {e}"))
}

pub async fn put_vault(
    server_url: &str,
    jwt: &str,
    instance_token: Option<&str>,
    encrypted_vault: &str,
    expected_version: i64,
) -> Result<PutVaultResponse, String> {
    let url = api_url(server_url, "/vault");
    let body = serde_json::json!({
        "encryptedVault": encrypted_vault,
        "expectedVersion": expected_version,
    });
    let req = with_instance_token(HTTP_CLIENT.put(&url), instance_token);
    let resp = req
        .bearer_auth(jwt)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    let resp = check_response_error(resp).await?;
    resp.json::<PutVaultResponse>()
        .await
        .map_err(|e| format!("Parse error: {e}"))
}

pub async fn logout(
    server_url: &str,
    jwt: &str,
    instance_token: Option<&str>,
) -> Result<(), String> {
    let url = api_url(server_url, "/auth/logout");
    let req = with_instance_token(HTTP_CLIENT.post(&url), instance_token);
    let resp = req
        .bearer_auth(jwt)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    check_response_error(resp).await?;
    Ok(())
}

pub async fn get_sessions(
    server_url: &str,
    jwt: &str,
    instance_token: Option<&str>,
) -> Result<SessionsResponse, String> {
    let url = api_url(server_url, "/auth/devices");
    let req = with_instance_token(HTTP_CLIENT.get(&url), instance_token);
    let resp = req
        .bearer_auth(jwt)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    let resp = check_response_error(resp).await?;
    let devices = resp
        .json::<DevicesResponse>()
        .await
        .map_err(|e| format!("Parse error: {e}"))?;
    Ok(SessionsResponse {
        sessions: devices.devices,
    })
}

pub async fn delete_session(
    server_url: &str,
    jwt: &str,
    instance_token: Option<&str>,
    session_id: &str,
) -> Result<(), String> {
    let url = api_url(server_url, &format!("/auth/devices/{session_id}"));
    let req = with_instance_token(HTTP_CLIENT.delete(&url), instance_token);
    let resp = req
        .bearer_auth(jwt)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    check_response_error(resp).await?;
    Ok(())
}
