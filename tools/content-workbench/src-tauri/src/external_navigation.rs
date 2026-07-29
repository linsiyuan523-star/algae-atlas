const PUBLIC_SITE_HOST: &str = "sycszy.icu";
const MAX_PUBLIC_URL_BYTES: usize = 2_048;

fn validate_public_site_url(url: &str) -> Result<String, &'static str> {
    if url.is_empty()
        || url.len() > MAX_PUBLIC_URL_BYTES
        || url.chars().any(|character| {
            character.is_control() || character.is_whitespace() || character == '\\'
        })
    {
        return Err("The public website URL is invalid.");
    }

    let parsed = tauri::Url::parse(url).map_err(|_| "The public website URL is invalid.")?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some(PUBLIC_SITE_HOST)
        || parsed.port_or_known_default() != Some(443)
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Only the configured public website can be opened.");
    }
    if !parsed.path().starts_with("/zh/") {
        return Err("Only Chinese public content pages can be opened.");
    }
    Ok(parsed.to_string())
}

#[tauri::command]
pub fn open_public_site_url(url: String) -> Result<(), String> {
    let validated_url = validate_public_site_url(&url).map_err(str::to_owned)?;
    open_with_default_browser(&validated_url)
}

#[cfg(target_os = "windows")]
fn open_with_default_browser(url: &str) -> Result<(), String> {
    use std::{
        ffi::OsStr,
        iter::once,
        os::windows::ffi::OsStrExt,
        ptr::{null, null_mut},
    };
    use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};

    let operation = OsStr::new("open")
        .encode_wide()
        .chain(once(0))
        .collect::<Vec<_>>();
    let wide_url = OsStr::new(url)
        .encode_wide()
        .chain(once(0))
        .collect::<Vec<_>>();
    // The fixed HTTPS origin is validated above; ShellExecuteW delegates it to
    // the user's registered browser without invoking a command shell.
    let result = unsafe {
        ShellExecuteW(
            null_mut(),
            operation.as_ptr(),
            wide_url.as_ptr(),
            null(),
            null(),
            SW_SHOWNORMAL,
        )
    } as isize;
    if result <= 32 {
        return Err(format!(
            "Windows could not open the public website (ShellExecuteW code {result})."
        ));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn open_with_default_browser(_url: &str) -> Result<(), String> {
    Err("Opening the public website is only supported by the Windows desktop app.".to_owned())
}

#[cfg(test)]
mod tests {
    use super::validate_public_site_url;

    #[test]
    fn accepts_chinese_pages_on_the_configured_https_origin() {
        assert_eq!(
            validate_public_site_url("https://sycszy.icu/zh/news/example-id"),
            Ok("https://sycszy.icu/zh/news/example-id".to_owned())
        );
        assert_eq!(
            validate_public_site_url("https://SYCSZY.ICU/zh/insights/example-id?preview=1#content"),
            Ok("https://sycszy.icu/zh/insights/example-id?preview=1#content".to_owned())
        );
    }

    #[test]
    fn rejects_other_origins_and_unsafe_url_text() {
        for url in [
            "http://sycszy.icu/zh/news/example-id",
            "https://sycszy.icu.evil.invalid/zh/news/example-id",
            "https://sycszy.icu@evil.invalid/zh/news/example-id",
            "https://sycszy.icu:444/zh/news/example-id",
            "https://sycszy.icu/",
            "https://sycszy.icu/en/news/example-id",
            "https://sycszy.icu\\evil.invalid",
            "https://sycszy.icu/zh/news/example id",
            " https://sycszy.icu/zh/news/example-id",
        ] {
            assert!(validate_public_site_url(url).is_err(), "{url}");
        }
    }
}
