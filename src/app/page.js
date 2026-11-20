"use client";

import { useEffect } from "react";

export default function Page() {
  useEffect(() => {
    let dispose = () => {};
    let dead = false;
    import("../lib/map").then((mod) => {
      if (dead) return;
      dispose = mod.start();
    });
    return () => {
      dead = true;
      dispose();
    };
  }, []);

  return (
    <>
      <canvas id="view" />
      <header>
        <div>
          <p className="eyebrow">Heritavia</p>
          <h1>Приходы</h1>
          <p className="lead">
            Крутите макет. Булавка — храм или архив. В карточке — снимок, если Wikimedia лежит рядом,
            кладбища OSM и смена губернии, уезда, повета, района, сельсовета. Слой кладбищ включается отдельно.
          </p>
        </div>
        <p id="counts" className="counts" />
      </header>
      <aside id="panel">
        <input id="q" type="search" placeholder="Храм, деревня, повет, район" autoComplete="off" />
        <div id="kinds" className="kinds" />
        <p id="list-meta" className="meta" />
        <div id="list" />
      </aside>
      <article id="card" hidden />
      <div className="hud">
        <label>
          Рельеф <input id="exag" type="range" min="40" max="420" defaultValue="80" />
        </label>
        <button type="button" id="reset">Весь макет</button>
      </div>
      <footer>
        Ссылка на приход — <a href="https://shappoff.github.io/prikhody" target="_blank" rel="noreferrer">карта Сергея Шаппо</a>.
        Сельсовет на 2019 год — справочник населённых пунктов. Волость и гмина в этих списках не размечены.
        Фото — <a href="https://commons.wikimedia.org/" target="_blank" rel="noreferrer">Wikimedia Commons</a>, лицензия у файла.
        Кладбища — © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">участники OpenStreetMap</a>, ODbL.
        Граница — geoBoundaries. Рельеф — Mapzen Terrain Tiles.
      </footer>
      <div id="loading">Собираю макет…</div>
    </>
  );
}
