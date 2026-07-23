use std::path::PathBuf;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AppPaths {
    pub app_data_dir: PathBuf,
    pub app_config_dir: PathBuf,
    pub app_log_dir: PathBuf,
}

impl AppPaths {
    pub fn drafts_dir(&self) -> PathBuf {
        self.app_data_dir.join("drafts").join("v1")
    }

    pub fn trash_dir(&self) -> PathBuf {
        self.app_data_dir.join("draft-trash").join("v1")
    }

    pub fn session_marker_path(&self) -> PathBuf {
        self.app_data_dir.join("session").join("active-v1.json")
    }

    pub fn settings_path(&self) -> PathBuf {
        self.app_config_dir.join("settings-v1.json")
    }
}

#[cfg(test)]
mod tests {
    use super::AppPaths;
    use std::path::PathBuf;

    #[test]
    fn derived_paths_match_the_versioned_persistence_layout_exactly() {
        let paths = AppPaths {
            app_data_dir: PathBuf::from(r"C:\roots\data"),
            app_config_dir: PathBuf::from(r"C:\roots\config"),
            app_log_dir: PathBuf::from(r"C:\roots\logs"),
        };

        assert_eq!(
            paths.drafts_dir(),
            PathBuf::from(r"C:\roots\data\drafts\v1")
        );
        assert_eq!(
            paths.trash_dir(),
            PathBuf::from(r"C:\roots\data\draft-trash\v1")
        );
        assert_eq!(
            paths.session_marker_path(),
            PathBuf::from(r"C:\roots\data\session\active-v1.json")
        );
        assert_eq!(
            paths.settings_path(),
            PathBuf::from(r"C:\roots\config\settings-v1.json")
        );
    }
}
