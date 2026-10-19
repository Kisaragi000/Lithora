import { DocumentTab } from '../types/document';

export const sampleEnglishDoc: DocumentTab = {
  id: 'doc_sample_en',
  title: 'Project_Charter_2026.docx',
  format: 'docx',
  isDirty: false,
  createdAt: Date.now() - 3600000,
  lastSaved: Date.now() - 300000,
  cloudSyncStatus: 'synced',
  pageSettings: {
    size: 'A4',
    orientation: 'portrait',
    margins: 'normal',
    pageColor: '#ffffff',
    showRuler: true,
    zoom: 100,
  },
  historyUndo: [],
  historyRedo: [],
  content: `
<h1>Project Charter & Technical Specification</h1>
<p style="text-align: left;"><strong>Author:</strong> Lead Systems Architect &middot; <strong>Date:</strong> October 2026 &middot; <strong>Status:</strong> Approved</p>
<hr/>
<h2>1. Executive Summary</h2>
<p>This document specifies the operational scope, technical architecture, and deployment deliverables for <strong>Lithora</strong>, an enterprise-grade multilingual document processor built for native <code>.docx</code> and <code>.rtf</code> editing.</p>
<blockquote>Lithora enables seamless multi-document productivity across desktop and cloud environments, bridging legacy RTF formatting with modern OpenXML standards.</blockquote>

<h2>2. Core Functional Requirements</h2>
<ul>
  <li><strong>Native High-Fidelity Parsing:</strong> Seamless bidirectional conversion of Microsoft Word (.docx) and Rich Text Format (.rtf).</li>
  <li><strong>Multi-Tab Multitasking:</strong> Open dozens of documents concurrently without memory leaks or state collision.</li>
  <li><strong>Continuous Cloud Synchronization:</strong> Real-time snapshot timeline with single-click version recovery.</li>
  <li><strong>Native Tri-Lingual Support:</strong> Complete typographic rendering for English, Russian (Cyrillic), and Armenian (Sylfaen/Noto Sans).</li>
</ul>

<h2>3. Performance & System Matrix</h2>
<table>
  <thead>
    <tr>
      <th>Module</th>
      <th>Specification</th>
      <th>Latency Benchmark</th>
      <th>Compliance</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>DOCX OpenXML Engine</strong></td>
      <td>Full styles, tables &amp; headings</td>
      <td>&lt; 150 ms</td>
      <td>ISO/IEC 29500</td>
    </tr>
    <tr>
      <td><strong>RTF Serializer</strong></td>
      <td>Signed 16-bit Unicode escapes (\\uN?)</td>
      <td>&lt; 50 ms</td>
      <td>RTF 1.9.1 Spec</td>
    </tr>
    <tr>
      <td><strong>Cloud Autosave</strong></td>
      <td>Debounced background snapshotting</td>
      <td>Background</td>
      <td>Zero Data Loss</td>
    </tr>
  </tbody>
</table>

<p>All formatting, alignments, and table borders are preserved during round-trip exports.</p>
`,
};

export const sampleArmenianDoc: DocumentTab = {
  id: 'doc_sample_hy',
  title: 'Հայաստանի_Մշակույթը.docx',
  format: 'docx',
  isDirty: false,
  createdAt: Date.now() - 7200000,
  lastSaved: Date.now() - 600000,
  cloudSyncStatus: 'synced',
  pageSettings: {
    size: 'A4',
    orientation: 'portrait',
    margins: 'normal',
    pageColor: '#ffffff',
    showRuler: true,
    zoom: 100,
  },
  historyUndo: [],
  historyRedo: [],
  content: `
<h1>Հայաստանի Պատմամշակութային Ժառանգությունը</h1>
<p><strong>Հեղինակ՝</strong> Գիտական խորհուրդ &middot; <strong>Տարեթիվ՝</strong> 2026 թ. &middot; <strong>Կարգավիճակ՝</strong> Հաստատված</p>
<hr/>
<h2>1. Ներածություն և ակնարկ</h2>
<p>Հայոց պատմությունն ու մշակույթը հանդիսանում են համաշխարհային քաղաքակրթության անքակտելի մասը։ <strong>Մեսրոպ Մաշտոցի</strong> կողմից 405 թվականին հայոց գրերի ստեղծումը նոր դարաշրջան բացեց հայ գրականության, գիտության և ինքնության պահպանման գործում։</p>
<blockquote>«Ճանաչել զիմաստութիւն եւ զխրատ, իմանալ զբանս հանճարոյ...» — Առաջին հայերեն թարգմանված նախադասությունը։</blockquote>

<h2>2. Կարևորագույն ճարտարապետական կոթողներ</h2>
<ul>
  <li><strong>Էջմիածնի Մայր Տաճար (303 թ.)՝</strong> Աշխարհի հնագույն քրիստոնեական տաճարներից մեկը։</li>
  <li><strong>Գառնիի հեթանոսական տաճար (1-ին դար)՝</strong> Հելլենիստական ճարտարապետության միակ պահպանված նմուշը տարածաշրջանում։</li>
  <li><strong>Տաթևի վանական համալիր (9-րդ դար)՝</strong> Միջնադարյան Հայաստանի գիտակրթական և հոգևոր կենտրոն։</li>
</ul>

<h2>3. Մշակութային ժառանգության ցուցանիշներ</h2>
<table>
  <thead>
    <tr>
      <th>Հուշարձան / Կոթող</th>
      <th>Կառուցման դարաշրջան</th>
      <th>Տեղադրություն</th>
      <th>ՅՈՒՆԵՍԿՕ-ի կարգավիճակ</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Գեղարդավանք</strong></td>
      <td>4-13-րդ դարեր</td>
      <td>Կոտայքի մարզ</td>
      <td>Համաշխարհային ժառանգություն</td>
    </tr>
    <tr>
      <td><strong>Սանահին և Հաղպատ</strong></td>
      <td>10-րդ դար</td>
      <td>Լոռու մարզ</td>
      <td>Համաշխարհային ժառանգություն</td>
    </tr>
    <tr>
      <td><strong>Մատենադարան</strong></td>
      <td>1959 թ. (ֆոնդը՝ հնագույն)</td>
      <td>Երևան</td>
      <td>Աշխարհի հիշողություն ռեգիստր</td>
    </tr>
  </tbody>
</table>

<p>Փաստաթուղթը պարունակում է հայերենի յուրահատուկ կետադրական նշանները՝ <strong>բութ ( ՚ )</strong>, <strong>շեշտ ( ՛ )</strong>, <strong>բացականչական ( ՜ )</strong>, <strong>հարցական ( ՞ )</strong> և <strong>վերջակետ ( ։ )</strong>։</p>
`,
};

export const sampleRussianDoc: DocumentTab = {
  id: 'doc_sample_ru',
  title: 'Аналитический_Отчет_2026.rtf',
  format: 'rtf',
  isDirty: false,
  createdAt: Date.now() - 10800000,
  lastSaved: Date.now() - 900000,
  cloudSyncStatus: 'synced',
  pageSettings: {
    size: 'A4',
    orientation: 'portrait',
    margins: 'normal',
    pageColor: '#ffffff',
    showRuler: true,
    zoom: 100,
  },
  historyUndo: [],
  historyRedo: [],
  content: `
<h1>Аналитический отчет и операционный план</h1>
<p style="text-align: left;"><strong>Департамент технологий</strong> &middot; <strong>Дата выпуска:</strong> Октябрь 2026 г. &middot; <strong>Гриф:</strong> Внутреннее использование</p>
<hr/>
<h2>1. Цели и стратегические ориентиры</h2>
<p>Настоящий отчет подводит итоги интеграции корпоративных систем документооборота с поддержкой стандартов <strong>Microsoft Word (.docx)</strong> и <strong>Rich Text Format (.rtf)</strong> с расширенной поддержкой кириллических кодировок и Юникода.</p>
<blockquote>Обеспечение стабильности и кроссплатформенной синхронизации является ключевым фактором продуктивности многопользовательских рабочих групп.</blockquote>

<h2>2. Основные технические достижения</h2>
<ol>
  <li><strong>Нативная поддержка форматов:</strong> Полноценный разбор таблиц, списков, начертаний и стилей заголовков.</li>
  <li><strong>Многодокументная панель вкладок:</strong> Быстрое переключение между открытыми файлами без потери курсора и истории изменений.</li>
  <li><strong>Облачная синхронизация:</strong> Автоматическое резервное копирование с фиксацией контрольных точек версий.</li>
  <li><strong>Многоязычный интерфейс:</strong> Полная локализация на русский, английский и армянский языки.</li>
</ol>

<h2>3. Сводная таблица показателей эффективности</h2>
<table>
  <thead>
    <tr>
      <th>Показатель</th>
      <th>Базовое значение</th>
      <th>Целевой показатель</th>
      <th>Статус выполнения</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Скорость открытия .docx</strong></td>
      <td>450 мс</td>
      <td>120 мс</td>
      <td>Перевыполнен</td>
    </tr>
    <tr>
      <td><strong>Точность экспорта RTF</strong></td>
      <td>92.4%</td>
      <td>99.9%</td>
      <td>Соответствует</td>
    </tr>
    <tr>
      <td><strong>Синхронизация в облаке</strong></td>
      <td>1 раз в минуту</td>
      <td>Каждые 5 сек</td>
      <td>Активно</td>
    </tr>
  </tbody>
</table>

<p>Документ готов к согласованию и экспорту в форматах <em>.docx</em>, <em>.rtf</em> и <em>.pdf</em>.</p>
`,
};

export const sampleMissingFontsDoc: DocumentTab = {
  id: 'doc_sample_missing_fonts',
  title: 'Executive_Brief_2026.docx',
  format: 'docx',
  isDirty: false,
  createdAt: Date.now() - 1800000,
  lastSaved: Date.now() - 100000,
  cloudSyncStatus: 'synced',
  pageSettings: {
    size: 'A4',
    orientation: 'portrait',
    margins: 'normal',
    pageColor: '#ffffff',
    showRuler: true,
    zoom: 100,
  },
  historyUndo: [],
  historyRedo: [],
  content: `
<h1 style="font-family: 'Aptos Display', sans-serif;">Lithora Enterprise Strategy 2026</h1>
<p style="font-family: 'Aptos', sans-serif; font-size: 1.05rem;">
  <strong>Document Origin:</strong> Microsoft 365 &middot; <strong>Format:</strong> .docx &middot; <strong>Default Font:</strong> Aptos &amp; Cambria
</p>
<hr/>
<h2 style="font-family: 'Aptos Display', sans-serif;">1. Typography Compatibility Analysis</h2>
<p style="font-family: 'Aptos', sans-serif;">
  When opening documents that use proprietary desktop typefaces (such as <em>Aptos</em>, <em>Calibri</em>, or <em>SF Pro Display</em>), Lithora keeps all original font declarations completely intact. If the fonts are not installed locally, a warning is displayed along with curated Google Font replacement suggestions.
</p>
<blockquote style="font-family: 'Cambria', serif; font-style: italic;">
  «Typographic fidelity requires maintaining proportional metrics, x-height balance, and Unicode glyph ranges even when proprietary desktop font licenses are not installed on the host operating system.» &mdash; Digital Publishing Standard
</blockquote>
<h2 style="font-family: 'Aptos Display', sans-serif;">2. Multi-Column Publication Layout</h2>
<div class="doc-columns" style="column-count: 2; column-gap: 28px; -webkit-column-count: 2; margin: 16px 0;">
  <p style="font-family: 'Aptos', sans-serif; text-align: justify; line-height: 1.5; margin-bottom: 8px;">
    <strong>Column A &mdash; Structural Fidelity:</strong> Lithora retains document columns, line spacing rules, margins, and table grid coordinates exactly as defined in Microsoft Word and RTF specifications.
  </p>
  <p style="font-family: 'Aptos', sans-serif; text-align: justify; line-height: 1.5; margin-bottom: 8px;">
    <strong>Column B &mdash; Visual Lines:</strong> Horizontal divider lines, paragraph borders, and column breaks are preserved with sub-pixel alignment, maintaining identical reading flow across devices.
  </p>
</div>
<div class="doc-line" style="border-bottom: 1px solid #cbd5e1; margin: 16px 0;"></div>
<h2 style="font-family: 'Aptos Display', sans-serif;">3. Code &amp; Monospace Embed</h2>
<p style="font-family: 'Consolas', monospace; background-color: #f1f5f9; padding: 10px; border-radius: 6px; font-size: 0.95rem;">
  // Consolas code snippet<br/>
  const lithora = new DocumentProcessor({ preserveColumns: true, preserveLines: true });<br/>
  lithora.resolveReplacements({ Aptos: 'Plus Jakarta Sans', Cambria: 'Caladea' });
</p>
`,
};

export const sampleProofreadingDoc: DocumentTab = {
  id: 'doc_sample_proofreading',
  title: 'Multilingual_Proofread_Demo.docx',
  format: 'docx',
  isDirty: false,
  createdAt: Date.now() - 900000,
  lastSaved: Date.now() - 50000,
  cloudSyncStatus: 'synced',
  pageSettings: {
    size: 'A4',
    orientation: 'portrait',
    margins: 'normal',
    pageColor: '#ffffff',
    showRuler: true,
    zoom: 100,
  },
  historyUndo: [],
  historyRedo: [],
  content: `
<h1>Multilingual Document Proofreading Demonstration</h1>
<p style="color: #64748b; font-size: 0.95rem;">
  <strong>Engine:</strong> Local Desktop Linguistic Processor &middot; <strong>Supported Scripts:</strong> English (EN), Russian (RU), Armenian (ARM / ՀԱՅ)
</p>
<hr/>

<h2>1. English Proofreading Test (Grammar &amp; Spelling)</h2>
<p>
  Lithora is designed to help users recieve high quality documents. In order to acheive teh best results, their are several options available. Make sure you check you're document before sending it, because its features could of been updated. Notice that a apple or a error in formatting can be fixed in a instant.
</p>
<blockquote style="font-style: italic; color: #475569;">
  «At this point in time, each and every writer needs reliable desktop validation.»
</blockquote>

<h2>2. Проверка текста на русском языке (Орфография и пунктуация)</h2>
<p>
  Мы незнаю почему пользователь решил зделать заказ в течении дня , но надеемся что документ будет проверен. Он стараеться писать грамотно, и должен учится новым правилам. Пожалуйста проверьте расписание, потомучто здесь всё согласованно. Одевать пальто нужно по погоде.
</p>

<h2>3. Հայերեն տեքստի սրբագրում (Ուղղագրություն և հոդեր)</h2>
<p class="font-armenian">
  Մեսրոպ Մաշտոցի ստեղծած գրերը նաեւ այսօր մեր ինքնության եական հիմքն են: Առօրեա կյանքում մենք միքանի կարևոր հարց պետք է լուծենք: Ուշադրություն դարձրեք հոդերի ճիշտ գործածությանը. գիրքը ընկավ սեղանից, իսկ մարդն գնաց տուն: Հայերեն նախադասության վերջում դրվում է հայկական վերջակետ;
</p>
`,
};


