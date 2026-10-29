// Paso 3.4b (decisión 274): una foto remota que no carga (el CDN de la fuente la rechaza o ha caducado)
// deja de mostrar el icono de imagen rota del navegador y muestra el marcador que le pasa el llamador.
// Sin jsdom (arbitraje de la 1.11): el estado se prueba en la vista pura; el componente con estado
// solo se comprueba en su primer render, que es el que sale del servidor. La presencia de la imagen
// se comprueba por `data-nimg`, el atributo que `next/image` pone siempre en su elemento.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { FallbackImage, FallbackImageView } from '../src/components/fallback-image.js';

const SRC = 'https://img4.idealista.com/blur/480_360_mq/0/id.pro.es.image.master/aa/bb/cc/1.webp';
const FALLBACK = <span aria-hidden="true">Sin foto</span>;

describe('FallbackImage (decisión 274) — marcador cuando la foto no carga', () => {
  it('sin fallo, pinta la imagen y no el marcador', () => {
    const html = renderToStaticMarkup(
      <FallbackImageView failed={false} onError={() => undefined} src={SRC} alt="" fill sizes="6rem" fallback={FALLBACK} />
    );
    expect(html).toContain('data-nimg="fill"');
    expect(html).not.toContain('Sin foto');
  });

  it('con fallo, pinta solo el marcador: ninguna imagen, así que ningún icono roto', () => {
    const html = renderToStaticMarkup(
      <FallbackImageView failed onError={() => undefined} src={SRC} alt="" fill sizes="6rem" fallback={FALLBACK} />
    );
    expect(html).not.toContain('data-nimg');
    expect(html).toBe('<span aria-hidden="true">Sin foto</span>');
  });

  it('el primer render (el del servidor) es la imagen, con los atributos del llamador', () => {
    const html = renderToStaticMarkup(
      <FallbackImage src={SRC} alt="Foto de la vivienda" fill sizes="6rem" className="result-row__img" fallback={FALLBACK} />
    );
    expect(html).toContain('data-nimg="fill"');
    expect(html).toContain('alt="Foto de la vivienda"');
    expect(html).toContain('sizes="6rem"');
    expect(html).toContain('class="result-row__img"');
    expect(html).not.toContain('Sin foto');
  });
});
