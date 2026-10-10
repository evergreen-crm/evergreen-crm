'use client';
// Clicking anywhere in a date or time box opens the calendar / clock
// (by default most browsers only open it from the small calendar icon).
import { useEffect } from 'react';

const TYPES = ['date', 'time', 'datetime-local', 'month', 'week'];

export default function DatePickerOpener() {
  useEffect(() => {
    const open = (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || !TYPES.includes(el.type) || el.disabled || el.readOnly) return;
      try { el.showPicker?.(); } catch { /* already open, or not allowed here */ }
    };
    document.addEventListener('click', open);
    return () => document.removeEventListener('click', open);
  }, []);
  return null;
}
