import parse from 'date-fns/parse';
import { TradeType } from '../types/trade';

export type TradeFilters = {
    long: boolean;
    short: boolean;
    equities: boolean;
    options: boolean;
    futures: boolean;
    duration: number;
    start?: Date;
    end?: Date;
};

export type TradeStats = {
    totalLoss: number;
    totalWin: number;
    winners: number;
    losers: number;
    pf: number;
    winRate: number;
    pnl: number;
    avgWin: number;
    avgLoss: number;
    commissions: number;
};

export const filterTrades = (t: TradeType, filters: TradeFilters): boolean => {
    if (!filters.long && t.direction === 'LONG') {
        return false;
    }
    if (!filters.short && t.direction === 'SHORT') {
        return false;
    }
    if (!filters.options && t.securityType === 'OPT') {
        return false;
    }
    if (!filters.equities && t.securityType === 'STK') {
        return false;
    }
    if (!filters.futures && t.securityType === 'FUT') {
        return false;
    }

    if (filters.start) {
        const tradeStart = parse(t.entryDateTime.substring(0, 10), 'yyyy-MM-dd', new Date());
        if (tradeStart < filters.start) {
            return false;
        }
    }
    if (filters.end) {
        const tradeEnd = parse(t.exitDateTime.substring(0, 10), 'yyyy-MM-dd', new Date());
        if (tradeEnd > filters.end) {
            return false;
        }
    }
    if (filters.duration && filters.duration < 100) {
        if (t.durationMin > filters.duration) {
            return false;
        }
    }

    return true;
};

export const calculateStats = (trades: TradeType[]): TradeStats => {
    const _usdOnly = (t: TradeType): boolean => t.tradeCurrency === 'USD';
    const stats: TradeStats = {
        winners: 0,
        losers: 0,
        pf: 0,
        winRate: 0,
        pnl: 0,
        avgWin: 0,
        avgLoss: 0,
        totalWin: 0,
        totalLoss: 0,
        commissions: 0,
    };
    trades.filter(_usdOnly).forEach((t) => {
        if (t.pnl > 0) {
            stats.winners++;
            stats.totalWin += t.pnl;
        } else {
            stats.losers++;
            stats.totalLoss += t.pnl;
        }
        stats.pnl += t.pnl;
        stats.commissions += t.commission;
    });

    stats.winRate = (stats.winners / (stats.losers + stats.winners)) * 100;
    stats.avgWin = stats.totalWin / stats.winners;
    stats.avgLoss = stats.totalLoss / stats.losers;
    return stats;
};
