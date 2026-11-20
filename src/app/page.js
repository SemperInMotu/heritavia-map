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
      <div id="flatmap" />
      <header>
        <div>
          <p className="eyebrow">Heritavia</p>
          <h1>Приходы</h1>
          <p className="lead">
            Крутите макет. Булавка — храм, архив, деревня или имение из ревизских сказок. В карточке храма — снимок,
            если Wikimedia лежит рядом, кладбища OSM и смена губернии, уезда, повета, района, сельсовета.
            Слой кладбищ включается отдельно. Деревни и имения в списке слева появляются по поиску.
          </p>
        </div>
        <p id="counts" className="counts" />
      </header>
      <aside id="panel">
        <input id="q" type="search" placeholder="Храм, деревня, владелец, уезд" autoComplete="off" />
        <div id="kinds" className="kinds" />
        <p id="list-meta" className="meta" />
        <div id="list" />
      </aside>
      <article id="card" hidden />
      <div id="bases" className="bases">
        <button type="button" data-base="relief" className="on">Рельеф</button>
        <button type="button" data-base="topo">Топо</button>
        <button type="button" data-base="roads">Дороги</button>
        <button type="button" data-base="old">Старые</button>
        <label id="year-wrap" hidden>Год
          <select id="year" defaultValue="2026">
            <option value="2026">сейчас</option>
            <option value="1989">1989</option>
            <option value="1938">1938</option>
            <option value="1914">1914</option>
            <option value="1863">1863</option>
          </select>
        </label>
        <p id="base-note" />
      </div>
      <div className="hud">
        <label id="exag-wrap">
          Рельеф <input id="exag" type="range" min="40" max="420" defaultValue="80" />
        </label>
        <button type="button" id="reset">Весь макет</button>
      </div>
      <footer>
        Ссылка на приход — <a href="https://shappoff.github.io/prikhody" target="_blank" rel="noreferrer">карта Сергея Шаппо</a>.
        Сельсовет на 2019 год — справочник населённых пунктов. Волость и гмина в этих списках не размечены.
        Фото — <a href="https://commons.wikimedia.org/" target="_blank" rel="noreferrer">Wikimedia Commons</a>, лицензия у файла.
        Кладбища — © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">участники OpenStreetMap</a>, ODbL.
        Деревни, имения и владельцы — индекс ревизских сказок GeneoBY, фонды НИАБ 333 и 694. Точка стоит на одноимённом пункте, это не межа.
        Граница — geoBoundaries. Рельеф — Mapzen Terrain Tiles.
      </footer>
      <div id="loading">Собираю макет…</div>
    </>
  );
}
