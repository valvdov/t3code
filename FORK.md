# Форк t3code: провайдер Antigravity (`agy`)

Канал: **nightly** — форк живёт поверх `upstream/main`, откуда собираются
nightly-релизы. Ребейз на свежий upstream проходит без конфликтов
(проверено на 30c96228).

Этот репозиторий — форк [pingdotgg/t3code](https://github.com/pingdotgg/t3code) с одной фичей:
нативный провайдер **Antigravity** (driver kind `agy`), оборачивающий официальный
Google Antigravity CLI в headless-режиме (`agy -p … --output-format stream-json`).

## Что добавлено (весь дифф фичи)

Новые файлы (конфликтов с апстримом не создают):

- `packages/contracts/src/agySettings.ts` — схема настроек (общая для сервера и web-UI)
- `apps/server/src/provider/Drivers/AgySettings.ts` — реэкспорт-шим
- `apps/server/src/provider/Drivers/AgyDriver.ts` — драйвер
- `apps/server/src/provider/Layers/AgyProvider.ts` — probe (`agy --version`, `agy models`)
- `apps/server/src/provider/Layers/AgyAdapter.ts` — адаптер чата (процесс на тёрн, resume через `--conversation`, контекст-метр)
- `apps/server/src/textGeneration/AgyTextGeneration.ts` — заголовки тредов / commit messages через `agy --json-schema`

Изменённые файлы апстрима (минимальная поверхность для rebase; все правки помечены комментарием `Fork-added (see FORK.md)`):

- `packages/contracts/src/index.ts` — +2 строки (экспорт agySettings)
- `apps/server/src/provider/builtInDrivers.ts` — +3 строки (регистрация драйвера)
- `apps/server/src/provider/Layers/ProviderInstanceRegistryHydration.ts` — +7 строк
  (бутстрап дефолтного инстанса для драйверов без legacy-зеркала в `settings.providers`)
- `apps/server/src/provider/Layers/ProviderRegistry.test.ts` — +2 строки ("agy" в ожидаемом списке инстансов)
- `apps/web/src/components/settings/providerDriverMeta.ts` — запись Antigravity (карточка в Settings → Providers, бейдж «Fork», официальная иконка из апстримного Icons.tsx)
- `apps/web/src/components/settings/SettingsPanels.tsx` — безопасный fallback для драйверов без legacy-конфига
- `apps/web/src/components/chat/providerIconUtils.ts` — иконка в model picker/composer
- `apps/web/src/session-logic.ts` — запись в PROVIDER_OPTIONS (сайдбар пикера)

## Лимиты аккаунтов в карточках провайдеров

Апстрим уже возит событие `account.rate-limits.updated` с непрозрачным
payload'ом, но нигде его не показывает. Форк нормализует два вендорных формата
и выводит их строкой в Settings → Providers (и в мобилке — снапшот
server-driven):

| Провайдер             | Что отдаёт                                                                 |
| --------------------- | -------------------------------------------------------------------------- |
| Codex                 | план, окна (7d/5h) с процентом и временем сброса, баланс кредитов          |
| Claude                | окно (5h/7d), состояние (ok/warning/exhausted), время сброса; процента нет |
| Antigravity, OpenCode | ничего — квоты наружу не отдаются                                          |

Данные приходят **только во время работы сессий**, поэтому последнее показание
хранится в `<baseDir>/caches/rate-limits.json` и переживает рестарты; в строке
показывается, когда оно получено. Окна мержатся по метке: Claude присылает по
одному окну на событие, и полная замена заставляла бы их мигать.

Где видно:

- **в композере** — блок «Plan usage limits» в поповере контекстного окна
  (кольцо рядом с кнопкой отправки), как в референсных клиентах: строка на
  окно с обратным отсчётом до сброса, процентом и полосой;
- **в Settings → Providers** — компактная строка в карточке провайдера.

Файлы: `packages/contracts/src/providerRateLimits.ts` (контракт),
`apps/server/src/provider/providerRateLimits.ts` (нормализаторы + тесты),
`apps/server/src/provider/providerRateLimitStore.ts` (хранилище),
`apps/web/src/components/chat/ProviderPlanUsageLimits.tsx` (поповер),
`apps/web/src/components/settings/ProviderRateLimitsRow.tsx` (карточка). Врезки
в апстрим — по одной строке в `ProviderService.ts` (сбор события), две в
`ProviderRegistry.ts` (наложение на снапшоты) и по паре в `ChatComposer.tsx` /
`ContextWindowMeter.tsx` (проброс в поповер).

## Требования

- Node.js 22.16+ / 24.10+
- Antigravity CLI `agy` в PATH, авторизованный один раз интерактивно (`agy`)
  — headless-режим использует кешированные креды.

## Запуск

```bash
pnpm install
pnpm --filter t3 build:bundle       # собрать сервер
node apps/server/dist/bin.mjs       # = команда `t3`
# или dev: node scripts/dev-runner.ts dev (нужен vp: PATH=$PWD/node_modules/.bin:$PATH)
```

Инстанс `agy` бутстрапится автоматически, но **по умолчанию выключен** (как
Cursor в апстриме) — включите тумблером в Settings → Providers → Antigravity;
выбор сохраняется в `providerInstances` в settings.json. Модели обнаруживаются
из `agy models`; дефолт — gemini-3.1-pro-high.

Контекст-метр работает: после каждого тёрна адаптер сообщает
занятость контекста (окна: gemini 1M, claude 200k, gpt-oss 128k) и суммарно
обработанные токены. Квоты/rate-limits Antigravity CLI наружу не отдаёт —
их в UI показать нечем; при исчерпании квоты тёрн завершится ошибкой с
текстом CLI.
Официальные web/mobile клиенты показывают его без модификаций — список
провайдеров полностью server-driven.

## Сервер собирает форк сам (основной путь)

На сервере `10.0.0.140` живёт самодостаточный пайплайн — ноутбук для обновления
больше не нужен:

| Что                      | Где                                                                              |
| ------------------------ | -------------------------------------------------------------------------------- |
| Клон апстрима            | `/opt/t3code-fork` (remote `origin` = pingdotgg/t3code)                          |
| Патчи форка              | `/opt/t3code-fork-patches/*.patch` (НЕ `repo/patches` — там pnpm-патчи апстрима) |
| Публичный конфиг Connect | `/opt/t3code-fork/.env`                                                          |
| Скрипт обновления        | `/opt/t3code-fork/update-t3code.sh`                                              |
| Node для сборки          | `/opt/node24` (системный Node 22 собран без поддержки TS)                        |

`update-t3code.sh` делает: fetch upstream → сброс на `origin/main` (=nightly) →
`git am` патчей форка → **штамп версии** → `pnpm install` → сборка →
`pack-fork.mjs` → `npm i -g` → рестарт `t3code-dev1`/`t3code-dev2`. Полный
прогон ≈ 40 секунд при тёплом кеше.

Версия ставится **ровно та же, что у текущего официального nightly** (без
собственного суффикса) и в двух местах сразу, обязательно ДО сборки:

- `apps/server/package.json` — оттуда `ServerEnvironment` вшивает `serverVersion`;
- переменная окружения `APP_VERSION` — оттуда версию берёт веб-клиент
  (иначе он подставит версию `apps/web/package.json`, то есть upstream'овскую
  `0.0.31`, и браузер пожалуется на рассинхрон с собственным сервером).

Клиенты сверяют строки на точное равенство, поэтому любой свой суффикс даёт
вечное предупреждение «Version drift».
Происхождение сборки (upstream sha, число патчей, время) пишется в
`/opt/t3code-fork/.last-build.json` и показывается в боте по кнопке «Версии». Любая ошибка до шага install оставляет работающую установку нетронутой;
конфликт патчей о себе явно сообщает. Есть `--dry-run` (собрать, не ставить).

Запускается либо руками по ssh, либо кнопкой в Telegram-боте (см. ниже).

### После изменений в форке

Перегенерировать патчи и залить на сервер:

```bash
git format-patch upstream/main..main -o /tmp/patches
scp /tmp/patches/*.patch root@10.0.0.140:/opt/t3code-fork-patches/
ssh root@10.0.0.140 'rm -f /opt/t3code-fork-patches/<старые>.patch'   # если менялась нумерация
```

### Харнессы на сервере

Все харнессы с npm-пакетами установлены глобально через npm — так их обновляет
одна команда сразу для обоих пользователей, и в самом T3 работает кнопка
«Update now»:

| Харнесс     | Пакет                       | Обновление                                  |
| ----------- | --------------------------- | ------------------------------------------- |
| Codex       | `@openai/codex`             | `npm i -g @openai/codex@latest`             |
| Claude      | `@anthropic-ai/claude-code` | `npm i -g @anthropic-ai/claude-code@latest` |
| OpenCode    | `opencode-ai`               | `npm i -g opencode-ai@latest`               |
| Antigravity | — (нет пакета)              | `agy update` (самообновление на месте)      |

На desktop/Linux Codex, установленный официальным standalone-скриптом в
`~/.local/bin/codex`, обновляется той же кнопкой **Update now**, но через
официальный unattended installer:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh
```

Установки Codex из npm/pnpm/bun/Homebrew продолжают обновляться своим пакетным
менеджером; standalone-команда выбирается только для `~/.local/bin/codex`.

### Arch desktop package

Форк собирает нативный x86_64 пакет для Arch тем же desktop-builder, что и
официальные AppImage/DMG/NSIS артефакты:

```bash
APP_VERSION=<nightly-version> \
T3CODE_DESKTOP_UPDATE_REPOSITORY=valvdov/t3code \
vp run dist:desktop:pacman -- --build-version <nightly-version>
```

Результат создаётся в `release/` как pacman-артефакт с package name
`t3-code-nightly`. Внутри остаются bundled server, desktop entry, иконки,
обработчики `t3code://`/`t3code-dev://`, T3 Connect public config и файл
`resources/package-type=pacman` для встроенного `electron-updater`.

### GitHub nightly для Arch

`.github/workflows/fork-arch-nightly.yml` запускается ежедневно и вручную на
бесплатном public Ubuntu runner. Он ребейзит коммиты форка поверх свежего
`pingdotgg/t3code` `main`, прогоняет точечные проверки, собирает нативный Arch
пакет и публикует его вместе с `nightly-linux.yml` в prerelease. Конфликт или
ошибка проверки останавливают workflow до push/release. Хранятся пять последних
nightly-релизов.

Перед первым запуском в GitHub Repository variables нужно добавить публичные
значения:

- `T3CODE_RELAY_URL`
- `T3CODE_CLERK_PUBLISHABLE_KEY`
- `T3CODE_CLERK_CLI_OAUTH_CLIENT_ID`

Голые бинарники codex/claude, лежавшие в `/usr/local/bin`, переехали в
`*.pre-npm.bak` — их собственные self-update на общем сервере не работали
(codex не определял способ установки; claude ставил новую версию в домашний
каталог того, кто запустил, не трогая общий бинарь).

### Telegram-бот управления

`@t3codeTokenBot`, сервис `t3code-tokenbot` (root, `/opt/t3code-tokenbot/bot.mjs`,
конфиг `/etc/t3code-tokenbot.env`). Кнопки: токены входа для доступных
пользователей, обновление харнессов (командами из таблицы выше),
пересборка T3 Code, версии. Обновления видны
только администратору (в ACL есть `dev1` либо `"admin": true`), остальным кнопки
не показываются и их callback'и отклоняются. Одновременно выполняется не больше
одной длительной операции.

## Ручной деплой с ноутбука (запасной путь)

Артефакт — обычный npm-тарболл, собранный из форка:

```bash
cd apps/server && PATH="$PWD/../../node_modules/.bin:$PATH" pnpm exec vp run build && cd ../..
node scripts/pack-fork.mjs --version 0.0.31-agy.1   # → apps/server/t3-<версия>.tgz
scp apps/server/t3-0.0.31-agy.1.tgz server:/tmp/
ssh server 'npm i -g /tmp/t3-0.0.31-agy.1.tgz && t3 --version'
```

`npm i -g` замещает официальный глобальный `t3` тем же бинарём с нашим
драйвером; state (`~/.t3`) не трогается. Если сервер запускался как
`npx t3@latest` — замените команду запуска на просто `t3` (npx каждый раз
тянет официальный пакет из npm и затирал бы форк).

## T3 Connect в собственных сборках

Официальные сборки вшивают публичную конфигурацию облака при публикации; без
неё CLI пишет «T3 Connect is unavailable in builds without public
configuration». В корне репо лежит `.env` (гитигнорен) с этими публичными
значениями (relay URL + Clerk publishable key + OAuth client id, извлечены из
официального t3@0.0.31) — `vp run build` подхватывает его автоматически, и
тарболлы форка получают Connect из коробки. При пересоздании репо файл нужно
восстановить (значения продублированы в memory/FORK-заметках). Альтернатива
без пересборки — runtime-переменные `T3CODE_RELAY_URL`,
`T3CODE_CLERK_PUBLISHABLE_KEY`, `T3CODE_CLERK_CLI_OAUTH_CLIENT_ID`.

## Обновление на новую версию апстрима

Ветка `main` сидит прямо поверх `upstream/main` — пять фичевых коммитов и всё.
Обновление на свежий upstream (он же nightly):

```bash
git fetch upstream main
git rebase upstream/main            # фичевые коммиты перенакатятся
pnpm install --ignore-scripts && (cd apps/server && pnpm exec tsgo --noEmit)
```

Конфликты возможны только в восьми изменённых файлах выше; правки короткие и
помечены комментарием `Fork-added` — разрешаются за минуту. После ребейза
перегенерировать патчи для сервера (см. раздел выше).

Историческая справка: изначально базой был отдельный коммит
`vendor: t3code upstream snapshot v0.0.31` (репо скачивали zip-ом). После
перехода на nightly он вырезан ребейзом; резервная ветка — `backup-0.0.31`.

## Известные ограничения v1

- Один тёрн за раз на тред (agy headless — one-shot процессы; steering не поддержан).
- Инструментальная активность агента (шаги tool-вызовов) не отображается в UI —
  виден только текст ответа и итог. (step_type у agy для тулов пока не размечен.)
- Интерактивные approvals невозможны: по умолчанию `--dangerously-skip-permissions`
  (настройка `skipPermissions` в конфиге инстанса); при выключении CLI сам
  soft-дениает опасные вызовы.
- ВАЖНО: `agy` зависает, пока открыт stdin-пайп — все спауны идут со `stdin: "ignore"`.
