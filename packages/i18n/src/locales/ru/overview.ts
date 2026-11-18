/** Страница «Обзор» (apps/web/src/overview.tsx). */
export const overview = {
  title: 'Обзор',
  description: 'Состояние парка, запуски и согласования с первого взгляда',

  stats: {
    api: 'API',
    alive: 'Работает',
    dependencies: 'Зависимости',
    ready: 'Готов',
    notReady: 'Не готов',
    version: 'Версия',
    dependenciesSummary: 'работает {{up}} из {{total}}',
  },

  checks: {
    title: 'Проверки зависимостей',
    apiDescription: 'Описание API',
    noneTitle: 'Пока нечего проверять',
    none: 'Зависимости пока не настроены. Задайте SW_DATABASE_URL и SW_VALKEY_URL, чтобы они проверялись здесь.',
    up: 'Работает',
    down: 'Не работает',
    latencyValue: '{{ms}} мс',
  },

  error: {
    unreachableTitle: 'API не отвечает',
    unreachableText:
      'Запустите API (pnpm --filter @swellwright/api start) или проверьте обратный прокси-сервер, затем повторите.',
    unexpectedTitle: 'API ответил неожиданно',
    unexpectedText:
      'Ответ не соответствует контракту API. Скорее всего, API и консоль из разных версий.',
  },
} as const;
