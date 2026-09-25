use rand::{seq::SliceRandom, CryptoRng, Rng};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub const DRAW_DURATION_MS: u64 = 1_600;
const MAX_SAMPLES: u32 = 1_000_000;
const MAX_DRAW_COUNT: u32 = 500;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    pub total_samples: u32,
    pub draw_count: u32,
    pub no_duplicates: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            total_samples: 100,
            draw_count: 10,
            no_duplicates: true,
        }
    }
}

impl Config {
    pub fn validate(&self) -> Result<(), String> {
        if !(1..=MAX_SAMPLES).contains(&self.total_samples) {
            return Err("Total Samples must be between 1 and 1,000,000.".into());
        }
        if !(1..=MAX_DRAW_COUNT).contains(&self.draw_count) {
            return Err("Number of Draws must be between 1 and 500.".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum View {
    Current,
    History,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Presentation {
    pub scale: f64,
    pub view: View,
}

impl Default for Presentation {
    fn default() -> Self {
        Self {
            scale: 1.0,
            view: View::Current,
        }
    }
}

impl Presentation {
    pub fn validate(&self) -> Result<(), String> {
        if !self.scale.is_finite() || !(0.5..=2.0).contains(&self.scale) {
            return Err("Display scale must be between 50% and 200%.".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DrawRecord {
    pub id: u64,
    pub numbers: Vec<u32>,
    pub created_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActiveDraw {
    pub draw: DrawRecord,
    pub started_at: u64,
    pub duration_ms: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    pub revision: u64,
    pub session_id: String,
    pub config: Config,
    pub presentation: Presentation,
    pub history: Vec<DrawRecord>,
    pub active_draw: Option<ActiveDraw>,
}

impl Snapshot {
    pub fn new(session_id: String) -> Self {
        Self {
            revision: 0,
            session_id,
            config: Config::default(),
            presentation: Presentation::default(),
            history: Vec::new(),
            active_draw: None,
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        self.config.validate()?;
        self.presentation.validate()?;
        if self.session_id.is_empty() || self.session_id.len() > 128 {
            return Err("The saved session identifier is invalid.".into());
        }
        let mut previous_id = u64::MAX;
        for draw in &self.history {
            if draw.id == 0 || draw.id >= previous_id {
                return Err("Saved draws must have unique, descending identifiers.".into());
            }
            if draw.numbers.is_empty() || draw.numbers.len() > MAX_DRAW_COUNT as usize {
                return Err("A saved draw has an invalid number of winners.".into());
            }
            if draw
                .numbers
                .iter()
                .any(|&number| number == 0 || number > self.config.total_samples)
            {
                return Err("A saved number is outside the configured pool.".into());
            }
            previous_id = draw.id;
        }
        Ok(())
    }

    fn require_idle(&self) -> Result<(), String> {
        if self.active_draw.is_some() {
            Err("Please wait for the current draw to finish.".into())
        } else {
            Ok(())
        }
    }

    fn advance_revision(&mut self) -> Result<(), String> {
        self.revision = self
            .revision
            .checked_add(1)
            .ok_or("Session revision limit reached.")?;
        Ok(())
    }

    pub fn update_config(&mut self, config: Config) -> Result<(), String> {
        self.require_idle()?;
        config.validate()?;
        if !self.history.is_empty() && config.total_samples != self.config.total_samples {
            return Err("Reset the session before changing Total Samples.".into());
        }
        self.advance_revision()?;
        self.config = config;
        Ok(())
    }

    pub fn update_presentation(&mut self, presentation: Presentation) -> Result<(), String> {
        presentation.validate()?;
        self.advance_revision()?;
        self.presentation = presentation;
        Ok(())
    }

    pub fn draw<R: Rng + CryptoRng>(&mut self, rng: &mut R, now: u64) -> Result<(), String> {
        self.require_idle()?;
        self.config.validate()?;
        let count = self.config.draw_count as usize;
        let numbers = if self.config.no_duplicates {
            let used: HashSet<u32> = self
                .history
                .iter()
                .flat_map(|draw| draw.numbers.iter().copied())
                .collect();
            let mut available: Vec<u32> = (1..=self.config.total_samples)
                .filter(|n| !used.contains(n))
                .collect();
            if count > available.len() {
                return Err(format!(
                    "Only {} numbers remain. Reduce Number of Draws or reset the session.",
                    available.len()
                ));
            }
            // Partial Fisher-Yates uniformly samples without replacement; order is random too.
            let (selected, _) = available.partial_shuffle(rng, count);
            selected.to_vec()
        } else {
            // With the constraint disabled every position is an independent, uniform draw.
            (0..count)
                .map(|_| rng.gen_range(1..=self.config.total_samples))
                .collect()
        };
        let id = self
            .history
            .first()
            .map_or(Some(1), |draw| draw.id.checked_add(1))
            .ok_or("Draw identifier limit reached.")?;
        let draw = DrawRecord {
            id,
            numbers,
            created_at: now,
        };
        self.advance_revision()?;
        self.history.insert(0, draw.clone());
        self.active_draw = Some(ActiveDraw {
            draw,
            started_at: now,
            duration_ms: DRAW_DURATION_MS,
        });
        Ok(())
    }

    pub fn finish_draw(&mut self, session_id: &str, draw_id: u64) -> Result<bool, String> {
        if self.session_id != session_id
            || self.active_draw.as_ref().map(|active| active.draw.id) != Some(draw_id)
        {
            return Ok(false);
        }
        self.advance_revision()?;
        self.active_draw = None;
        Ok(true)
    }

    pub fn reset(&mut self, session_id: String) -> Result<(), String> {
        self.require_idle()?;
        self.advance_revision()?;
        self.session_id = session_id;
        self.history.clear();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn fresh_install_defaults() {
        let config = super::Config::default();
        assert_eq!(config.total_samples, 100);
        assert_eq!(config.draw_count, 10);
    }

    use super::*;
    use rand::{rngs::StdRng, SeedableRng};

    fn rng() -> StdRng {
        StdRng::seed_from_u64(42)
    }
    fn finish(state: &mut Snapshot) {
        let id = state.active_draw.as_ref().unwrap().draw.id;
        let session_id = state.session_id.clone();
        assert!(state.finish_draw(&session_id, id).unwrap());
    }

    #[test]
    fn no_duplicates_exhausts_pool_exactly_and_preserves_state_on_error() {
        let mut state = Snapshot::new("session".into());
        state.config = Config {
            total_samples: 20,
            draw_count: 5,
            no_duplicates: true,
        };
        for now in 0..4 {
            state.draw(&mut rng(), now).unwrap();
            finish(&mut state);
        }
        let numbers: HashSet<_> = state
            .history
            .iter()
            .flat_map(|draw| &draw.numbers)
            .copied()
            .collect();
        assert_eq!(numbers, (1..=20).collect());
        assert_eq!(
            state.history.iter().map(|draw| draw.id).collect::<Vec<_>>(),
            [4, 3, 2, 1]
        );
        let before = state.clone();
        assert!(state
            .draw(&mut rng(), 5)
            .unwrap_err()
            .contains("0 numbers remain"));
        assert_eq!(state, before);
    }

    #[test]
    fn replacement_allows_repetition_inside_and_between_draws() {
        let mut state = Snapshot::new("session".into());
        state.config = Config {
            total_samples: 1,
            draw_count: 5,
            no_duplicates: false,
        };
        state.draw(&mut rng(), 0).unwrap();
        assert_eq!(state.history[0].numbers, [1; 5]);
        finish(&mut state);
        state.draw(&mut rng(), 1).unwrap();
        assert_eq!(state.history[0].numbers, [1; 5]);
    }

    #[test]
    fn turning_on_constraint_excludes_all_replacement_history() {
        let mut state = Snapshot::new("session".into());
        state.config = Config {
            total_samples: 2,
            draw_count: 10,
            no_duplicates: false,
        };
        state.draw(&mut rng(), 0).unwrap();
        finish(&mut state);
        let mut config = state.config.clone();
        config.no_duplicates = true;
        config.draw_count = 1;
        state.update_config(config).unwrap();
        assert!(state.draw(&mut rng(), 1).is_err());
    }

    #[test]
    fn active_draw_blocks_unsafe_mutations_but_accepts_presentation_changes() {
        let mut state = Snapshot::new("session".into());
        state.draw(&mut rng(), 123).unwrap();
        assert!(state.draw(&mut rng(), 123).is_err());
        assert!(state.update_config(Config::default()).is_err());
        assert!(state.reset("next".into()).is_err());
        state
            .update_presentation(Presentation {
                scale: 2.0,
                view: View::History,
            })
            .unwrap();
        assert_eq!(state.active_draw.as_ref().unwrap().started_at, 123);
        assert_eq!(state.active_draw.as_ref().unwrap().duration_ms, 1600);
    }

    #[test]
    fn total_samples_locked_until_reset_and_other_settings_survive_reset() {
        let mut state = Snapshot::new("session".into());
        state.draw(&mut rng(), 0).unwrap();
        finish(&mut state);
        let mut config = state.config.clone();
        config.total_samples = 42;
        assert!(state.update_config(config.clone()).is_err());
        state.reset("new-session".into()).unwrap();
        assert!(state.history.is_empty());
        assert_eq!(state.session_id, "new-session");
        assert_eq!(state.config, Config::default());
        state.update_config(config).unwrap();
    }

    #[test]
    fn stale_completion_cannot_clear_a_new_draw() {
        let mut state = Snapshot::new("session".into());
        state.draw(&mut rng(), 0).unwrap();
        assert!(!state.finish_draw("another-session", 1).unwrap());
        assert!(!state.finish_draw("session", 99).unwrap());
        assert!(state.active_draw.is_some());
        finish(&mut state);
        assert!(!state.finish_draw("session", 1).unwrap());
    }

    #[test]
    fn limits_reject_invalid_numbers_and_scales() {
        for total_samples in [0, MAX_SAMPLES + 1] {
            assert!(Config {
                total_samples,
                ..Config::default()
            }
            .validate()
            .is_err());
        }
        for draw_count in [0, MAX_DRAW_COUNT + 1] {
            assert!(Config {
                draw_count,
                ..Config::default()
            }
            .validate()
            .is_err());
        }
        for scale in [0.49, 2.01, f64::NAN, f64::INFINITY] {
            assert!(Presentation {
                scale,
                view: View::Current
            }
            .validate()
            .is_err());
        }
        for scale in [0.5, 2.0] {
            assert!(Presentation {
                scale,
                view: View::Current
            }
            .validate()
            .is_ok());
        }
    }

    #[test]
    fn one_million_sample_pool_remains_bounded_and_unique() {
        let mut state = Snapshot::new("session".into());
        state.config = Config {
            total_samples: MAX_SAMPLES,
            draw_count: MAX_DRAW_COUNT,
            no_duplicates: true,
        };
        state.draw(&mut rng(), 0).unwrap();
        let numbers = &state.history[0].numbers;
        assert_eq!(numbers.len(), 500);
        assert_eq!(numbers.iter().collect::<HashSet<_>>().len(), 500);
        assert!(numbers.iter().all(|n| (1..=MAX_SAMPLES).contains(n)));
    }

    #[test]
    fn saved_history_validation_rejects_invalid_values_and_ids() {
        let mut state = Snapshot::new("session".into());
        state.draw(&mut rng(), 0).unwrap();
        assert!(state.validate().is_ok());
        state.history[0].numbers[0] = 0;
        assert!(state.validate().is_err());
        state.history[0].numbers[0] = 1;
        state.history.push(state.history[0].clone());
        assert!(state.validate().is_err());
    }
}
