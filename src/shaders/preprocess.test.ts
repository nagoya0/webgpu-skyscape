import { describe, expect, it } from 'vitest'

import { preprocess } from './preprocess'

const run = (source: string, ...defines: string[]): string[] =>
  preprocess(source, new Set(defines)).split('\n')

describe('preprocess', () => {
  it('keeps or drops #ifdef and #ifndef blocks, keeping line numbers', () => {
    const source = ['a', '#ifdef HAZE', 'b', '#else', 'c', '#endif', 'd'].join('\n')
    expect(run(source, 'HAZE')).toEqual(['a', '', 'b', '', '', '', 'd'])
    expect(run(source)).toEqual(['a', '', '', '', 'c', '', 'd'])
    expect(run(['#ifndef X', 'y', '#endif'].join('\n'))).toEqual(['', 'y', ''])
  })

  it('evaluates #if expressions with defined, !, && and ||', () => {
    const source = ['#if defined(A) && (B || !defined(C))', 'yes', '#endif'].join('\n')
    expect(run(source, 'A', 'B')[1]).toBe('yes')
    expect(run(source, 'A')[1]).toBe('yes')
    expect(run(source, 'A', 'C')[1]).toBe('')
    expect(run(source, 'B')[1]).toBe('')
  })

  it('takes the first true branch of an #elif chain', () => {
    const source = ['#if A', 'a', '#elif B', 'b', '#elif C', 'c', '#else', 'd', '#endif'].join('\n')
    expect(run(source, 'B', 'C').filter(Boolean)).toEqual(['b'])
    expect(run(source).filter(Boolean)).toEqual(['d'])
  })

  it('nests blocks, and drops everything inside a dropped block', () => {
    const source = ['#ifdef A', '#ifdef B', 'ab', '#else', 'a', '#endif', '#endif'].join('\n')
    expect(run(source, 'B').filter(Boolean)).toEqual([])
    expect(run(source, 'A').filter(Boolean)).toEqual(['a'])
  })

  it('allows indentation and trailing comments on directives', () => {
    const source = ['  #ifdef POWDER // the powder effect', 'p', '  #endif // POWDER'].join('\n')
    expect(run(source, 'POWDER')).toEqual(['', 'p', ''])
  })

  it('reports unbalanced directives', () => {
    expect(() => preprocess('#ifdef A\nx', new Set())).toThrow(/no #endif/)
    expect(() => preprocess('#endif', new Set())).toThrow(/without #if/)
    expect(() => preprocess('#else', new Set())).toThrow(/without #if/)
  })
})
