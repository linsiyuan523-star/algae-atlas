use time::{format_description::well_known::Rfc3339, OffsetDateTime};

pub trait Clock: Send + Sync {
    fn now_utc(&self) -> OffsetDateTime;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_utc(&self) -> OffsetDateTime {
        OffsetDateTime::now_utc()
    }
}

#[derive(Clone, Copy, Debug)]
pub struct FixedClock {
    now: OffsetDateTime,
}

impl FixedClock {
    pub fn new(now: OffsetDateTime) -> Self {
        Self {
            now: now.to_offset(time::UtcOffset::UTC),
        }
    }
}

impl Clock for FixedClock {
    fn now_utc(&self) -> OffsetDateTime {
        self.now
    }
}

pub fn format_utc_rfc3339(timestamp: OffsetDateTime) -> Result<String, time::error::Format> {
    timestamp.to_offset(time::UtcOffset::UTC).format(&Rfc3339)
}

#[cfg(test)]
mod tests {
    use super::{format_utc_rfc3339, Clock, FixedClock};
    use time::{format_description::well_known::Rfc3339, OffsetDateTime, UtcOffset};

    #[test]
    fn fixed_clock_is_deterministic_and_formats_as_utc_rfc3339() {
        let expected = OffsetDateTime::parse("2026-07-23T12:34:56.123456789Z", &Rfc3339)
            .expect("test timestamp parses");
        let clock = FixedClock::new(expected);

        assert_eq!(clock.now_utc(), expected);
        assert_eq!(clock.now_utc().offset(), UtcOffset::UTC);
        assert_eq!(
            format_utc_rfc3339(clock.now_utc()).expect("formats timestamp"),
            "2026-07-23T12:34:56.123456789Z"
        );
    }
}
