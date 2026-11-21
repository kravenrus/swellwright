/** Оболочка консоли: кнопки шапки, сведения о сборке и страницы, которые не являются страницами. */
export const shell = {
  versionLabel: 'Версия и сведения о сборке',
  githubLabel: 'Swellwright на GitHub',
  docsLabel: 'Документация Swellwright',
  openMenu: 'Открыть меню',
  closeMenu: 'Закрыть меню',
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
    title: 'Здесь ничего нет',
    text: 'Страница, которую вы пытаетесь открыть, не существует. Возможно, вы ошиблись в адресе или страница ещё не готова.',
    action: 'Вернуться на главную',
  },
  connection: {
    lost: 'Соединение потеряно',
    reconnecting: 'Переподключение...',
  },
  serverError: {
    title: 'Случилось что-то плохое...',
    refresh: 'Обновить страницу',
    details: 'Технические сведения об ошибке',
  },
  forbidden: {
    title: 'Недоступно для вашей роли',
    text: 'Вы вошли, но ваша роль не открывает эту страницу.',
  },
} as const;
