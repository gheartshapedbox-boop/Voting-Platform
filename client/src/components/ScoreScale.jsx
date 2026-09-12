import React from 'react';

/** 1-10 picker. Buttons (not a range input) so the chosen value is unambiguous. */
export default function ScoreScale({ value, onChange, min = 1, max = 10, lowLabel, highLabel, name }) {
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      <div className="scorebar" role="group" aria-label={name}>
        {options.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={`${name}: ${n} of ${max}`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="scale-ends tiny muted">
        <span>{lowLabel ?? min}</span>
        <span>{highLabel ?? max}</span>
      </div>
    </div>
  );
}
