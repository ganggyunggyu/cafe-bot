'use client';

import Lottie from 'lottie-react';
import { useMemo } from 'react';

const createDotsAnimation = (color: [number, number, number, number]) => ({
  v: '5.7.4',
  fr: 30,
  ip: 0,
  op: 30,
  w: 100,
  h: 40,
  nm: 'Loading Dots',
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'Dot 1',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: {
          a: 1,
          k: [
            { t: 0, s: [20, 25, 0], e: [20, 15, 0], i: { x: 0.5, y: 1 }, o: { x: 0.5, y: 0 } },
            { t: 10, s: [20, 15, 0], e: [20, 25, 0], i: { x: 0.5, y: 1 }, o: { x: 0.5, y: 0 } },
            { t: 20, s: [20, 25, 0] },
          ],
        },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      shapes: [
        { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [12, 12] }, d: 1, nm: 'Ellipse' },
        { ty: 'fl', c: { a: 0, k: color }, o: { a: 0, k: 100 }, r: 1, nm: 'Fill' },
      ],
      ip: 0,
      op: 30,
      st: 0,
    },
    {
      ddd: 0,
      ind: 2,
      ty: 4,
      nm: 'Dot 2',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: {
          a: 1,
          k: [
            { t: 5, s: [50, 25, 0], e: [50, 15, 0], i: { x: 0.5, y: 1 }, o: { x: 0.5, y: 0 } },
            { t: 15, s: [50, 15, 0], e: [50, 25, 0], i: { x: 0.5, y: 1 }, o: { x: 0.5, y: 0 } },
            { t: 25, s: [50, 25, 0] },
          ],
        },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      shapes: [
        { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [12, 12] }, d: 1, nm: 'Ellipse' },
        { ty: 'fl', c: { a: 0, k: color }, o: { a: 0, k: 100 }, r: 1, nm: 'Fill' },
      ],
      ip: 0,
      op: 30,
      st: 0,
    },
    {
      ddd: 0,
      ind: 3,
      ty: 4,
      nm: 'Dot 3',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: {
          a: 1,
          k: [
            { t: 10, s: [80, 25, 0], e: [80, 15, 0], i: { x: 0.5, y: 1 }, o: { x: 0.5, y: 0 } },
            { t: 20, s: [80, 15, 0], e: [80, 25, 0], i: { x: 0.5, y: 1 }, o: { x: 0.5, y: 0 } },
            { t: 30, s: [80, 25, 0] },
          ],
        },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      shapes: [
        { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [12, 12] }, d: 1, nm: 'Ellipse' },
        { ty: 'fl', c: { a: 0, k: color }, o: { a: 0, k: 100 }, r: 1, nm: 'Fill' },
      ],
      ip: 0,
      op: 30,
      st: 0,
    },
  ],
});

interface LoadingDotsProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark' | 'auto';
  className?: string;
}

const sizeMap = {
  sm: { width: 32, height: 16 },
  md: { width: 48, height: 20 },
  lg: { width: 64, height: 24 },
};

export const LoadingDots = ({ size = 'md', variant = 'auto', className }: LoadingDotsProps) => {
  const { width, height } = sizeMap[size];

  const lightAnimation = useMemo(() => createDotsAnimation([1, 1, 1, 1]), []);
  const darkAnimation = useMemo(() => createDotsAnimation([0, 0, 0, 1]), []);

  if (variant === 'auto') {
    return (
      <>
        <Lottie
          animationData={lightAnimation}
          loop
          autoplay
          style={{ width, height }}
          className={`dark:hidden ${className || ''}`}
        />
        <Lottie
          animationData={darkAnimation}
          loop
          autoplay
          style={{ width, height }}
          className={`hidden dark:block ${className || ''}`}
        />
      </>
    );
  }

  const animationData = variant === 'light' ? lightAnimation : darkAnimation;

  return (
    <Lottie
      animationData={animationData}
      loop
      autoplay
      style={{ width, height }}
      className={className}
    />
  );
};
