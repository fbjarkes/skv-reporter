import format from 'date-fns/format';
import parse from 'date-fns/parse';
import parser from 'fast-xml-parser';
import Ajv, { JSONSchemaType } from 'ajv';

import { logger } from '../logging';
import { TradeType } from '../types/trade';
import { connectTrades } from './utils';
import { sumBy } from 'lodash';

const FQ_DATETIME_FORMAT = 'yyyyMMdd;HHmmss'; // TODO: To be configurable in .env?
const FQ_DATE_FORMAT = 'yyyyMMdd';
const DATETIME_FORMAT = 'yyyy-MM-dd HH:mm';
const DATE_FORMAT = 'yyyy-MM-dd';

interface FQTrade {
    _accountId: string;
    _assetCategory: string;
    _currency: string;
    _fxRateToBase: number;
    _symbol: string;
    _description: string;
    _dateTime: string;
    _quantity: number;
    _tradePrice: number;
    _proceeds: number;
    _ibCommission: number;
    _ibCommissionCurrency: string;
    _closePrice: number;
    _openCloseIndicator: string;
    _buySell: string;
    _orderTime: string;
    _netCash: number;
    _orderType: string;
    _transactionType: string;
    _cost: number;
    _fifoPnlRealized: number;
    _multiplier: number;
    _strike: number;
    _putCall: string;
    _exchange: string;
}

interface FQRate {
    _reportDate: string;
    _fromCurrency: string;
    _toCurrency: string;
    _rate: number;
}

interface MyData {
    _currency: string;
    _assetCategory: string;
    _symbol: string;
    _dateTime: string;
    _quantity: string;
    _proceeds: string;
    _ibCommission: string;
    _closePrice: string;
    _openCloseIndicator: string;
    _buySell: string;
    _transactionType: string;
    _cost: string;
    _fifoPnlRealized: string;
}

const ajv = new Ajv();

const schema: JSONSchemaType<MyData> = {
    type: 'object',
    properties: {
        _currency: { type: 'string' },
        _assetCategory: { type: 'string' },
        _symbol: { type: 'string' },
        _dateTime: { type: 'string' },
        _quantity: { type: 'string' },
        _proceeds: { type: 'string' },
        _ibCommission: { type: 'string' },
        _closePrice: { type: 'string' },
        _openCloseIndicator: { type: 'string' },
        _buySell: { type: 'string' },
        _transactionType: { type: 'string' },
        _cost: { type: 'string' },
        _fifoPnlRealized: { type: 'string' },
    },
    required: [
        // TODO: consider to only require symbol, currency, fifoPnlRealized, openCloseIndicator and assetCategory
        '_currency',
        '_assetCategory',
        '_symbol',
        //'_dateTime',
        '_quantity',
        '_proceeds',
        '_ibCommission',
        '_closePrice',
        '_openCloseIndicator',
        '_buySell',
        '_transactionType',
        '_cost',
        '_fifoPnlRealized',
    ],
    additionalProperties: true,
};

const validate = ajv.compile(schema);

// TODO: move to utils
const addCalculatedPairs = (ratesByDate: Map<string, Map<string, number>>) => {
    // For each day:
    //  1. get SEK/USD rate
    //  2. iterate over every other pair, <CURR>/USD and calculate <CURR>/SEK using SEK/USD
    ratesByDate.forEach((pairs: Map<string, number>) => {
        const sekUsd = pairs.get('SEK/USD');
        if (sekUsd) {
            const calculated = new Map();
            pairs.forEach((val: number, key: string) => {
                if (key !== 'SEK/USD') {
                    const numerator = key.substr(0, 3);
                    const rate = sekUsd / val;
                    calculated.set('SEK/' + numerator, rate);
                    calculated.set(numerator + '/SEK', 1 / rate);
                }
            });
            calculated.forEach((v, k) => {
                pairs.set(k, v.toFixed(4));
            });
            pairs.set('USD/SEK', 1 / sekUsd);
        }
    });
};

export class FlexQueryParser {
    options = {
        attributeNamePrefix: '_',
        ignoreAttributes: false,
        parseNodeValue: true,
        parseAttributeValue: false,
    };

    #rates: Map<string, Map<string, number>> = new Map();
    #trades: TradeType[] = [];
    #unhandled: FQTrade[] = [];

    toDateString(dateTime: string): string {
        // TODO: default to 'New_York/America' tz?
        if (!dateTime || dateTime === '' || dateTime.length !== FQ_DATETIME_FORMAT.length) {
            return '';
        }
        const dt = parse(dateTime, FQ_DATETIME_FORMAT, new Date());
        const str = format(dt, DATETIME_FORMAT);
        return str;
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
        const xmlData = parser.parse(fileData, this.options);
        const size = fileData.length / 1024 / 1024;
        let winners = 0,
            losers = 0,
            pnl = 0,
            totalCommission = 0,
            stkCount = 0,
            optCount = 0,
            futCount = 0,
            nonUsdCount = 0,
            largestLoser = 0,
            largestWinner = 0,
            firstTradeDate = '',
            lastTradeDate = '';
        // TODO: handle 'xmlData.FlexQueryStatements['count'] > 1
        if (xmlData.FlexQueryResponse.FlexStatements.FlexStatement.Trades.Trade) {
            xmlData.FlexQueryResponse.FlexStatements.FlexStatement.Trades.Trade.forEach((item: FQTrade) => {
                if (item._assetCategory === 'CASH') {
                    const t = new TradeType();
                    t.symbol = item._symbol.replace('.', '/');
                    t.description = item._description.replace('.', '/');
                    t.securityType = item._assetCategory;
                    t.quantity = Number(item._quantity);
                    t.pnl = Number(item._fifoPnlRealized);
                    t.proceeds = Number(item._proceeds);
                    t.cost = Number(item._cost);
                    t.commission = Number(item._ibCommission);
                    t.commissionCurrency = item._ibCommissionCurrency;
                    t.tradeCurrency = item._currency;
                    t.transactionType = item._transactionType;
                    t.direction = item._buySell; //TODO: LONG/SHORT or BUY/SELL??
                    const dateStr = item._dateTime ? item._dateTime.substring(0, 8) : '';
                    const dateFormatted =
                        dateStr.length === 8 ? format(parse(dateStr, FQ_DATE_FORMAT, new Date()), DATE_FORMAT) : '';
                    if (item._buySell === 'SELL') {
                        t.exitPrice = Number(item._tradePrice);
                        t.exitDateTime = dateFormatted;
                    } else {
                        t.entryPrice = Number(item._tradePrice);
                        t.entryDateTime = dateFormatted;
                    }
                    this.#trades.push(t);
                    return;
                }
                if (
                    item._openCloseIndicator === 'C' ||
                    item._openCloseIndicator === 'O' ||
                    item._openCloseIndicator === 'C;O'
                ) {
                    if (!validate(item)) {
                        const messages: string[] = [];
                        validate.errors?.forEach((e) => {
                            console.log(e.params, e.message);
                            messages.push(`${e.message?.toString()}`);
                        });
                        throw new Error(`Invalid FlexStatement.Trades.Trade: ${messages.join(' ')}`);
                    }
                    const t = new TradeType();
                    t.symbol = item._symbol;
                    t.securityType = item._assetCategory;
                    t.quantity = Number(item._quantity);
                    t.pnl = Number(item._fifoPnlRealized);

                    t.quantity = Number(item._quantity);
                    t.description = item._description;
                    t.proceeds = Number(item._proceeds);
                    t.cost = Number(item._cost);
                    t.commission = Number(item._ibCommission);
                    t.commissionCurrency = item._ibCommissionCurrency;
                    t.tradeCurrency = item._currency;
                    t.transactionType = item._transactionType;
                    t.openClose = item._openCloseIndicator;

                    if (item._openCloseIndicator === 'C' || item._openCloseIndicator === 'C;O') {
                        t.exitPrice = Number(item._tradePrice);
                        t.exitDateTime = this.toDateString(item._dateTime);
                        t.direction = item._quantity < 0 ? 'LONG' : 'SHORT';
                    } else {
                        t.entryPrice = Number(item._tradePrice);
                        t.entryDateTime = this.toDateString(item._dateTime);
                        t.direction = item._quantity > 0 ? 'LONG' : 'SHORT';
                    }
                    this.#trades.push(t);
                } else {
                    logger.warn(`Not handling FQTrade with O/C indicator '${item._openCloseIndicator}'`);
                    logger.debug(item);
                    this.#unhandled.push(item);
                }
            });
        }

        if (xmlData.FlexQueryResponse.FlexStatements.FlexStatement.ConversionRates) {
            xmlData.FlexQueryResponse.FlexStatements.FlexStatement.ConversionRates.ConversionRate.forEach(
                (item: FQRate) => {
                    const dateString = format(parse(item._reportDate, FQ_DATE_FORMAT, new Date()), DATE_FORMAT);
                    if (this.#rates.has(dateString)) {
                        this.#rates
                            .get(dateString)
                            ?.set(`${item._fromCurrency}/${item._toCurrency}`, Number(item._rate));
                    } else {
                        const pairs = new Map();
                        pairs.set(`${item._fromCurrency}/${item._toCurrency}`, Number(item._rate));
                        this.#rates.set(dateString, pairs);
                    }
                },
            );
            addCalculatedPairs(this.#rates);
        }

        // Add Entry dates for closing trades
        connectTrades(this.#trades);
        logger.info(
            `Parsed: XML data (${size.toFixed(2)}mb), found ${this.#trades.length} trades and ${
                this.#rates.size
            } FX mappings`,
        );

        const usdTrades = this.#trades.filter((t) => t.tradeCurrency === 'USD');
        const nonUsdTrades = this.#trades.filter((t) => t.tradeCurrency !== 'USD');
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
            firstTradeDate: firstTradeDate,
            lastTradeDate: lastTradeDate,
            largestLoser: largestLoser,
            largestWinner: largestWinner,
            tradesNonUSDCount: this.#trades.filter((t) => t.tradeCurrency !== 'USD').length,
            tradesUnhandledCount: this.#unhandled.length,
            ratesCount: this.#rates.size,
        };
    }
}
