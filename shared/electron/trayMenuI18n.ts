export const TRAY_MENU_LOCALES = [
  'en',
  'ru',
  'de',
  'es',
  'fr',
  'ja',
  'pt',
  'cn',
] as const

export type TrayMenuLocale = (typeof TRAY_MENU_LOCALES)[number]

export type TrayMenuLabels = {
  show: string
  hide: string
  addMedia: string
  settings: string
  lock: string
  checkUpdates: string
  exit: string
  quit: string
  /** Jump List description strings */
  showDescription: string
  hideDescription: string
  addMediaDescription: string
  settingsDescription: string
  lockDescription: string
  checkUpdatesDescription: string
  exitDescription: string
}

const EN: TrayMenuLabels = {
  show: 'Show Overdrive',
  hide: 'Hide Overdrive',
  addMedia: 'Add Media',
  settings: 'Settings',
  lock: 'Lock',
  checkUpdates: 'Check for Updates',
  exit: 'Exit',
  quit: 'Quit',
  showDescription: 'Show the Overdrive window',
  hideDescription: 'Hide the Overdrive window',
  addMediaDescription: 'Add media files',
  settingsDescription: 'Open Settings',
  lockDescription: 'Lock Overdrive',
  checkUpdatesDescription: 'Check for Overdrive updates',
  exitDescription: 'Quit Overdrive',
}

const STRINGS: Record<TrayMenuLocale, TrayMenuLabels> = {
  en: EN,
  ru: {
    show: 'Показать Overdrive',
    hide: 'Скрыть Overdrive',
    addMedia: 'Добавить медиа',
    settings: 'Настройки',
    lock: 'Заблокировать',
    checkUpdates: 'Проверить обновления',
    exit: 'Выход',
    quit: 'Завершить',
    showDescription: 'Показать окно Overdrive',
    hideDescription: 'Скрыть окно Overdrive',
    addMediaDescription: 'Добавить медиафайлы',
    settingsDescription: 'Открыть настройки',
    lockDescription: 'Заблокировать Overdrive',
    checkUpdatesDescription: 'Проверить обновления Overdrive',
    exitDescription: 'Выйти из Overdrive',
  },
  de: {
    show: 'Overdrive anzeigen',
    hide: 'Overdrive ausblenden',
    addMedia: 'Medien hinzufügen',
    settings: 'Einstellungen',
    lock: 'Sperren',
    checkUpdates: 'Nach Updates suchen',
    exit: 'Beenden',
    quit: 'Beenden',
    showDescription: 'Overdrive-Fenster anzeigen',
    hideDescription: 'Overdrive-Fenster ausblenden',
    addMediaDescription: 'Mediendateien hinzufügen',
    settingsDescription: 'Einstellungen öffnen',
    lockDescription: 'Overdrive sperren',
    checkUpdatesDescription: 'Nach Overdrive-Updates suchen',
    exitDescription: 'Overdrive beenden',
  },
  es: {
    show: 'Mostrar Overdrive',
    hide: 'Ocultar Overdrive',
    addMedia: 'Añadir medios',
    settings: 'Ajustes',
    lock: 'Bloquear',
    checkUpdates: 'Buscar actualizaciones',
    exit: 'Salir',
    quit: 'Salir',
    showDescription: 'Mostrar la ventana de Overdrive',
    hideDescription: 'Ocultar la ventana de Overdrive',
    addMediaDescription: 'Añadir archivos multimedia',
    settingsDescription: 'Abrir ajustes',
    lockDescription: 'Bloquear Overdrive',
    checkUpdatesDescription: 'Buscar actualizaciones de Overdrive',
    exitDescription: 'Salir de Overdrive',
  },
  fr: {
    show: 'Afficher Overdrive',
    hide: 'Masquer Overdrive',
    addMedia: 'Ajouter des médias',
    settings: 'Réglages',
    lock: 'Verrouiller',
    checkUpdates: 'Rechercher des mises à jour',
    exit: 'Quitter',
    quit: 'Quitter',
    showDescription: 'Afficher la fenêtre Overdrive',
    hideDescription: 'Masquer la fenêtre Overdrive',
    addMediaDescription: 'Ajouter des fichiers multimédias',
    settingsDescription: 'Ouvrir les réglages',
    lockDescription: 'Verrouiller Overdrive',
    checkUpdatesDescription: 'Rechercher des mises à jour d’Overdrive',
    exitDescription: 'Quitter Overdrive',
  },
  ja: {
    show: 'Overdriveを表示',
    hide: 'Overdriveを隠す',
    addMedia: 'メディアを追加',
    settings: '設定',
    lock: 'ロック',
    checkUpdates: 'アップデートを確認',
    exit: '終了',
    quit: '終了',
    showDescription: 'Overdriveウィンドウを表示',
    hideDescription: 'Overdriveウィンドウを隠す',
    addMediaDescription: 'メディアファイルを追加',
    settingsDescription: '設定を開く',
    lockDescription: 'Overdriveをロック',
    checkUpdatesDescription: 'Overdriveのアップデートを確認',
    exitDescription: 'Overdriveを終了',
  },
  pt: {
    show: 'Mostrar Overdrive',
    hide: 'Ocultar Overdrive',
    addMedia: 'Adicionar mídia',
    settings: 'Configurações',
    lock: 'Bloquear',
    checkUpdates: 'Verificar atualizações',
    exit: 'Sair',
    quit: 'Sair',
    showDescription: 'Mostrar a janela do Overdrive',
    hideDescription: 'Ocultar a janela do Overdrive',
    addMediaDescription: 'Adicionar arquivos de mídia',
    settingsDescription: 'Abrir configurações',
    lockDescription: 'Bloquear o Overdrive',
    checkUpdatesDescription: 'Verificar atualizações do Overdrive',
    exitDescription: 'Sair do Overdrive',
  },
  cn: {
    show: '显示 Overdrive',
    hide: '隐藏 Overdrive',
    addMedia: '添加媒体',
    settings: '设置',
    lock: '锁定',
    checkUpdates: '检查更新',
    exit: '退出',
    quit: '退出',
    showDescription: '显示 Overdrive 窗口',
    hideDescription: '隐藏 Overdrive 窗口',
    addMediaDescription: '添加媒体文件',
    settingsDescription: '打开设置',
    lockDescription: '锁定 Overdrive',
    checkUpdatesDescription: '检查 Overdrive 更新',
    exitDescription: '退出 Overdrive',
  },
}

export function normalizeTrayMenuLocale(value: unknown): TrayMenuLocale {
  const code = String(value || 'en').trim().toLowerCase()
  if ((TRAY_MENU_LOCALES as readonly string[]).includes(code)) {
    return code as TrayMenuLocale
  }
  return 'en'
}

export function getTrayMenuLabels(locale: unknown): TrayMenuLabels {
  return STRINGS[normalizeTrayMenuLocale(locale)]
}
