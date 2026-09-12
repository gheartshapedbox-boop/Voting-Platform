import React from 'react';

const SCORES = [1, 2, 3, 4, 5];

export default function ScorePicker({ label, hint, value, onChange, disabled }) {
  return (
    <div className="scorerow">
      <span className="scorelabel">{label}</span>
      <div className="scorebtns" role="group" aria-label={label}>
        {SCORES.map((n) => (
          <button key={n} type="button" className="scorebtn"
                  aria-pressed={value === n} disabled={disabled}
                  onClick={() => onChange(n)}>
            {n}
          </button>
        ))}
      </div>
      <span className="scalehint">{hint}</span>
    </div>
  );
}
