# Форк t3code: провайдер Antigravity (`agy`)

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

## Деплой на сервер (без публикации в npm)

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

## Обновление на новую версию апстрима

История устроена так: коммит `vendor: t3code upstream snapshot …` = чистые
исходники апстрима, фичевые коммиты — поверх. Remote `upstream` уже добавлен.

Вариант А (если качаете релизы zip-ом):

```bash
git checkout -b vendor-update
# распаковать новый снапшот апстрима ПОВЕРХ рабочего дерева (заменой файлов)
git add -A && git commit -m "vendor: t3code upstream snapshot vX.Y.Z"
git checkout main && git rebase vendor-update   # фичевые коммиты перенакатятся
```

Вариант Б (через git):

```bash
git fetch upstream
git rebase --onto upstream/main <vendor-commit> main
```

Конфликты возможны только в двух изменённых файлах выше; правки трёхстрочные —
разрешаются за минуту.

## Известные ограничения v1

- Один тёрн за раз на тред (agy headless — one-shot процессы; steering не поддержан).
- Инструментальная активность агента (шаги tool-вызовов) не отображается в UI —
  виден только текст ответа и итог. (step_type у agy для тулов пока не размечен.)
- Интерактивные approvals невозможны: по умолчанию `--dangerously-skip-permissions`
  (настройка `skipPermissions` в конфиге инстанса); при выключении CLI сам
  soft-дениает опасные вызовы.
- ВАЖНО: `agy` зависает, пока открыт stdin-пайп — все спауны идут со `stdin: "ignore"`.
