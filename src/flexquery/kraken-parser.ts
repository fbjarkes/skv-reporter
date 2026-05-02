import { sumBy } from 'lodash';

import { logger } from '../logging';
import { TradeType } from '../types/trade';

const DATE_TIME_SUFFIX = ' 00:00';
const DEFAULT_DUST_THRESHOLD = 5.0;

type KrakenSide = 'buy' | 'sell';

interface KrakenRow {
    txid: string;
    pair: string;
    time: string;
    type: KrakenSide;
    price: number;
    cost: number;
    fee: number;
    vol: number;
}

export class KrakenParser {
    #account: string;
    #dustThreshold: number;
    #rates: Map<string, Map<string, number>> = new Map();
    #trades: TradeType[] = [];
    #unhandled: string[] = [];

    constructor(account?: string, dustThreshold = DEFAULT_DUST_THRESHOLD) {
        this.#account = account || '<ACCOUNT>';
        this.#dustThreshold = dustThreshold;
    }

    public getClosingTrades(): TradeType[] {
        return this.#trades.filter((t) => t.openClose === 'C' || t.openClose === 'C;O');
    }

    public getAllTrades(): TradeType[] {
        return this.#trades;
    }

    public getConversionRates(): Map<string, Map<string, number>> {
        return this.#rates;
    }

    public parse(fileData: string) {
        this.#trades = [];
        this.#unhandled = [];
        let dustCount = 0;

        const lines = fileData
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (lines.length < 2) {
            throw new Error('Invalid Kraken CSV: expected header and at least one data row');
        }

        const headers = lines[0].split(',');
        const headerIndex = this.getHeaderIndexes(headers);

        for (let i = 1; i < lines.length; i++) {
            const columns = lines[i].split(',');
            if (columns.length < headers.length) {
                this.#unhandled.push(`Row ${i + 1}: malformed CSV row`);
                continue;
            }

            const row = this.toRow(columns, headerIndex);

            if (row.type !== 'buy' && row.type !== 'sell') {
                this.#unhandled.push(`Row ${i + 1}: unsupported transaction type '${row.type}'`);
                continue;
            }

            if (row.cost < this.#dustThreshold) {
                dustCount++;
            }
            //TODO: temporary fix, set USD/SEK rate at trade date to 10.0
            this.#rates.set(row.time.slice(0, 10), new Map([['USD/SEK', 10.0]]));
            this.#trades.push(this.mapToTrade(row));
        }

        this.#trades.sort((a, b) => {
            const aDate = a.entryDateTime || a.exitDateTime;
            const bDate = b.entryDateTime || b.exitDateTime;
            return aDate.localeCompare(bDate);
        });

        const size = fileData.length / 1024 / 1024;
        logger.info(`${this.#account}: Parsed Kraken CSV (${size.toFixed(2)}mb), found ${this.#trades.length} trades`);
        if (dustCount > 0) {
            logger.warn(
                `${this.#account}: ${dustCount} dust transaction(s) with cost < ${
                    this.#dustThreshold
                } (parsed but may be insignificant)`,
            );
        }

        const usdTrades = this.#trades.filter((t) => t.tradeCurrency === 'USD');
        const nonUsdTrades = this.#trades.filter((t) => t.tradeCurrency !== 'USD');

        const sortedTradeDates = this.#trades
            .flatMap((t) => [t.entryDateTime, t.exitDateTime])
            .filter((d) => !!d)
            .sort();

        return {
            tradesCount: this.#trades.length,
            winnersCount: this.#trades.filter((t) => t.pnl > 0).length,
            losersCount: this.#trades.filter((t) => t.pnl <= 0).length,
            tradePnl: sumBy(usdTrades, (t) => t.pnl),
            tradePnlNonUsd: sumBy(nonUsdTrades, (t) => t.pnl),
            totalComm: sumBy(usdTrades, (t) => t.commission),
            stkTradesCount: this.#trades.filter((t) => t.securityType === 'STK').length,
            optTradesCount: this.#trades.filter((t) => t.securityType === 'OPT').length,
            futTradesCount: this.#trades.filter((t) => t.securityType === 'FUT').length,
            firstTradeDate: sortedTradeDates.length > 0 ? sortedTradeDates[0] : '',
            lastTradeDate: sortedTradeDates.length > 0 ? sortedTradeDates[sortedTradeDates.length - 1] : '',
            largestLoser: Math.min(...this.#trades.map((t) => t.pnl), 0),
            largestWinner: Math.max(...this.#trades.map((t) => t.pnl), 0),
            tradesNonUSDCount: nonUsdTrades.length,
            tradesUnhandledCount: this.#unhandled.length,
            dustCount,
            ratesCount: this.#rates.size,
        };
    }

    private getHeaderIndexes(headers: string[]): Record<string, number> {
        const requiredHeaders = ['txid', 'pair', 'time', 'type', 'price', 'cost', 'fee', 'vol'];

        const indexes: Record<string, number> = {};
        requiredHeaders.forEach((header) => {
            const index = headers.indexOf(header);
            if (index === -1) {
                throw new Error(`Invalid Kraken CSV: missing required header '${header}'`);
            }
            indexes[header] = index;
        });

        return indexes;
    }

    private toNumber(value: string): number {
        if (!value || value.trim() === '') {
            return 0;
        }
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? parsed : 0;
    }

    private toRow(columns: string[], idx: Record<string, number>): KrakenRow {
        return {
            txid: columns[idx.txid] || '',
            pair: columns[idx.pair] || '',
            time: columns[idx.time] || '',
            type: (columns[idx.type] || '') as KrakenSide,
            price: this.toNumber(columns[idx.price]),
            cost: this.toNumber(columns[idx.cost]),
            fee: this.toNumber(columns[idx.fee]),
            vol: this.toNumber(columns[idx.vol]),
        };
    }

    private mapToTrade(row: KrakenRow): TradeType {
        const trade = new TradeType();
        const [baseSymbol, quoteSymbol] = row.pair.split('/');
        const isBuy = row.type === 'buy';

        trade.symbol = baseSymbol || row.pair;
        trade.description = row.pair;
        trade.securityType = 'CASH';
        trade.tradeCurrency = quoteSymbol || 'USD';
        trade.transactionType = 'ExchTrade';
        trade.openClose = isBuy ? 'O' : 'C';
        trade.direction = isBuy ? 'BUY' : 'SELL'; //TODO: LONG or BUY??
        trade.commission = -Math.abs(row.fee);
        trade.commissionCurrency = trade.tradeCurrency;

        if (isBuy) {
            trade.quantity = row.vol;
            trade.entryPrice = row.price;
            trade.entryDateTime = `${row.time}${DATE_TIME_SUFFIX}`;
            trade.cost = row.cost;
        } else {
            trade.quantity = -row.vol;
            trade.exitPrice = row.price;
            trade.exitDateTime = `${row.time}${DATE_TIME_SUFFIX}`;
            // cost basis is unknown at parse time; will be filled by position tracking
            trade.proceeds = row.cost;
        }

        return trade;
    }
}
