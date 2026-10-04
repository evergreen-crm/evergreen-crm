'use client';
// Prints the current page (menus and buttons are hidden on paper).
// Checklist items are opened first so everything shows on paper.
export default function PrintButton({ label = 'Print' }) {
  const go = () => {
    document.querySelectorAll('details.onb-item, details.print-open').forEach((d) => { d.open = true; });
    window.print();
  };
  return <button type="button" className={label === 'Print' ? 'link' : ''} onClick={go}>{label}</button>;
}
