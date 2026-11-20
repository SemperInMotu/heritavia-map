# map.heritavia.com

Статический Next.js-сайт: тот же 3D-макет приходов, что в `Ancestria/maps/hramy`. Сборка `output: 'export'` уходит на GitHub Pages, домен `map.heritavia.com`.

## Локально

```powershell
npm install
npm run dev
```

http://127.0.0.1:3000

## Домен

В DNS зоны `heritavia.com`:

```
map  CNAME  semperinmotu.github.io
```

Файл `public/CNAME` уже содержит `map.heritavia.com`. После пуша в `main` workflow публикует каталог `out`. В репозитории Pages должен быть источник GitHub Actions.

Проверка HTTPS появляется после того, как GitHub видит CNAME. Пока DNS не переключён, сайт открывается на `https://semperinmotu.github.io/heritavia-map/`. Для этого адреса базовый путь другой, поэтому рабочий адрес после DNS — только `https://map.heritavia.com`.

## Данные

`public/data/land.json` и `public/data/places.json` копируются из макета Ancestria. Описи дел Шаппо сюда не входят.
