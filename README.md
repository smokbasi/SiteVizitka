# AI MS Tools

Личная панель веб-инструментов на Vercel.

## Структура

| URL | Описание |
|-----|----------|
| `/` | Панель инструментов (dashboard) |
| `/vizitka` | Сайт-визитка — производство ВСПОМНИ и DoubleMark |
| `/tools/planogram` | Планировщик склада — редактор планограммы мезонинов |

Исходник планировщика также хранится в `docs/planogramma-mezonin.html` (история/редактирование).

## Запуск локально

```bash
npx serve .
```

Откройте http://localhost:3000

## Деплой на Vercel

```bash
npx vercel --prod
```

Проект — статический HTML без сборки. Корень репозитория = корень сайта.

## Визитка — контакты

В `vizitka/config.js`:

```js
const TELEGRAM_USERNAME = "Basifilder";
const PHONE_DISPLAY = "8 952 245-30-31";
const PHONE_TEL = "+79522453031";
```
