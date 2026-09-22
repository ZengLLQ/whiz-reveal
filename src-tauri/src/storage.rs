use crate::engine::{Config, DrawRecord, Presentation, Snapshot};
use fs2::FileExt;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SavedSession {
    schema_version: u32,
    revision: u64,
    session_id: String,
    config: Config,
    presentation: Presentation,
    history: Vec<DrawRecord>,
}

pub fn new_session_id() -> Result<String, String> {
    let mut bytes = [0_u8; 16];
    OsRng
        .try_fill_bytes(&mut bytes)
        .map_err(|error| format!("Windows could not supply secure randomness: {error}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

pub struct SessionStore {
    pub snapshot: Snapshot,
    path: PathBuf,
    // Holding this OS lock for the process lifetime prevents two copies from overwriting a session.
    _lock: File,
}

impl SessionStore {
    pub fn open(directory: &Path) -> Result<Self, String> {
        fs::create_dir_all(directory).map_err(|error| {
            format!(
                "Could not create local data folder {}: {error}",
                directory.display()
            )
        })?;
        let lock_path = directory.join("session.lock");
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(&lock_path)
            .map_err(|error| format!("Could not open local session lock: {error}"))?;
        lock.try_lock_exclusive().map_err(|_| "WhizReveal is already using this local session. Close the other copy and restart this window.".to_string())?;
        let path = directory.join("session.json");
        let snapshot = if path.exists() {
            let bytes = fs::read(&path)
                .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
            let saved: SavedSession = serde_json::from_slice(&bytes).map_err(|error| format!("The saved session at {} could not be read. The original file has been preserved. Restore it from a backup or move it aside before restarting. Details: {error}", path.display()))?;
            if saved.schema_version != 1 {
                return Err(format!("The session at {} uses an unsupported format ({}). The original file has been preserved.", path.display(), saved.schema_version));
            }
            let snapshot = Snapshot {
                revision: saved.revision,
                session_id: saved.session_id,
                config: saved.config,
                presentation: saved.presentation,
                history: saved.history,
                // Winners were already durable; never replay an interrupted animation after restart.
                active_draw: None,
            };
            snapshot.validate().map_err(|error| format!("The saved session at {} is invalid. The original file has been preserved. {error}", path.display()))?;
            snapshot
        } else {
            Snapshot::new(new_session_id()?)
        };
        Ok(Self {
            snapshot,
            path,
            _lock: lock,
        })
    }

    pub fn commit(&mut self, next: Snapshot) -> Result<Snapshot, String> {
        self.persist(&next)?;
        self.snapshot = next;
        Ok(self.snapshot.clone())
    }

    fn persist(&self, snapshot: &Snapshot) -> Result<(), String> {
        let saved = SavedSession {
            schema_version: 1,
            revision: snapshot.revision,
            session_id: snapshot.session_id.clone(),
            config: snapshot.config.clone(),
            presentation: snapshot.presentation.clone(),
            history: snapshot.history.clone(),
        };
        let bytes = serde_json::to_vec_pretty(&saved)
            .map_err(|error| format!("Could not encode this session: {error}"))?;
        let directory = self
            .path
            .parent()
            .ok_or("The local data folder is invalid.")?;
        let mut temporary = tempfile::NamedTempFile::new_in(directory)
            .map_err(|error| format!("Could not prepare a session save: {error}"))?;
        temporary
            .write_all(&bytes)
            .and_then(|_| temporary.as_file().sync_all())
            .map_err(|error| {
                format!("Could not save this session. No draw was accepted: {error}")
            })?;
        // Same-directory atomic replacement keeps the prior complete file if writing fails.
        temporary.persist(&self.path).map_err(|error| {
            format!(
                "Could not replace {}. No draw was accepted: {error}",
                self.path.display()
            )
        })?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::{rngs::StdRng, SeedableRng};

    #[test]
    fn round_trip_preserves_draw_and_settings_without_replaying_animation() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = SessionStore::open(dir.path()).unwrap();
        let mut snapshot = store.snapshot.clone();
        snapshot.presentation.scale = 1.5;
        snapshot.draw(&mut StdRng::seed_from_u64(2), 1234).unwrap();
        store.commit(snapshot.clone()).unwrap();
        drop(store);
        let restored = SessionStore::open(dir.path()).unwrap();
        snapshot.active_draw = None;
        assert_eq!(restored.snapshot, snapshot);
    }

    #[test]
    fn corrupted_data_is_never_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("session.json");
        let original = b"{broken input";
        fs::write(&path, original).unwrap();
        let error = SessionStore::open(dir.path()).err().unwrap();
        assert!(error.contains("original file has been preserved"));
        assert_eq!(fs::read(path).unwrap(), original);
    }

    #[test]
    fn second_process_cannot_open_the_same_session() {
        let dir = tempfile::tempdir().unwrap();
        let first = SessionStore::open(dir.path()).unwrap();
        assert!(SessionStore::open(dir.path())
            .err()
            .unwrap()
            .contains("already using"));
        drop(first);
        assert!(SessionStore::open(dir.path()).is_ok());
    }

    #[test]
    fn failed_persistence_keeps_memory_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = SessionStore::open(dir.path()).unwrap();
        let initial = store.snapshot.clone();
        // Replacing a directory with a file must fail on every supported operating system.
        fs::create_dir(dir.path().join("session.json")).unwrap();
        let mut draft = initial.clone();
        draft.draw(&mut StdRng::seed_from_u64(1), 0).unwrap();
        assert!(store.commit(draft).is_err());
        assert_eq!(store.snapshot, initial);
    }

    #[test]
    fn repeated_atomic_saves_produce_complete_valid_json() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = SessionStore::open(dir.path()).unwrap();
        for revision in 1..=10 {
            let mut draft = store.snapshot.clone();
            draft.revision = revision;
            store.commit(draft).unwrap();
            let saved: SavedSession =
                serde_json::from_slice(&fs::read(dir.path().join("session.json")).unwrap())
                    .unwrap();
            assert_eq!(saved.revision, revision);
        }
    }
}
