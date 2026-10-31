-- Preserve the legacy field as a compatibility alias; business_timezone is authoritative.
UPDATE events SET timezone=business_timezone WHERE timezone<>business_timezone;
ALTER TABLE events ADD CONSTRAINT ck_event_timezone_alias CHECK(timezone=business_timezone);
