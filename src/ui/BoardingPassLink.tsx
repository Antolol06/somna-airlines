import { useEffect, useState } from 'react';
import { boardingPassPdf, type BoardingPass } from '../lib/boardingPass';

export function BoardingPassLink({ reference, journey, quote, prefs, primary = false }: BoardingPass & { primary?: boolean }) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    const file = new Blob([boardingPassPdf({ reference, journey, quote, prefs })], { type: 'application/pdf' });
    const href = URL.createObjectURL(file);
    setUrl(href);
    return () => URL.revokeObjectURL(href);
  }, [reference, journey, quote, prefs]);

  return (
    <a className={`btn ${primary ? 'btn-primary' : 'btn-ghost'}`} href={url} download={`SOMNA-${reference}-Boarding-Passes.pdf`}>
      Download boarding passes (PDF)
    </a>
  );
}
