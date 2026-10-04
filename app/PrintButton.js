'use client';
// Prints the current page (menus and buttons are hidden on paper).
export default function PrintButton({ label = 'Print' }) {
  return <button className={label === 'Print' ? 'link' : ''} onClick={() => window.print()}>{label}</button>;
}
