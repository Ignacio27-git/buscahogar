'use client';

// Paso 3.4b (decisión 274) — foto remota con marcador. Si la imagen no carga (el CDN de la fuente
// rechaza al optimizador o la foto ha caducado), se cambia por el marcador que pasa el llamador en
// lugar de dejar el icono de imagen rota del navegador. Es el único motivo para ser componente de
// cliente: `onError` es un manejador de eventos del navegador.
//
// Un error ocurrido antes de la hidratación no se pierde: `next/image` vuelve a asignar `src` al
// montar la imagen cuando hay `onError`, así que el evento se repite ya con el manejador puesto.
//
// La vista sin estado se exporta aparte para poder probar las dos ramas sin jsdom.
import Image from 'next/image';
import type { ImageProps } from 'next/image';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

export type FallbackImageProps = Omit<ImageProps, 'onError'> & {
  readonly fallback: ReactNode;
};

export type FallbackImageViewProps = FallbackImageProps & {
  readonly failed: boolean;
  readonly onError: () => void;
};

export function FallbackImageView({ failed, onError, fallback, ...imageProps }: FallbackImageViewProps): ReactNode {
  if (failed) {
    return fallback;
  }
  return <Image {...imageProps} onError={onError} />;
}

export function FallbackImage(props: FallbackImageProps): ReactElement {
  const [failed, setFailed] = useState(false);
  return (
    <FallbackImageView
      {...props}
      failed={failed}
      onError={() => {
        setFailed(true);
      }}
    />
  );
}
