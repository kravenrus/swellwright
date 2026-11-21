/** Навигация: разделы и страницы по их id (apps/web/src/nav.ts). Страницы, которых ещё нет, тоже в списке. */
export const nav = {
  overview: 'Обзор',

  fleet: 'Парк',
  servers: 'Серверы',
  nodes: 'Ноды',
  chains: 'Цепочки',
  dns: 'DNS',
  certificates: 'Сертификаты',

  operations: 'Операции',
  runs: 'Запуски',
  scripts: 'Скрипты',
  scenarios: 'Сценарии',
  schedules: 'Расписания',

  monitoring: 'Мониторинг',
  probes: 'Зонды',
  alerts: 'Оповещения',
  reports: 'Отчёты',

  panel: 'Панель',
  profiles: 'Профили',
  apiConsole: 'Консоль API',

  security: 'Безопасность',
  vault: 'Хранилище секретов',
  users: 'Пользователи',
  roles: 'Роли',
  sessions: 'Сессии',
  tokens: 'Токены',
  audit: 'Аудит',

  settings: 'Настройки',
  plugins: 'Плагины',
} as const;
