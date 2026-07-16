import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../css/portfolio.css", import.meta.url), "utf8");

function relativeLuminance(hex) {
  const channels = hex
    .match(/[0-9a-f]{2}/gi)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
  const luminances = [relativeLuminance(first), relativeLuminance(second)].sort(
    (left, right) => right - left,
  );
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

const agreedCopy = [
  "Сначала процесс на производстве — потом код.",
  "Делаю инструменты для учёта, маркировки и управления производством: там, где люди до сих пор сводят данные вручную.",
  "Я 4,5 года руковожу производством в FMCG: косметика, уход за полостью рта, парфюмерия. В разработку пришёл из собственных задач на площадке: данные по остаткам, выпуску, себестоимости и премиям приходилось собирать из разных источников, чтобы получить общую картину и принять решение.",
  "Три года пишу инструменты для производства и заказчиков: ботов, веб-дашборды, десктопные и серверные сервисы. Обычно задача выглядит так: данные о выпуске появляются в цехе, попадают в ERP и локальную базу, а руководитель видит выработку, остатки и отклонения без ручных сводок.",
  "Сейчас развиваю производственную автоматизацию, цифровую маркировку и сервисы для подбора персонала.",
  "Беру проекты в разработку. Если у вас есть процесс, который съедает время команды, — напишите, разберёмся, что в нём можно автоматизировать.",
  "Сначала смотрю на процесс",
  "Разбираюсь, как операция проходит сейчас: от склада и цеха до отчёта и решения руководителя. Часто проблема не в отсутствии интерфейса, а в повторном вводе данных, разрывах между системами и ручной аналитике: руководитель собирает цифры из нескольких источников, сводит их и только потом может принять решение.",
  "Собираю первую рабочую версию на реальных сценариях",
  "Не рисую абстрактный MVP. Подключаю ERP, таблицы и внешние API, чтобы проверить решение на тех данных, с которыми команда работает каждый день.",
  "Внедряю постепенно",
  "Сначала базовый учёт, затем автоматические операции и аналитика. Для критичных действий добавляю подтверждения и логи.",
  "Довожу до рабочего окружения",
  "Разворачиваю сервис на VPS: Docker или systemd, nginx, TLS, мониторинг и резервное копирование данных.",
  "Дорабатываю после запуска",
  "Слушаю операторов и руководителей. Если учёт нестабилен или интерфейс мешает работать, новые функции не имеют смысла.",
  "Python и .NET · React и TypeScript · PostgreSQL, SQLite, Redis · Telegram, МойСклад, Google Sheets, CRPT · Docker, nginx, VPS, CI/CD",
  "Чем работаю на проектах",
];

test("portfolio contains the agreed copy and sections", () => {
  for (const text of agreedCopy) {
    assert.ok(html.includes(text), `Missing agreed copy: ${text}`);
  }

  assert.match(html, /<section[^>]+id="workflow"/);
  assert.match(html, /<section[^>]+id="stack"/);
  assert.match(html, /<details[\s>]/);
  assert.match(html, /<summary>Чем работаю на проектах<\/summary>/);
});

test("portfolio contains real contact details", () => {
  assert.ok(html.includes('href="mailto:smokbasi@gmail.com"'));
  assert.ok(html.includes(">smokbasi@gmail.com</a>"));
  assert.ok(html.includes('href="https://t.me/Basifilder"'));
  assert.ok(html.includes('href="tel:+79522453031"'));
  assert.ok(html.includes('href="https://github.com/smokbasi"'));
  assert.ok(!html.includes("your@email.ru"));
});

test("burst canvas, initialization and four statistics remain intact", () => {
  const protectedFragments = [
    '<canvas class="hero-burst__canvas" id="burst-canvas" aria-hidden="true"></canvas>',
    "var stage = canvas && canvas.closest('.hero-burst__stage');",
    "new BurstNetwork(canvas, {",
    "interactionTarget: stage,",
    "lineCount: 240,",
    "lineWidth: 1.25,",
    "interactionRadius: 360,",
    "interactionStrength: 0.78,",
    "spring: 0.065,",
    "damping: 0.88,",
  ];

  for (const fragment of protectedFragments) {
    assert.ok(html.includes(fragment), `Missing protected burst fragment: ${fragment}`);
  }

  assert.equal((html.match(/<div class="stats__item">/g) ?? []).length, 4);
  assert.ok(html.indexOf("hero-burst__stage") < html.indexOf('class="stats"'));

  for (const value of ["4.5+", "3+", ">6<", ">ERP<"]) {
    assert.ok(html.includes(value), `Missing statistic: ${value}`);
  }
});

test("primary buttons meet WCAG AA contrast in default and hover states", () => {
  const accent = css.match(/--accent:\s*(#[0-9a-f]{6})/i)?.[1];
  const accentHover = css.match(/--accent-hover:\s*(#[0-9a-f]{6})/i)?.[1];
  const primaryBlock = css.match(/\.btn--primary\s*\{([^}]+)\}/)?.[1] ?? "";
  const foreground = primaryBlock.match(/color:\s*(#[0-9a-f]{3,6})/i)?.[1];

  assert.ok(accent && accentHover && foreground, "Primary button colors must be explicit");
  assert.ok(contrastRatio(accent, foreground) >= 4.5);
  assert.ok(contrastRatio(accentHover, foreground) >= 4.5);
});

test("burst hero is brighter while retaining a protected text zone", () => {
  const canvasBlock = css.match(/\.hero-burst__canvas\s*\{([^}]+)\}/)?.[1] ?? "";
  const overlayBlock = css.match(/\.hero-burst__stage::after\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.match(canvasBlock, /filter:\s*brightness\(1\.16\)\s+saturate\(1\.12\)/);
  assert.match(overlayBlock, /rgba\(15, 17, 23, 0\.88\)/);
  assert.match(overlayBlock, /rgba\(15, 17, 23, 0\.68\)/);
});
