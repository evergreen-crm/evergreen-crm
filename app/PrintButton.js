'use client';
// Prints the current page (menus and buttons are hidden on paper).
export default function PrintButton() {
  return <button className="link" onClick={() => window.print()}>Print</button>;
}
