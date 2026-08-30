import type { UiText } from './i18n.js';

export default function HelpDialog({ text, dialogRef }: {
  text: UiText;
  dialogRef: React.RefObject<HTMLDialogElement>;
}) {
  return (
    <dialog
      ref={dialogRef}
      className="help-dialog"
      aria-labelledby="help-dialog-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="help-dialog-panel">
        <header>
          <div>
            <h2 id="help-dialog-title">{text.helpTitle}</h2>
            <p>{text.helpIntro}</p>
          </div>
          <button type="button" aria-label={text.close} title={text.close} onClick={() => dialogRef.current?.close()}>×</button>
        </header>

        <section>
          <h3>{text.quickStartTitle}</h3>
          <ol>{text.quickStartSteps.map((step) => <li key={step}>{step}</li>)}</ol>
        </section>

        <section>
          <h3>{text.shortcutsTitle}</h3>
          <dl className="shortcut-list">
            {text.shortcuts.map(({ keys, action }) => (
              <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>
            ))}
          </dl>
        </section>

        <section>
          <h3>{text.faqTitle}</h3>
          <div className="help-faq">
            {text.faqItems.map(({ question, answer }) => (
              <details key={question}><summary>{question}</summary><p>{answer}</p></details>
            ))}
          </div>
        </section>

        <section>
          <h3>{text.browserSupportTitle}</h3>
          <p>{text.browserSupport}</p>
        </section>
      </div>
    </dialog>
  );
}
