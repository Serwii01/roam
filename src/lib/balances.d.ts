import type { Expense } from './db'

export function isSettlement(e: Pick<Expense, 'category'>): boolean
export function sharesOf(e: Pick<Expense, 'amount' | 'rate' | 'split_mode' | 'split'>, people: string[]): Map<string, number>
export function balancesOf(expenses: Expense[], people: string[]): { paid: Map<string, number>; owed: Map<string, number> }
export function netBalances(paid: Map<string, number>, owed: Map<string, number>): Map<string, number>
export function settleBalances(paid: Map<string, number>, owed: Map<string, number>): { from: string; to: string; amount: number }[]
