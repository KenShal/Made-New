import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CREATORS, HERO_PRODUCT_SLUGS, PRODUCTS } from '@/data/sample';
import { Hero } from '@/features/home/Hero';
import { useCarousel } from './useCarousel';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useCarousel', () => {
  it('autoplays and wraps around', () => {
    const { result } = renderHook(() => useCarousel({ count: 3, intervalMs: 1000 }));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.index).toBe(1);
    act(() => vi.advanceTimersByTime(1000));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.index).toBe(0);
  });
  it('stops while suspended (hover, focus, hidden tab) and when paused', () => {
    const { result, rerender } = renderHook((p: { suspended: boolean }) => useCarousel({ count: 3, intervalMs: 1000, suspended: p.suspended }), { initialProps: { suspended: true } });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.index).toBe(0);
    rerender({ suspended: false });
    act(() => result.current.togglePause());
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.index).toBe(0);
    expect(result.current.playing).toBe(false);
  });
  it('never autoplays under reduced motion, but manual controls still work', () => {
    const { result } = renderHook(() => useCarousel({ count: 3, intervalMs: 1000, autoplayAllowed: false }));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.index).toBe(0);
    act(() => result.current.prev());
    expect(result.current.index).toBe(2);
    act(() => result.current.go(1));
    expect(result.current.index).toBe(1);
  });
  it('restarts the timer after manual navigation', () => {
    const { result } = renderHook(() => useCarousel({ count: 3, intervalMs: 1000 }));
    act(() => vi.advanceTimersByTime(900));
    act(() => result.current.next());
    act(() => vi.advanceTimersByTime(900));
    expect(result.current.index).toBe(1);
  });
});

describe('Hero carousel', () => {
  const products = HERO_PRODUCT_SLUGS.map((s) => PRODUCTS.find((p) => p.slug === s)!);
  const renderHero = () => render(<MemoryRouter><Hero products={products} creators={CREATORS} /></MemoryRouter>);

  it('exposes accessible controls and responds to buttons and arrow keys', () => {
    renderHero();
    const region = screen.getByRole('region', { name: 'Featured T-shirts' });
    expect(screen.getByRole('group', { name: `1 of ${products.length}: ${products[0]!.name}` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next shirt' }));
    expect(screen.getByRole('button', { name: `Show ${products[1]!.name}` })).toHaveAttribute('aria-current', 'true');
    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(screen.getByRole('button', { name: `Show ${products[0]!.name}` })).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByRole('button', { name: `Show ${products[2]!.name}` }));
    expect(screen.getByRole('button', { name: `Show ${products[2]!.name}` })).toHaveAttribute('aria-current', 'true');
  });
  it('has a pause control', () => {
    renderHero();
    const pause = screen.getByRole('button', { name: 'Pause slideshow' });
    fireEvent.click(pause);
    expect(screen.getByRole('button', { name: 'Play slideshow' })).toHaveAttribute('aria-pressed', 'true');
  });
});
