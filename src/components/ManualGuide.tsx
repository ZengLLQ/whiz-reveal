import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Languages, X } from 'lucide-react';
import { guideSections, manualContent, type GuideLanguage, type GuideSection } from '../lib/manual-content';
import '../manual-guide.css';

const languageOptions: { id: GuideLanguage; label: string; detail: string; lang: string }[] = [
  { id: 'en', label: 'English', detail: 'User guide', lang: 'en' },
  { id: 'zh', label: '中文', detail: '简体中文使用指南', lang: 'zh-Hans' },
  { id: 'id', label: 'Bahasa Indonesia', detail: 'Panduan penggunaan', lang: 'id' },
];

export function ManualGuide() {
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState<GuideLanguage | null>(null);
  const [section, setSection] = useState<GuideSection>('start');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstLanguageRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const pageHeadingId = useId();
  const copy = language ? manualContent[language] : null;
  const page = copy?.pages[section];

  useEffect(() => {
    if (isOpen && !dialogRef.current?.open) {
      dialogRef.current?.showModal();
      firstLanguageRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    dialogRef.current?.scrollTo({ top: 0 });
    contentRef.current?.scrollTo({ top: 0 });
    if (language) headingRef.current?.focus({ preventScroll: true });
    else firstLanguageRef.current?.focus();
  }, [isOpen, language, section]);

  function openGuide() {
    setLanguage(null);
    setSection('start');
    setIsOpen(true);
  }

  function closeGuide() {
    dialogRef.current?.close();
  }

  return <>
    <button ref={triggerRef} type="button" className="manual-guide-trigger" onClick={openGuide}
      aria-haspopup="dialog" aria-expanded={isOpen} title="User guide · 使用指南 · Panduan penggunaan">
      <BookOpen size={16} aria-hidden="true" /><span>Guide</span>
    </button>
    <dialog ref={dialogRef} className={`manual-guide-dialog${language ? ' manual-guide-reading' : ''}`}
      aria-labelledby={titleId} aria-describedby={descriptionId} lang={copy?.htmlLang ?? 'en'}
      onKeyDown={(event) => event.stopPropagation()}
      onClose={() => { setIsOpen(false); triggerRef.current?.focus(); }}>
      <div className="manual-guide-frame">
        <header className="manual-guide-header">
          <div>
            <p className="manual-guide-eyebrow">WhizReveal / {copy ? copy.language : 'Guide'}</p>
            <h2 id={titleId}>{copy?.title ?? 'Make yourself at home.'}</h2>
            <p id={descriptionId} className="manual-guide-subtitle">{copy?.subtitle ?? <>
              Choose a language. <span lang="zh-Hans">选择语言。</span> <span lang="id">Pilih bahasa.</span>
            </>}</p>
          </div>
          <button type="button" className="manual-guide-close" onClick={closeGuide}
            aria-label={copy?.close ?? 'Close guide'} title={copy?.close ?? 'Close guide'}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        {copy && page ? <>
          <div className="manual-guide-toolbar">
            <nav aria-label={copy.navigation} className="manual-guide-nav">
              {guideSections.map((item) => <button type="button" key={item}
                aria-current={section === item ? 'page' : undefined}
                onClick={() => setSection(item)}>{copy.pages[item].label}</button>)}
            </nav>
            <button type="button" className="manual-guide-language" onClick={() => setLanguage(null)}>
              <Languages size={15} aria-hidden="true" /><span>{copy.changeLanguage}</span>
            </button>
          </div>
          <div className="manual-guide-content" ref={contentRef}>
            <section aria-labelledby={pageHeadingId}>
              <h3 id={pageHeadingId} ref={headingRef} tabIndex={-1}>{page.title}</h3>
              <p className="manual-guide-intro">{page.description}</p>
              <div className="manual-guide-items">
                {page.items.map((item) => <article className="manual-guide-item" key={item.title}>
                  <div className="manual-guide-item-title">
                    <h4>{item.title}</h4>
                    {item.keys && <span className="manual-guide-keys" aria-label={item.keys.join(' + ')}>
                      {item.keys.map((key) => <kbd key={key}>{key}</kbd>)}
                    </span>}
                  </div>
                  <p>{item.body}</p>
                </article>)}
              </div>
              {page.note && <aside className="manual-guide-note">{page.note}</aside>}
            </section>
          </div>
        </> : <div className="manual-guide-languages">
          {languageOptions.map((option, index) => <button type="button" key={option.id}
            ref={index === 0 ? firstLanguageRef : undefined} lang={option.lang}
            className="manual-guide-language-option" onClick={() => setLanguage(option.id)}>
            <span><strong>{option.label}</strong><span>{option.detail}</span></span>
            <ArrowRight size={19} aria-hidden="true" />
          </button>)}
        </div>}
        <footer className="manual-guide-footer">
          <span>{copy?.footer ?? 'WhizReveal by JAYCEE 曾令强'}</span>
          <button type="button" onClick={closeGuide}><kbd>Esc</kbd><span>{copy?.close ?? 'Close guide'}</span></button>
        </footer>
      </div>
    </dialog>
  </>;
}
