import { sumBy } from 'lodash';

import { logger } from '../logging';
import { TradeType } from '../types/trade';
import { connectTrades } from './utils';

const DATE_TIME_SUFFIX = ' 00:00';

type NNSide = 'KÖPT' | 'SÅLT';

interface NNRow {
    transactionType: string;
    symbol: string;
    isin: string;
    quantity: number;
    price: number;
    currency: string;
    amount: number;
    costBasis: number;
    result: number;
    tradeDate: string;
    commission: number;
}

export class NNParser {
    #account: string;
    #rates: Map<string, Map<string, number>> = new Map();
    #trades: TradeType[] = [];
    #unhandled: string[] = [];

    constructor(account?: string) {
        this.#account = account || '<ACCOUNT>';
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

        const lines = fileData
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (lines.length < 2) {
            throw new Error('Invalid Nordnet CSV: expected header and at least one data row');
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
            if (row.currency !== 'SEK') {
                logger.warn(`Row ${i + 1}: skipping non-SEK transaction (currency: ${row.currency})`);
                this.#unhandled.push(`Row ${i + 1}: skipping non-SEK transaction (currency: ${row.currency})`);
                continue;
            }
            if (row.transactionType !== 'KÖPT' && row.transactionType !== 'SÅLT') {
                this.#unhandled.push(`Row ${i + 1}: unsupported transaction type '${row.transactionType}'`);
                continue;
            }
            this.#trades.push(this.mapToTrade(row));
        }

        this.#trades.sort((a, b) => {
            const aDate = a.entryDateTime || a.exitDateTime;
            const bDate = b.entryDateTime || b.exitDateTime;
            const dateCmp = aDate.localeCompare(bDate);
            if (dateCmp !== 0) {
                return dateCmp;
            }
            if (a.openClose === b.openClose) {
                return 0;
            }
            return a.openClose === 'O' ? -1 : 1;
        });

        connectTrades(this.#trades);

        const size = fileData.length / 1024 / 1024;
        logger.info(`${this.#account}: Parsed Nordnet CSV (${size.toFixed(2)}mb), found ${this.#trades.length} trades`);

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
            ratesCount: this.#rates.size,
        };
    }

    private getHeaderIndexes(headers: string[]): Record<string, number> {
        const requiredHeaders = [
            'Transaktionstyp',
            'Värdepapper',
            'ISIN',
            'Antal',
            'Kurs',
            'Valuta',
            'Belopp',
            'Inköpsvärde',
            'Resultat',
            'Affärsdag',
            'Courtage',
        ];

        const indexByName: Record<string, number> = {};
        requiredHeaders.forEach((header) => {
            const index = headers.indexOf(header);
            if (index === -1) {
                throw new Error(`Invalid Nordnet CSV: missing required header '${header}'`);
            }
            indexByName[header] = index;
        });

        return indexByName;
    }

    private toNumber(value: string): number {
        if (!value || value.trim() === '') {
            return 0;
        }
        const normalized = value.replace(',', '.');
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    private toRow(columns: string[], idx: Record<string, number>): NNRow {
        return {
            transactionType: columns[idx.Transaktionstyp] || '',
            symbol: columns[idx.Värdepapper] || '',
            isin: columns[idx.ISIN] || '',
            quantity: this.toNumber(columns[idx.Antal]),
            price: this.toNumber(columns[idx.Kurs]),
            currency: columns[idx.Valuta] || '',
            amount: this.toNumber(columns[idx.Belopp]),
            costBasis: this.toNumber(columns[idx.Inköpsvärde]),
            result: this.toNumber(columns[idx.Resultat]),
            tradeDate: columns[idx.Affärsdag] || '',
            commission: this.toNumber(columns[idx.Courtage]),
        };
    }

    private mapToTrade(row: NNRow): TradeType {
        const side = row.transactionType as NNSide;
        const isBuy = side === 'KÖPT';
        const isSell = side === 'SÅLT';
        const trade = new TradeType();

        trade.symbol = row.isin || row.symbol;
        trade.description = row.symbol;
        trade.securityType = 'STK';
        trade.tradeCurrency = row.currency;
        trade.transactionType = 'ExchTrade';
        trade.openClose = isBuy ? 'O' : 'C';
        trade.direction = 'LONG';
        trade.quantity = isBuy ? row.quantity : -row.quantity;
        trade.proceeds = row.amount;
        trade.cost = row.costBasis;
        if (isSell && trade.cost === 0) {
            trade.cost = row.amount - row.result; // Note: calculate cost, since we know actual pnl just subtract it from the proceeds (i.e. positive pnl then the cost is lower than the amount received and vice versa)
        }
        trade.pnl = row.result;
        trade.commission = -Math.abs(row.commission);
        trade.commissionCurrency = row.currency;

        if (isBuy) {
            trade.entryPrice = row.price;
            trade.entryDateTime = `${row.tradeDate}${DATE_TIME_SUFFIX}`;
        } else {
            trade.exitPrice = row.price;
            trade.exitDateTime = `${row.tradeDate}${DATE_TIME_SUFFIX}`;
        }
        return trade;
    }
}
