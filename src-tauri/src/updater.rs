//! "Check for updates": asks GitHub for the newest Lithora release, downloads the installer that
//! matches how this copy was installed, runs it quietly and restarts into the new version.
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const RELEASES: &str = "https://api.github.com/repos/Kisaragi000/Lithora/releases?per_page=20";
pub const RELEASES_PAGE: &str = "https://github.com/Kisaragi000/Lithora/releases";

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    draft: bool,
    assets: Vec<Asset>,
}

#[derive(Deserialize, Clone)]
struct Asset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    current: String,
    latest: String,
    available: bool,
    notes: String,
    page: String,
    /// This copy can update itself in place (otherwise the user gets the download page).
    can_install: bool,
}

#[derive(Serialize, Clone)]
struct Progress {
    done: u64,
    total: u64,
}

/// How this copy of Lithora was installed, which decides the file an update needs.
#[derive(Debug, PartialEq)]
enum Install {
    WindowsSetup,
    AppImage(PathBuf),
    Deb,
    Rpm,
    Unknown,
}

impl Install {
    fn detect() -> Install {
        if cfg!(windows) {
            return Install::WindowsSetup;
        }
        if let Some(p) = std::env::var_os("APPIMAGE").map(PathBuf::from).filter(|p| p.is_file()) {
            return Install::AppImage(p);
        }
        let exe = std::env::current_exe().unwrap_or_default();
        if exe != Path::new("/usr/bin/lithora") {
            return Install::Unknown;
        }
        if Path::new("/var/lib/dpkg/info/lithora.list").exists() {
            return Install::Deb;
        }
        if Command::new("rpm").args(["-q", "lithora"]).output().is_ok_and(|o| o.status.success()) {
            return Install::Rpm;
        }
        Install::Unknown
    }

    /// The end of the release file name this kind of install updates from.
    fn asset_suffix(&self) -> Option<&'static str> {
        match self {
            Install::WindowsSetup => Some("_x64-setup.exe"),
            Install::AppImage(_) => Some("_amd64.AppImage"),
            Install::Deb => Some("_amd64.deb"),
            Install::Rpm => Some(".x86_64.rpm"),
            Install::Unknown => None,
        }
    }
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .tls_config(ureq::tls::TlsConfig::builder().root_certs(ureq::tls::RootCerts::PlatformVerifier).build())
        .timeout_connect(Some(Duration::from_secs(20)))
        .user_agent(concat!("Lithora/", env!("CARGO_PKG_VERSION")))
        .build()
        .into()
}

fn version_of(tag: &str) -> Option<semver::Version> {
    semver::Version::parse(tag.trim().trim_start_matches(['v', 'V'])).ok()
}

/// The newest published release (drafts are not public yet).
fn newest_release(agent: &ureq::Agent) -> Result<(Release, semver::Version), String> {
    let releases: Vec<Release> = agent
        .get(RELEASES)
        .header("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| format!("Could not reach GitHub: {e}"))?
        .body_mut()
        .read_json()
        .map_err(|e| format!("Unexpected answer from GitHub: {e}"))?;
    releases
        .into_iter()
        .filter(|r| !r.draft)
        .filter_map(|r| version_of(&r.tag_name).map(|v| (r, v)))
        .max_by(|a, b| a.1.cmp(&b.1))
        .ok_or_else(|| "No published release yet.".to_string())
}

fn current_version() -> semver::Version {
    semver::Version::parse(env!("CARGO_PKG_VERSION")).expect("the package version is semver")
}

#[tauri::command]
pub async fn check_update() -> Result<UpdateInfo, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let (release, latest) = newest_release(&agent())?;
        let install = Install::detect();
        let has_file = install.asset_suffix().is_some_and(|s| release.assets.iter().any(|a| a.name.ends_with(s)));
        Ok(UpdateInfo {
            current: current_version().to_string(),
            latest: latest.to_string(),
            available: latest > current_version(),
            notes: release.body.unwrap_or_default(),
            page: release.html_url,
            can_install: has_file,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// GETs `url`, following GitHub's redirect to its file storage by hand: some networks send the
/// redirect with a body ureq can't read, and the body of a redirect is never needed.
fn get_following_redirects(agent: &ureq::Agent, url: &str) -> Result<ureq::http::Response<ureq::Body>, String> {
    let mut url = url.to_string();
    for _ in 0..6 {
        let resp = agent
            .get(&url)
            .config()
            .max_redirects(0)
            .http_status_as_error(false)
            .build()
            .call()
            .map_err(|e| format!("Download failed: {e}"))?;
        let status = resp.status();
        if status.is_redirection() {
            let next = resp.headers().get("location").and_then(|v| v.to_str().ok()).ok_or("Download failed: bad redirect")?;
            url = next.to_string();
            continue;
        }
        if !status.is_success() {
            return Err(format!("Download failed: {status}"));
        }
        return Ok(resp);
    }
    Err("Download failed: too many redirects".into())
}

/// Downloads `asset` into `dir`, reporting progress as `update-progress` events.
fn download(app: &AppHandle, agent: &ureq::Agent, asset: &Asset, dir: &Path) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join(&asset.name);
    let mut resp = get_following_redirects(agent, &asset.browser_download_url)?;
    let total = resp.body().content_length().unwrap_or(asset.size);
    let mut reader = resp.body_mut().as_reader();
    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; 256 * 1024];
    let (mut done, mut last) = (0u64, 0u64);
    loop {
        let n = reader.read(&mut buf).map_err(|e| format!("Download failed: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        done += n as u64;
        if done - last > 512 * 1024 || done == total {
            last = done;
            let _ = app.emit("update-progress", Progress { done, total });
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    if asset.size > 0 && done != asset.size {
        return Err("The download was incomplete. Please try again.".into());
    }
    Ok(path)
}

/// Checks the file against the release's SHA256SUMS list, when the release has one.
fn verify(agent: &ureq::Agent, release: &Release, file: &Path, name: &str) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    let sums = release.assets.iter().filter(|a| a.name.starts_with("SHA256SUMS"));
    let mut expected = None;
    for s in sums {
        let text = get_following_redirects(agent, &s.browser_download_url)
            .ok()
            .and_then(|mut r| r.body_mut().read_to_string().ok())
            .unwrap_or_default();
        expected = text.lines().find_map(|l| {
            let (hash, file) = l.split_once(char::is_whitespace)?;
            (file.trim().trim_start_matches('*') == name).then(|| hash.to_ascii_lowercase())
        });
        if expected.is_some() {
            break;
        }
    }
    let Some(expected) = expected else { return Ok(()) };
    let mut hasher = Sha256::new();
    let mut f = std::fs::File::open(file).map_err(|e| e.to_string())?;
    std::io::copy(&mut f, &mut hasher).map_err(|e| e.to_string())?;
    let actual: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if actual == expected { Ok(()) } else { Err("The downloaded file is damaged. Please try again.".into()) }
}

/// Downloads the newest release, starts its installer and closes Lithora; the new version opens
/// when the install finishes.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let a = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let agent = agent();
        let (release, latest) = newest_release(&agent)?;
        if latest <= current_version() {
            return Err("Lithora is already up to date.".into());
        }
        let install = Install::detect();
        let suffix = install.asset_suffix().ok_or("This copy of Lithora can't update itself. Download the new version from the website.")?;
        let asset = release.assets.iter().find(|x| x.name.ends_with(suffix)).cloned().ok_or("The new release has no file for this system yet.")?;
        let dir = std::env::temp_dir().join("lithora-update");
        let file = download(&a, &agent, &asset, &dir)?;
        verify(&agent, &release, &file, &asset.name)?;
        run_installer(&install, &file)
    })
    .await
    .map_err(|e| e.to_string())??;
    app.exit(0);
    Ok(())
}

fn run_installer(install: &Install, file: &Path) -> Result<(), String> {
    match install {
        // Passive install (a small progress window), update mode, then restart Lithora.
        Install::WindowsSetup => {
            Command::new(file).args(["/P", "/R", "/UPDATE"]).spawn().map_err(|e| format!("Could not start the installer: {e}"))?;
        }
        Install::AppImage(target) => {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let staged = target.with_extension("AppImage.new");
                std::fs::copy(file, &staged).map_err(|e| format!("Could not replace Lithora: {e}"))?;
                std::fs::set_permissions(&staged, std::fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
                std::fs::rename(&staged, target).map_err(|e| format!("Could not replace Lithora: {e}"))?;
            }
            Command::new(target).spawn().map_err(|e| format!("Could not restart Lithora: {e}"))?;
        }
        // System packages need the administrator password, which pkexec asks for.
        Install::Deb | Install::Rpm => {
            let (tool, args): (&str, &[&str]) = if *install == Install::Deb { ("dpkg", &["-i"]) } else { ("rpm", &["-U"]) };
            let status = Command::new("pkexec")
                .arg(tool)
                .args(args)
                .arg(file)
                .status()
                .map_err(|e| format!("Could not start the installer: {e}"))?;
            if !status.success() {
                return Err("The update was not installed.".into());
            }
            Command::new("/usr/bin/lithora").spawn().map_err(|e| format!("Could not restart Lithora: {e}"))?;
        }
        Install::Unknown => return Err("This copy of Lithora can't update itself.".into()),
    }
    Ok(())
}

/// Opens the downloads page in the default browser.
#[tauri::command]
pub fn open_releases_page() -> Result<(), String> {
    let result = if cfg!(windows) {
        Command::new("explorer").arg(RELEASES_PAGE).spawn()
    } else {
        Command::new("xdg-open").arg(RELEASES_PAGE).spawn()
    };
    result.map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_compare_by_number() {
        assert!(version_of("v0.10.0").unwrap() > version_of("v0.9.3").unwrap());
        assert_eq!(version_of("V1.2.3").unwrap().to_string(), "1.2.3");
        assert!(version_of("nightly").is_none());
    }

    #[test]
    fn each_install_kind_updates_from_its_own_file() {
        assert_eq!(Install::WindowsSetup.asset_suffix(), Some("_x64-setup.exe"));
        assert!("Lithora_0.2.3_amd64.AppImage".ends_with(Install::AppImage(PathBuf::new()).asset_suffix().unwrap()));
        assert!("Lithora-0.2.3-1.x86_64.rpm".ends_with(Install::Rpm.asset_suffix().unwrap()));
        assert_eq!(Install::Unknown.asset_suffix(), None);
    }

    /// Asks GitHub for real and downloads the smallest file of the newest release (needs the
    /// network).
    #[test]
    #[ignore]
    fn downloads_from_the_newest_release_on_github() {
        let agent = agent();
        let (r, v) = newest_release(&agent).expect("a published release");
        let small = r.assets.iter().min_by_key(|a| a.size).expect("a file");
        let mut resp = get_following_redirects(&agent, &small.browser_download_url).unwrap();
        let mut n = 0u64;
        let mut buf = vec![0u8; 65536];
        let mut reader = resp.body_mut().as_reader();
        loop {
            let k = std::io::Read::read(&mut reader, &mut buf).unwrap();
            if k == 0 {
                break;
            }
            n += k as u64;
        }
        println!("newest {v}: {} is {n} bytes", small.name);
        assert_eq!(n, small.size);
    }
}
