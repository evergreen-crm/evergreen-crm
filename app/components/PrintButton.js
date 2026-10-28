'use client';
// Prints the record form on the page.
export default function PrintButton() {
  return <button type="button" className="secondary" onClick={() => window.print()}>Print</button>;
}
