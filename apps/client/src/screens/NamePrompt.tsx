import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { NAME_MAX, isValidName, normaliseName } from '../state/profile.js';
import { asset } from '../assets/index.js';

/**
 * First run, and only first run.
 *
 * Every online player used to be called "PlayerOne", because the name was a
 * hard-coded string with no way to change it. Two people in the same match saw
 * the same name on both seats and could not tell which was which.
 *
 * This is the smallest thing that fixes it: one field, asked once, stored. It
 * is not a profile system and does not try to be.
 */
export function NamePrompt({ onDone }: { onDone: (name: string) => void }) {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);

  const clean = normaliseName(value);
  const valid = isValidName(value);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (valid) onDone(clean);
  };

  return (
    <div className="screen bg-menu name-screen">
      <img className="name-logo" src={asset('logo')} alt="Color Clash" />

      <form className="panel name-card" onSubmit={submit}>
        <h1 className="h2 name-title">WHAT SHOULD WE CALL YOU?</h1>
        <p className="dim name-hint">
          Other players see this name at the table. You can play offline without one,
          but online is confusing when everyone shares a name.
        </p>

        <input
          className="name-input"
          value={value}
          maxLength={NAME_MAX}
          autoFocus
          autoComplete="nickname"
          aria-label="Your display name"
          aria-invalid={touched && !valid}
          placeholder="Your name"
          onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
        />

        {/* The error is text, not a colour change — it has to survive being
            read by someone who cannot see the red border. */}
        <p className="name-error" role="alert">
          {touched && !valid ? 'Please enter a name.' : ' '}
        </p>

        <button className="btn btn-gold name-go" type="submit" disabled={!valid}>
          START PLAYING
        </button>
      </form>
    </div>
  );
}
