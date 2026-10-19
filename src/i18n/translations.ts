import { Language } from '../types/document';

export interface Translations {
  appName: string;
  tagline: string;
  // Tabs
  newDoc: string;
  untitled: string;
  unsavedChanges: string;
  closeTab: string;
  closeOtherTabs: string;
  duplicateTab: string;
  splitView: string;
  singleView: string;

  // Ribbon Tabs
  tabFile: string;
  tabHome: string;
  tabInsert: string;
  tabLayout: string;
  tabReview: string;
  tabCloud: string;
  tabExport: string;

  // File Menu
  openFiles: string;
  openFilesDesc: string;
  saveNow: string;
  saveAs: string;
  exportDocument: string;
  printPreview: string;
  closeDocument: string;
  newBlankDoc: string;
  sampleArmenianDoc: string;
  sampleRussianDoc: string;
  sampleEnglishDoc: string;

  // Home Ribbon
  undo: string;
  redo: string;
  cut: string;
  copy: string;
  paste: string;
  fontFamily: string;
  fontSize: string;
  bold: string;
  italic: string;
  underline: string;
  strikethrough: string;
  subscript: string;
  superscript: string;
  textColor: string;
  highlightColor: string;
  clearFormatting: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  alignJustify: string;
  bulletList: string;
  numberedList: string;
  indent: string;
  outdent: string;
  lineSpacing: string;
  headingNormal: string;
  heading1: string;
  heading2: string;
  heading3: string;
  quoteStyle: string;

  // Insert Ribbon
  table: string;
  insertTable: string;
  tableRows: string;
  tableCols: string;
  insertButton: string;
  image: string;
  insertImage: string;
  imageUrlPrompt: string;
  horizontalLine: string;
  pageBreak: string;
  dateTime: string;
  symbol: string;
  armenianSymbols: string;
  russianSymbols: string;

  // Layout Ribbon
  pageMargins: string;
  marginsNormal: string;
  marginsNarrow: string;
  marginsWide: string;
  orientation: string;
  portrait: string;
  landscape: string;
  paperSize: string;
  pageColor: string;
  toggleRuler: string;

  // Review Ribbon
  wordCount: string;
  charCount: string;
  readingTime: string;
  paragraphs: string;
  findReplace: string;
  find: string;
  replace: string;
  replaceAll: string;
  documentOutline: string;
  noHeadingsFound: string;
  armenianKeyboard: string;
  russianKeyboard: string;

  // Cloud Sync
  cloudSync: string;
  synced: string;
  syncing: string;
  modified: string;
  offline: string;
  syncNow: string;
  autoSyncActive: string;
  autoSyncEvery: string;
  revisionHistory: string;
  createSnapshot: string;
  snapshotName: string;
  restoreSnapshot: string;
  exportCloudBackup: string;
  importCloudBackup: string;
  noSnapshotsYet: string;
  cloudStorageRoom: string;
  connectedDevices: string;

  // Export Menu
  exportAsDocx: string;
  exportAsRtf: string;
  exportAsPdf: string;
  exportAsHtml: string;
  exportAsTxt: string;
  exportAsMd: string;
  docxDesc: string;
  rtfDesc: string;
  pdfDesc: string;
  htmlDesc: string;
  txtDesc: string;
  exportModalTitle: string;
  downloadFile: string;
  cancel: string;

  // Status Bar
  statusReady: string;
  statusSaved: string;
  statusZoom: string;
  wordsLabel: string;
  charsLabel: string;
  langIndicator: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    appName: 'Lithora',
    tagline: 'Multilingual Word & RTF Document Suite',
    newDoc: 'New Document',
    untitled: 'Untitled Document',
    unsavedChanges: 'Unsaved changes',
    closeTab: 'Close tab',
    closeOtherTabs: 'Close other tabs',
    duplicateTab: 'Duplicate document',
    splitView: 'Split View',
    singleView: 'Single View',

    tabFile: 'File',
    tabHome: 'Home',
    tabInsert: 'Insert',
    tabLayout: 'Layout',
    tabReview: 'Review',
    tabCloud: 'Cloud & Sync',
    tabExport: 'Export',

    openFiles: 'Open Documents',
    openFilesDesc: 'Open .docx, .rtf, .html, .txt files (batch multiple files supported)',
    saveNow: 'Save Changes',
    saveAs: 'Save As...',
    exportDocument: 'Export Document',
    printPreview: 'Print / Save as PDF',
    closeDocument: 'Close Document',
    newBlankDoc: 'New Blank Document',
    sampleArmenianDoc: 'Open Armenian Sample (.docx)',
    sampleRussianDoc: 'Open Russian Sample (.rtf)',
    sampleEnglishDoc: 'Open English Sample (.docx)',

    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Y)',
    cut: 'Cut (Ctrl+X)',
    copy: 'Copy (Ctrl+C)',
    paste: 'Paste (Ctrl+V)',
    fontFamily: 'Font Family',
    fontSize: 'Font Size',
    bold: 'Bold (Ctrl+B)',
    italic: 'Italic (Ctrl+I)',
    underline: 'Underline (Ctrl+U)',
    strikethrough: 'Strikethrough',
    subscript: 'Subscript',
    superscript: 'Superscript',
    textColor: 'Text Color',
    highlightColor: 'Highlight Color',
    clearFormatting: 'Clear Formatting',
    alignLeft: 'Align Left (Ctrl+L)',
    alignCenter: 'Align Center (Ctrl+E)',
    alignRight: 'Align Right (Ctrl+R)',
    alignJustify: 'Justify (Ctrl+J)',
    bulletList: 'Bulleted List',
    numberedList: 'Numbered List',
    indent: 'Increase Indent',
    outdent: 'Decrease Indent',
    lineSpacing: 'Line Spacing',
    headingNormal: 'Normal Text',
    heading1: 'Heading 1',
    heading2: 'Heading 2',
    heading3: 'Heading 3',
    quoteStyle: 'Blockquote',

    table: 'Table',
    insertTable: 'Insert Table',
    tableRows: 'Rows',
    tableCols: 'Columns',
    insertButton: 'Insert',
    image: 'Image',
    insertImage: 'Insert Image',
    imageUrlPrompt: 'Enter image URL or choose file below',
    horizontalLine: 'Horizontal Line',
    pageBreak: 'Page Break',
    dateTime: 'Date & Time',
    symbol: 'Special Characters',
    armenianSymbols: 'Armenian Alphabet & Punctuation',
    russianSymbols: 'Russian Cyrillic Alphabet',

    pageMargins: 'Margins',
    marginsNormal: 'Normal (25mm)',
    marginsNarrow: 'Narrow (12mm)',
    marginsWide: 'Wide (38mm)',
    orientation: 'Orientation',
    portrait: 'Portrait',
    landscape: 'Landscape',
    paperSize: 'Paper Size',
    pageColor: 'Page Color',
    toggleRuler: 'Toggle Ruler',

    wordCount: 'Word Count',
    charCount: 'Characters',
    readingTime: 'Reading Time',
    paragraphs: 'Paragraphs',
    findReplace: 'Find & Replace',
    find: 'Find text...',
    replace: 'Replace with...',
    replaceAll: 'Replace All',
    documentOutline: 'Document Outline',
    noHeadingsFound: 'No headings found in this document.',
    armenianKeyboard: 'Armenian Keyboard Helper',
    russianKeyboard: 'Russian Cyrillic Helper',

    cloudSync: 'Cloud Synchronization',
    synced: 'Cloud Synced',
    syncing: 'Syncing to Cloud...',
    modified: 'Unsaved in Cloud',
    offline: 'Working Offline',
    syncNow: 'Sync to Cloud Now',
    autoSyncActive: 'Automatic Cloud Autosave is Active',
    autoSyncEvery: 'Background sync every 5 seconds on change',
    revisionHistory: 'Cloud Revision Snapshots',
    createSnapshot: 'Save Snapshot',
    snapshotName: 'Snapshot label (e.g., Draft v2)...',
    restoreSnapshot: 'Restore Version',
    exportCloudBackup: 'Export Cloud Workspace Backup (.json)',
    importCloudBackup: 'Import Cloud Workspace Backup',
    noSnapshotsYet: 'No snapshots recorded yet. Click "Save Snapshot" above.',
    cloudStorageRoom: 'Cloud Workspace ID',
    connectedDevices: 'Synced across your browser sessions & cloud cache',

    exportAsDocx: 'Microsoft Word (.docx)',
    exportAsRtf: 'Rich Text Format (.rtf)',
    exportAsPdf: 'Portable Document Format (.pdf)',
    exportAsHtml: 'Web Page (.html)',
    exportAsTxt: 'Plain Text (.txt)',
    exportAsMd: 'Markdown (.md)',
    docxDesc: 'Standard Office Open XML format with full formatting and tables',
    rtfDesc: 'Rich Text Format with complete Unicode escapes for Armenian & Russian',
    pdfDesc: 'Clean paginated printout with custom margins and headers',
    htmlDesc: 'Self-contained HTML document with embedded styles',
    txtDesc: 'Clean plain text stripped of formatting tags',
    exportModalTitle: 'Export Document',
    downloadFile: 'Download File',
    cancel: 'Cancel',

    statusReady: 'Ready',
    statusSaved: 'All changes saved',
    statusZoom: 'Zoom',
    wordsLabel: 'words',
    charsLabel: 'chars',
    langIndicator: 'English (US)',
  },
  ru: {
    appName: 'Lithora',
    tagline: 'Многоязычный редактор документов Word и RTF',
    newDoc: 'Новый документ',
    untitled: 'Документ без названия',
    unsavedChanges: 'Несохраненные изменения',
    closeTab: 'Закрыть вкладку',
    closeOtherTabs: 'Закрыть другие вкладки',
    duplicateTab: 'Дублировать документ',
    splitView: 'Разделенный вид',
    singleView: 'Обычный вид',

    tabFile: 'Файл',
    tabHome: 'Главная',
    tabInsert: 'Вставка',
    tabLayout: 'Разметка',
    tabReview: 'Рецензирование',
    tabCloud: 'Облако',
    tabExport: 'Экспорт',

    openFiles: 'Открыть документы',
    openFilesDesc: 'Открытие файлов .docx, .rtf, .html, .txt (поддержка пакета файлов)',
    saveNow: 'Сохранить изменения',
    saveAs: 'Сохранить как...',
    exportDocument: 'Экспортировать документ',
    printPreview: 'Печать / Сохранить в PDF',
    closeDocument: 'Закрыть документ',
    newBlankDoc: 'Создать пустой документ',
    sampleArmenianDoc: 'Армянский образец (.docx)',
    sampleRussianDoc: 'Русский образец (.rtf)',
    sampleEnglishDoc: 'Английский образец (.docx)',

    undo: 'Отменить (Ctrl+Z)',
    redo: 'Повторить (Ctrl+Y)',
    cut: 'Вырезать (Ctrl+X)',
    copy: 'Копировать (Ctrl+C)',
    paste: 'Вставить (Ctrl+V)',
    fontFamily: 'Шрифт',
    fontSize: 'Размер шрифта',
    bold: 'Полужирный (Ctrl+B)',
    italic: 'Курсив (Ctrl+I)',
    underline: 'Подчеркнутый (Ctrl+U)',
    strikethrough: 'Зачеркнутый',
    subscript: 'Подстрочный',
    superscript: 'Надстрочный',
    textColor: 'Цвет текста',
    highlightColor: 'Цвет выделения',
    clearFormatting: 'Очистить форматирование',
    alignLeft: 'По левому краю (Ctrl+L)',
    alignCenter: 'По центру (Ctrl+E)',
    alignRight: 'По правому краю (Ctrl+R)',
    alignJustify: 'По ширине (Ctrl+J)',
    bulletList: 'Маркированный список',
    numberedList: 'Нумерованный список',
    indent: 'Увеличить отступ',
    outdent: 'Уменьшить отступ',
    lineSpacing: 'Межстрочный интервал',
    headingNormal: 'Обычный текст',
    heading1: 'Заголовок 1',
    heading2: 'Заголовок 2',
    heading3: 'Заголовок 3',
    quoteStyle: 'Цитата',

    table: 'Таблица',
    insertTable: 'Вставить таблицу',
    tableRows: 'Строки',
    tableCols: 'Столбцы',
    insertButton: 'Вставить',
    image: 'Изображение',
    insertImage: 'Вставить изображение',
    imageUrlPrompt: 'Введите URL изображения или выберите файл ниже',
    horizontalLine: 'Горизонтальная линия',
    pageBreak: 'Разрыв страницы',
    dateTime: 'Дата и время',
    symbol: 'Специальные символы',
    armenianSymbols: 'Армянский алфавит и пунктуация',
    russianSymbols: 'Русский алфавит (Кириллица)',

    pageMargins: 'Поля',
    marginsNormal: 'Обычные (25 мм)',
    marginsNarrow: 'Узкие (12 мм)',
    marginsWide: 'Широкие (38 мм)',
    orientation: 'Ориентация',
    portrait: 'Книжная',
    landscape: 'Альбомная',
    paperSize: 'Размер бумаги',
    pageColor: 'Цвет страницы',
    toggleRuler: 'Линейка',

    wordCount: 'Количество слов',
    charCount: 'Символов',
    readingTime: 'Время чтения',
    paragraphs: 'Абзацев',
    findReplace: 'Найти и заменить',
    find: 'Найти текст...',
    replace: 'Заменить на...',
    replaceAll: 'Заменить всё',
    documentOutline: 'Структура документа',
    noHeadingsFound: 'Заголовки в документе не найдены.',
    armenianKeyboard: 'Помощник армянской клавиатуры',
    russianKeyboard: 'Помощник русской клавиатуры',

    cloudSync: 'Облачная синхронизация',
    synced: 'Синхронизировано',
    syncing: 'Синхронизация...',
    modified: 'Не сохранено в облаке',
    offline: 'Автономный режим',
    syncNow: 'Синхронизировать сейчас',
    autoSyncActive: 'Автосохранение в облако включено',
    autoSyncEvery: 'Фоновая синхронизация каждые 5 сек при изменении',
    revisionHistory: 'История облачных снимков',
    createSnapshot: 'Сохранить снимок',
    snapshotName: 'Название версии (напр., Черновик v2)...',
    restoreSnapshot: 'Восстановить версию',
    exportCloudBackup: 'Экспорт резервной копии (.json)',
    importCloudBackup: 'Импорт резервной копии',
    noSnapshotsYet: 'Снимков пока нет. Нажмите «Сохранить снимок».',
    cloudStorageRoom: 'ID облачного пространства',
    connectedDevices: 'Синхронизация между сессиями браузера и облачным кэшем',

    exportAsDocx: 'Microsoft Word (.docx)',
    exportAsRtf: 'Формат RTF (.rtf)',
    exportAsPdf: 'Документ PDF (.pdf)',
    exportAsHtml: 'Веб-страница (.html)',
    exportAsTxt: 'Обычный текст (.txt)',
    exportAsMd: 'Markdown (.md)',
    docxDesc: 'Стандартный формат Office Open XML со всеми стилями и таблицами',
    rtfDesc: 'Формат RTF с корректным кодированием Unicode для армянского и русского',
    pdfDesc: 'Готовый к печати макет со страницами и полями',
    htmlDesc: 'Автономная веб-страница со встроенными стилями',
    txtDesc: 'Чистый текст без тегов форматирования',
    exportModalTitle: 'Экспорт документа',
    downloadFile: 'Скачать файл',
    cancel: 'Отмена',

    statusReady: 'Готово',
    statusSaved: 'Все изменения сохранены',
    statusZoom: 'Масштаб',
    wordsLabel: 'слов',
    charsLabel: 'симв.',
    langIndicator: 'Русский',
  },
  hy: {
    appName: 'Lithora',
    tagline: 'Բազմալեզու Word և RTF փաստաթղթերի խմբագիր',
    newDoc: 'Նոր փաստաթուղթ',
    untitled: 'Անանուն փաստաթուղթ',
    unsavedChanges: 'Չպահպանված փոփոխություններ',
    closeTab: 'Փակել ներդիրը',
    closeOtherTabs: 'Փակել մյուս ներդիրները',
    duplicateTab: 'Կրկնօրինակել փաստաթուղթը',
    splitView: 'Բաժանված դիտում',
    singleView: 'Միասնական դիտում',

    tabFile: 'Ֆայլ',
    tabHome: 'Գլխավոր',
    tabInsert: 'Տեղադրել',
    tabLayout: 'Էջի ձևավորում',
    tabReview: 'Ստուգում',
    tabCloud: 'Ամպային սինխրոնիզացիա',
    tabExport: 'Արտահանում',

    openFiles: 'Բացել փաստաթղթեր',
    openFilesDesc: 'Բացել .docx, .rtf, .html, .txt ֆայլեր (միաժամանակ մի քանի ֆայլ)',
    saveNow: 'Պահպանել փոփոխությունները',
    saveAs: 'Պահպանել որպես...',
    exportDocument: 'Արտահանել փաստաթուղթը',
    printPreview: 'Տպել / Պահպանել որպես PDF',
    closeDocument: 'Փակել փաստաթուղթը',
    newBlankDoc: 'Նոր դատարկ փաստաթուղթ',
    sampleArmenianDoc: 'Հայերեն օրինակ (.docx)',
    sampleRussianDoc: 'Ռուսերեն օրինակ (.rtf)',
    sampleEnglishDoc: 'Անգլերեն օրինակ (.docx)',

    undo: 'Հետարկել (Ctrl+Z)',
    redo: 'Կրկնել (Ctrl+Y)',
    cut: 'Կտրել (Ctrl+X)',
    copy: 'Պատճենել (Ctrl+C)',
    paste: 'Տեղադրել (Ctrl+V)',
    fontFamily: 'Տառատեսակ',
    fontSize: 'Տառաչափ',
    bold: 'Թավ (Ctrl+B)',
    italic: 'Շեղ (Ctrl+I)',
    underline: 'Ընդգծված (Ctrl+U)',
    strikethrough: 'Գծանշված',
    subscript: 'Ստորին ինդեքս',
    superscript: 'Վերին ինդեքս',
    textColor: 'Տեքստի գույն',
    highlightColor: 'Ընդգծման գույն',
    clearFormatting: 'Մաքրել ձևաչափը',
    alignLeft: 'Ձախ եզրով (Ctrl+L)',
    alignCenter: 'Կենտրոնով (Ctrl+E)',
    alignRight: 'Աջ եզրով (Ctrl+R)',
    alignJustify: 'Հավասարեցնել (Ctrl+J)',
    bulletList: 'Կետադրված ցուցակ',
    numberedList: 'Համարակալված ցուցակ',
    indent: 'Ավելացնել խորշումը',
    outdent: 'Նվազեցնել խորշումը',
    lineSpacing: 'Տողամիջյան հեռավորություն',
    headingNormal: 'Սովորական տեքստ',
    heading1: 'Վերնագիր 1',
    heading2: 'Վերնագիր 2',
    heading3: 'Վերնագիր 3',
    quoteStyle: 'Մեջբերում',

    table: 'Աղյուսակ',
    insertTable: 'Տեղադրել աղյուսակ',
    tableRows: 'Տողեր',
    tableCols: 'Սյուներ',
    insertButton: 'Տեղադրել',
    image: 'Նկար',
    insertImage: 'Տեղադրել նկար',
    imageUrlPrompt: 'Մուտքագրեք պատկերի հղումը կամ ընտրեք ֆայլը ներքևում',
    horizontalLine: 'Հորիզոնական գիծ',
    pageBreak: 'Էջի բաժանում',
    dateTime: 'Ամսաթիվ և ժամ',
    symbol: 'Հատուկ նշաններ',
    armenianSymbols: 'Հայերեն այբուբեն և կետադրություն (՚, ՛, ՜, ՞, ֊, ։)',
    russianSymbols: 'Ռուսերեն այբուբեն (Կիրիլիցա)',

    pageMargins: 'Լուսանցքներ',
    marginsNormal: 'Սովորական (25 մմ)',
    marginsNarrow: 'Նեղ (12 մմ)',
    marginsWide: 'Լայն (38 մմ)',
    orientation: 'Կողմնորոշում',
    portrait: 'Ուղղաձիգ',
    landscape: 'Հորիզոնական',
    paperSize: 'Էջի չափս',
    pageColor: 'Էջի գույն',
    toggleRuler: 'Քանոն',

    wordCount: 'Բառերի քանակ',
    charCount: 'Նիշեր',
    readingTime: 'Ընթերցման ժամանակ',
    paragraphs: 'Պարբերություններ',
    findReplace: 'Գտնել և փոխարինել',
    find: 'Փնտրել տեքստ...',
    replace: 'Փոխարինել...',
    replaceAll: 'Փոխարինել բոլորը',
    documentOutline: 'Փաստաթղթի կառուցվածք',
    noHeadingsFound: 'Փաստաթղթում վերնագրեր չեն գտնվել:',
    armenianKeyboard: 'Հայերեն ստեղնաշարի օգնական',
    russianKeyboard: 'Ռուսերեն ստեղնաշարի օգնական',

    cloudSync: 'Ամպային համաժամեցում',
    synced: 'Համաժամեցված է',
    syncing: 'Համաժամեցվում է...',
    modified: 'Չպահպանված ամպում',
    offline: 'Անցանց ռեժիմ',
    syncNow: 'Համաժամեցնել հիմա',
    autoSyncActive: 'Ինքնաշխատ ամպային պահպանումն ակտիվ է',
    autoSyncEvery: 'Հետին պլանում համաժամեցում յուրաքանչյուր 5 վրկ.',
    revisionHistory: 'Ամպային տարբերակների պատմություն',
    createSnapshot: 'Պահպանել պատճեն',
    snapshotName: 'Տարբերակի անունը (օր.՝ Սևագիր v2)...',
    restoreSnapshot: 'Վերականգնել տարբերակը',
    exportCloudBackup: 'Արտահանել ամբողջ արխիվը (.json)',
    importCloudBackup: 'Ներմուծել ամբողջ արխիվը',
    noSnapshotsYet: 'Պահպանված տարբերակներ դեռ չկան: Սեղմեք «Պահպանել պատճեն»:',
    cloudStorageRoom: 'Ամպային աշխատատիրույթի ID',
    connectedDevices: 'Համաժամեցված է բրաուզերի և ամպային պահոցի միջև',

    exportAsDocx: 'Microsoft Word (.docx)',
    exportAsRtf: 'Հարուստ տեքստ (.rtf)',
    exportAsPdf: 'Փաստաթուղթ PDF (.pdf)',
    exportAsHtml: 'Վեբ էջ (.html)',
    exportAsTxt: 'Պարզ տեքստ (.txt)',
    exportAsMd: 'Markdown (.md)',
    docxDesc: 'Ստանդարտ Office Open XML ձևաչափ ամբողջական ոճերով և աղյուսակներով',
    rtfDesc: 'RTF ձևաչափ Յունիկոդի ճշգրիտ կոդավորմամբ հայերենի և ռուսերենի համար',
    pdfDesc: 'Տպագրության պատրաստ մաքուր էջեր լուսանցքներով',
    htmlDesc: 'Ինքնուրույն վեբ էջ ներկառուցված ոճերով',
    txtDesc: 'Մաքուր տեքստ առանց ավելորդ նշագրման',
    exportModalTitle: 'Արտահանել փաստաթուղթը',
    downloadFile: 'Ներբեռնել ֆայլը',
    cancel: 'Չեղարկել',

    statusReady: 'Պատրաստ է',
    statusSaved: 'Բոլոր փոփոխությունները պահպանված են',
    statusZoom: 'Մասշտաբ',
    wordsLabel: 'բառ',
    charsLabel: 'նիշ',
    langIndicator: 'Հայերեն (AM)',
  },
};
