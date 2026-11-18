/** Оболочка консоли: кнопки шапки, сведения о сборке и страницы, которые не являются страницами. */
export const shell = {
  versionLabel: 'Версия и сведения о сборке',
  githubLabel: 'Swellwright на GitHub',
  openMenu: 'Открыть меню',
  buildInfo: {
    title: 'Сведения о сборке',
    updateTitle: 'Есть обновление',
    updateText: 'Вышла новая версия',
    releaseNotes: 'Что нового',
    version: 'Версия',
    branch: 'Ветка',
    buildTime: 'Время сборки',
    build: 'Сборка',
    commit: 'Коммит',
    copy: 'Скопировать сведения о сборке',
    copied: 'Скопировано',
    viewCommit: 'Открыть коммит на GitHub',
    unknown: 'неизвестно',
    repository: 'Репозиторий на GitHub',
    unavailable: 'Сервер не ответил.',
  },
  notFound: {
    title: 'Страница не найдена',
    text: 'По этому адресу страницы нет. Возможно, она переехала или ещё не готова.',
    action: 'Перейти к обзору',
  },
  forbidden: {
    title: 'Недоступно для вашей роли',
    text: 'Вы вошли, но ваша роль не открывает эту страницу.',
  },
} as const;
