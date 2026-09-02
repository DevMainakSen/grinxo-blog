import { useMemo, useState } from 'react';
import {
  formatScheduledAt,
  utcToZonedParts,
  zonedTimeToUtc,
} from '../../utils/date';

export interface ScheduleValue {
  iso: string; // UTC ISO sent to the API
  label: string; // human-readable schedule summary
}

interface Props {
  initialScheduledAt?: string;
  title: string;
  saving: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (value: ScheduleValue) => void;
}

/** Timezones the scheduler understands (converted to UTC on the client). */
const TIMEZONES: { value: string; label: string }[] = [
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'UTC', label: 'UTC' },
];

/** Default time: tomorrow at 09:00 in the chosen zone. */
function defaultDateTime(timeZone: string): { date: string; time: string } {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const tzPart = (type: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, ...opts })
      .formatToParts(tomorrow)
      .find((p) => p.type === type)?.value ?? '';
  const date = `${tzPart('year', { year: 'numeric' })}-${tzPart('month', { month: '2-digit' })}-${tzPart('day', { day: '2-digit' })}`;
  const localTime = `${tomorrow.getHours()}:${String(tomorrow.getMinutes()).padStart(2, '0')}`;
  return { date, time: localTime };
}

export default function SchedulePublishModal({
  initialScheduledAt,
  title,
  saving,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const [timeZone, setTimeZone] = useState('Asia/Kolkata');

  function deriveParts(iso: string | undefined, zone: string):
    { date: string; time: string } {
    if (iso) {
      const parts = utcToZonedParts(iso, zone);
      if (parts.date && parts.time) return parts;
    }
    return defaultDateTime(zone);
  }

  const initialParts = deriveParts(initialScheduledAt, 'Asia/Kolkata');
  const [date, setDate] = useState(initialParts.date);
  const [time, setTime] = useState(initialParts.time);

  const zoneLabel = TIMEZONES.find((t) => t.value === timeZone)?.label ?? timeZone;
  const nowMs = new Date().getTime();

  const dateMin = new Date();
  dateMin.setDate(dateMin.getDate() - 1);
  const minDate = dateMin.toISOString().slice(0, 10);

  function changeZone(next: string) {
    setTimeZone(next);
    const parts = deriveParts(initialScheduledAt, next);
    setDate(parts.date);
    setTime(parts.time);
  }

  const isFuture = useMemo(() => {
    if (!date || !time) return false;
    const iso = zonedTimeToUtc(date, time, timeZone);
    return Date.parse(iso) > nowMs;
  }, [date, time, timeZone, nowMs]);

  const localError = useMemo(() => {
    if (!date || !time) return 'Please choose both a date and a time.';
    if (!isFuture) return 'Scheduled time must be in the future.';
    return '';
  }, [date, time, isFuture]);

  const preview = useMemo(() => {
    if (!date || !time || !isFuture) return null;
    return {
      iso: zonedTimeToUtc(date, time, timeZone),
      label: formatScheduledAt(zonedTimeToUtc(date, time, timeZone), timeZone, zoneLabel),
    };
  }, [date, time, timeZone, isFuture, zoneLabel]);

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal modal--wide sched-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sched-title"
      >
        <h2 id="sched-title" className="modal__title">
          {initialScheduledAt ? 'Update Schedule' : 'Schedule Publish'}
        </h2>
        <p className="modal__text">
          Publishing <strong>{title || 'this article'}</strong> will happen
          automatically at the time below. The schedule is stored server-side and
          survives server restarts.
        </p>

        <div className="sched-modal__grid">
          <div className="field">
            <label className="field__label" htmlFor="sched-date">Date</label>
            <input
              id="sched-date"
              type="date"
              className="field__input sched-modal__date"
              value={date}
              min={minDate}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="sched-time">Time</label>
            <input
              id="sched-time"
              type="time"
              className="field__input sched-modal__time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="sched-tz">Timezone</label>
            <select
              id="sched-tz"
              className="field__input sched-modal__tz"
              value={timeZone}
              onChange={(e) => changeZone(e.target.value)}
            >
              {TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {localError && <p className="field__hint field__hint--error">{localError}</p>}

        {preview && (
          <div className="sched-modal__preview">
            <span className="sched-modal__preview-label">Schedules for</span>
            <span className="sched-modal__preview-value">{preview.label}</span>
          </div>
        )}

        {error && <div className="alert alert--error">{error}</div>}

        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving || !!localError || !preview}
            onClick={() => preview && onConfirm(preview)}
          >
            {saving ? 'Scheduling…' : initialScheduledAt ? 'Update Schedule' : 'Schedule Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}