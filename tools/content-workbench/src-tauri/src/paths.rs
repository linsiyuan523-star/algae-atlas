use std::path::PathBuf;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AppPaths {
    pub app_data_dir: PathBuf,
    pub app_config_dir: PathBuf,
    pub app_log_dir: PathBuf,
}

impl AppPaths {
    pub fn drafts_dir(&self) -> PathBuf {
        self.app_data_dir.join("drafts")
    }

    pub fn trash_dir(&self) -> PathBuf {
        self.app_data_dir.join("draft-trash")
    }

    pub fn session_marker_path(&self) -> PathBuf {
        self.app_data_dir.join("session.json")
    }

    pub fn settings_path(&self) -> PathBuf {
        self.app_config_dir.join("settings.json")
    }
}

#[cfg(test)]
mod tests {
    use super::AppPaths;
    use std::path::{Path, PathBuf};

    #[test]
    fn every_derived_path_stays_below_an_injected_tauri_root() {
        let paths = AppPaths {
            app_data_dir: PathBuf::from(r"C:\roots\data"),
            app_config_dir: PathBuf::from(r"C:\roots\config"),
            app_log_dir: PathBuf::from(r"C:\roots\logs"),
        };
        let roots: [&Path; 3] = [
            paths.app_data_dir.as_path(),
            paths.app_config_dir.as_path(),
            paths.app_log_dir.as_path(),
        ];

        for derived in [
            paths.drafts_dir(),
            paths.trash_dir(),
            paths.session_marker_path(),
            paths.settings_path(),
        ] {
            assert!(
                roots.iter().any(|root| derived.starts_with(root)),
                "derived path escaped all roots: {}",
                derived.display()
            );
            assert!(!derived.components().any(|part| part.as_os_str() == ".."));
        }
    }
}
