# Care environment variables

Generated from `backend/app/modules/settings/care_keys.py`. Empty values use the built-in default unless the setting is owner-supplied text, which remains missing.

| Variable | Setting key | Type | Default | Required before go-live | Group |
|---|---|---|---|---|---|
| `CARE_APP_LOCATION_DISCLOSURE` | `app.location_disclosure` | text | `''` | Yes | app |
| `CARE_MODULE_ENABLED` | `care.module_enabled` | boolean | `False` | Yes | care |
| `CARE_CONSENT_LOCATION_TEXT` | `consent.location_text` | text | `''` | Yes | consent |
| `CARE_CONSENT_LOCATION_VERSION` | `consent.location_version` | text | `''` | Yes | consent |
| `CARE_FIELD_MAX_ACCURACY_M` | `field.max_accuracy_m` | integer | `100` | Yes | field |
| `CARE_GEO_DEFAULT_RADIUS_M` | `geo.default_radius_m` | integer | `150` | Yes | geo |
| `CARE_GEO_MAX_ACCURACY_M` | `geo.max_accuracy_m` | integer | `100` | Yes | geo |
| `CARE_OPS_DATABASE_OFF_M0` | `ops.database_off_m0` | boolean | `False` | Yes | ops |
| `CARE_OPS_DATABASE_TIER_OK` | `ops.database_tier_ok` | boolean | `False` | Yes | ops |
| `CARE_OPS_RESTORE_TEST_PASSED` | `ops.restore_test_passed` | boolean | `False` | Yes | ops |
| `CARE_PHOTOS_GUIDANCE` | `photos.guidance` | text | `''` | Yes | photos |
| `CARE_PRIVACY_NOTICE_TEXT` | `privacy.notice_text` | text | `''` | Yes | privacy |
| `CARE_PRIVACY_NOTICE_VERSION` | `privacy.notice_version` | text | `''` | Yes | privacy |
| `CARE_RETENTION_COORDINATES_MONTHS` | `retention.coordinates_months` | integer | `0` | Yes | retention |
| `CARE_RETENTION_PHOTOS_MONTHS` | `retention.photos_months` | integer | `0` | Yes | retention |
| `CARE_RETENTION_REQUESTS_MONTHS` | `retention.requests_months` | integer | `0` | Yes | retention |
| `CARE_RETENTION_SOS_MONTHS` | `retention.sos_months` | integer | `0` | Yes | retention |
| `CARE_ALERTS_QUIET_END` | `alerts.quiet_end` | time | `'06:00'` | No | alerts |
| `CARE_ALERTS_QUIET_HOURS` | `alerts.quiet_hours` | text | `'22:00-07:00'` | No | alerts |
| `CARE_ALERTS_QUIET_START` | `alerts.quiet_start` | time | `'22:00'` | No | alerts |
| `CARE_ALERTS_SMS_AFTER_UNACKED_MIN` | `alerts.sms_after_unacked_min` | integer | `15` | No | alerts |
| `CARE_AUTH_LOGIN_IDENTIFIER` | `auth.login_identifier` | choice | `'either'` | No | auth |
| `CARE_MAP_TILE_URL` | `care.map_tile_url` | text | `''` | No | care |
| `CARE_MIN_APP_VERSION` | `care.min_app_version` | text | `'0.1.0'` | No | care |
| `CARE_MODULE_B_ENABLED` | `care.module_b_enabled` | boolean | `False` | No | care |
| `CARE_MODULE_C_ENABLED` | `care.module_c_enabled` | boolean | `False` | No | care |
| `CARE_MODULE_D_ENABLED` | `care.module_d_enabled` | boolean | `False` | No | care |
| `CARE_FIELD_ADHOC_ALLOWED` | `field.adhoc_allowed` | boolean | `False` | No | field |
| `CARE_FIELD_CHECKIN_FIX_WAIT_S` | `field.checkin_fix_wait_s` | integer | `10` | No | field |
| `CARE_FIELD_GEO_SNAP_WAIT_S` | `field.geo_snap_wait_s` | integer | `3` | No | field |
| `CARE_PHOTOS_ENABLED` | `photos.enabled` | boolean | `False` | No | photos |
| `CARE_PHOTOS_GUIDANCE_TEXT` | `photos.guidance_text` | text | `''` | No | photos |
| `CARE_PHOTOS_MAX_MB` | `photos.max_mb` | integer | `5` | No | photos |
| `CARE_PHOTOS_MAX_PER_VISIT` | `photos.max_per_visit` | integer | `5` | No | photos |
| `CARE_PHOTOS_REQUIRED` | `photos.required` | choice | `'none'` | No | photos |
| `CARE_SMS_ENABLED` | `sms.enabled` | boolean | `False` | No | sms |
| `CARE_SMS_MONTHLY_CAP` | `sms.monthly_cap` | integer | `1000` | No | sms |
| `CARE_SMS_TEST_NUMBER` | `sms.test_number` | text | `''` | No | sms |
| `CARE_SOS_CANCEL_WINDOW_S` | `sos.cancel_window_s` | integer | `5` | No | sos |
| `CARE_SOS_EMERGENCY_NUMBERS` | `sos.emergency_numbers` | list | `[]` | No | sos |
| `CARE_SOS_ENABLED` | `sos.enabled` | boolean | `False` | No | sos |
| `CARE_SOS_HOLD_SECONDS` | `sos.hold_seconds` | integer | `2` | No | sos |
| `CARE_SOS_LIVE_FOLLOW_ENABLED` | `sos.live_follow_enabled` | boolean | `False` | No | sos |
| `CARE_SOS_LIVE_FOLLOW_INTERVAL_SECONDS` | `sos.live_follow_interval_seconds` | integer | `30` | No | sos |
| `CARE_SOS_LIVE_FOLLOW_MINUTES` | `sos.live_follow_minutes` | integer | `30` | No | sos |
| `CARE_SOS_ON_CALL_CONTACTS` | `sos.on_call_contacts` | map | `{}` | No | sos |
| `CARE_SOS_ON_CALL_ROSTER` | `sos.on_call_roster` | map | `{'enabled': False, 'approved': False, 'entries': []}` | No | sos |
| `CARE_SOS_PROCEDURE` | `sos.procedure` | text | `''` | No | sos |
| `CARE_SOS_RESPONDER_CONFIGURED` | `sos.responder_configured` | boolean | `False` | No | sos |
| `CARE_THRESHOLDS_CLOCK_SKEW_MIN` | `thresholds.clock_skew_min` | integer | `10` | No | thresholds |
| `CARE_THRESHOLDS_LONG_VISIT_PCT` | `thresholds.long_visit_pct` | integer | `200` | No | thresholds |
| `CARE_THRESHOLDS_SHORT_VISIT_PCT` | `thresholds.short_visit_pct` | integer | `50` | No | thresholds |
| `CARE_TIMESHEETS_APPROVER_REQUIRED` | `timesheets.approver_required` | boolean | `True` | No | timesheets |
| `CARE_TIMESHEETS_AUTO_SUBMIT` | `timesheets.auto_submit` | boolean | `False` | No | timesheets |
| `CARE_TIMESHEETS_EXPORT_APPROVED_ONLY` | `timesheets.export_approved_only` | boolean | `True` | No | timesheets |
| `CARE_TIMESHEETS_PERIOD_KIND` | `timesheets.period_kind` | choice | `'weekly'` | No | timesheets |
| `CARE_TIMESHEETS_ROUNDING_MINUTES` | `timesheets.rounding_minutes` | integer | `1` | No | timesheets |
| `CARE_VISITS_ADHOC_DEFAULT_MINUTES` | `visits.adhoc_default_minutes` | integer | `60` | No | visits |
| `CARE_VISITS_ADHOC_ENABLED` | `visits.adhoc_enabled` | boolean | `False` | No | visits |
| `CARE_VISITS_SYNC_WINDOW_FUTURE_DAYS` | `visits.sync_window_future_days` | integer | `14` | No | visits |
| `CARE_VISITS_SYNC_WINDOW_PAST_HOURS` | `visits.sync_window_past_hours` | integer | `24` | No | visits |
