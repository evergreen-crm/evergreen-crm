// Header, tabs and print button shared by every QA portal page.
import Link from 'next/link';
import PrintButton from '@/app/PrintButton';
import { QA_PAGES } from '@/lib/qa';
import { fmtDateTime } from '@/lib/options';

export default function QaShell({ active, title, intro, children, printedBy }) {
  return (
    <main className="report qa">
      <div className="title-row">
        <h1 style={{ marginBottom: 0 }}>🏅 {title}</h1>
        <PrintButton label="🖨 Print" />
      </div>
      <p className="muted small" style={{ marginTop: 4 }}>Quality assurance · COA standards (CARF shown as a secondary note) · Directors and up only · every view is logged</p>
      <nav className="qa-tabs no-print">
        {QA_PAGES.map((p) => <Link key={p.href} href={p.href} className={p.href === active ? 'on' : ''}>{p.icon} {p.label}</Link>)}
      </nav>
      {intro && <p className="small">{intro}</p>}
      {children}
      <p className="muted small print-only">Printed {fmtDateTime(new Date().toISOString())}{printedBy ? ` by ${printedBy}` : ''} · Evergreen Community Care Inc. · Confidential — quality assurance record</p>
    </main>
  );
}
