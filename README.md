# CNC Copilot — Допуски FULL

Офлайн PWA для iPhone/Android/desktop: допуски и посадки, обратный поиск поля допуска, метрическая резьба, шероховатость, твёрдость, мм↔дюйм, быстрый расчёт S/F и локальные проекты.

## Что внутри

- iPhone-first Liquid Glass интерфейс без общего горизонтального скролла.
- Вал/отверстие: базовые расчёты ISO 286 для наиболее употребимых полей H/h/G/g/F/f/E/e/D/d/JS.
- Минимальный, максимальный и целевой размер по середине поля допуска.
- Посадки отверстие/вал: минимальный и максимальный зазор/натяг, классификация посадки.
- Обратный поиск поля допуска по номиналу и двум отклонениям.
- Метрические резьбы M1…M150: распространённые крупные и мелкие шаги, базовая геометрия и ориентировочное сверло под метчик.
- Шероховатость точения: теоретическая оценка Ra и ориентировочные Rz/Rt.
- Конвертер HRC/HB/HV и оценка Rm для сталей.
- Быстрый расчёт S и F.
- Локальные проекты, импорт/экспорт JSON.
- Полная работа офлайн после первого открытия.
- Светлая, тёмная и системная темы.
- Новый расчёт всегда очищает расчётные поля и результаты.
- Нижний Dock скрывается при прокрутке вниз и возвращается вверх.

## GitHub Pages

1. Создайте пустой репозиторий.
2. Скопируйте все файлы из этой папки в корень репозитория.
3. Push в ветку `main`.
4. В GitHub: **Settings → Pages → Source: GitHub Actions**.
5. Workflow `.github/workflows/pages.yml` опубликует приложение.

Для iPhone: открыть опубликованную страницу в Safari → **Поделиться → На экран «Домой»**.

## Важно по расчётам

Калькулятор предназначен для цеховых предварительных расчётов. Поля ISO 286 реализованы через стандартную единицу допуска и базовые формулы фундаментальных отклонений для поддерживаемых полей. Для особо ответственных размеров, приёмочного контроля, сертификации и специальных посадок сверяйте результат с действующей КД и нормативной таблицей предприятия.


## v1.0.2
- Верхняя системная зона Safari/PWA синхронизируется с выбранной темой через динамический `theme-color`.
- `black-translucent` сохранён для установленной PWA; safe-area остаётся внутри blur-шапки.
- Версия в профиле синхронизирована: v1.0.2.


## v1.0.3
- Нижний Dock отвязан от высоты `.app-shell` и закреплён к реальному viewport через `position: fixed`.
- Учитывается `env(safe-area-inset-bottom)` для Home Indicator, поэтому Dock не плавает и не перекрывает нижние карточки.
- Скролл получил точный нижний резерв под Dock, без большого пустого хвоста.
- Добавлена калибровка макета под iPhone 14 Pro 393×852 pt; геометрия Dynamic Island не хардкодится, используется safe-area iOS.
- Новая светлая цветная иконка CNC Copilot: станок в центре, фреза, токарный инструмент, штангенциркуль и оснастка по краям.
- Иконки подготовлены 180/192/512/1024 px, добавлен favicon и maskable entry в manifest.

## v1.0.8
- Нижний Dock зафиксирован как плавающая капсула в стиле GetContact.
- Нижний отступ: ровно 2 CSS px.
- Высота Dock: ровно 72 px.
- Все четыре угла скруглены радиусом 26 px.
- `safe-area-inset-bottom` не участвует в `bottom`, `height` или `padding` самого Dock.
- Верхняя шапка и зона Dynamic Island не изменялись.


## v1.1.0 — iPhone 14 Pro calibrated profile
- Standalone profile: 393×852, DPR 3.
- Top bar: inset 0, base 75px, horizontal padding 13px, bottom padding 0, radius 34px, border 1px.
- Dock: bottom 2px, width 87%, height 68px, border 1px.
- Numeric inputs keep editing caret after the existing value on focus.
- Dock diagnostics removed from the release build.


## v1.1.1 standalone top fix
- iPhone 14 Pro standalone top geometry no longer reads `env(safe-area-inset-top)` for sizing.
- Fixed calibrated signature: safe top 59px + bar 75px = 134px total; content scroller starts at 146px.
- Dock unchanged: 2px / 87% / 68px / 1px.

## v1.1.2 — Safari toolbar isolation
- Dock перенесён внутрь `.app-shell`, как в проверенной сборке CNC Geometry v1.0.9.
- `.app-shell` привязан к large/layout viewport (`100lvh`), а не к меняющемуся visual viewport Safari.
- Dock теперь `position:absolute` внутри стабильной оболочки и не поднимается вслед за появлением/скрытием панели Safari.
- `safe-area-inset-bottom` по-прежнему не участвует в `bottom`, `height` или `padding` Dock.
- Для iPhone 14 Pro сохранена геометрия Dock: bottom 2px, width 87%, height 68px.
- Обновлён cache key/service worker, чтобы iPhone не оставался на старом CSS.
