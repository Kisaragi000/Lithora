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
<p>This document specifies the operational scope, technical architecture, and deployment deliverables for <strong>WordCraft</strong>, an enterprise-grade multilingual document processor built for native <code>.docx</code> and <code>.rtf</code> editing.</p>
<blockquote>WordCraft enables seamless multi-document productivity across desktop and cloud environments, bridging legacy RTF formatting with modern OpenXML standards.</blockquote>

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
