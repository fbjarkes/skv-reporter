import chai, { expect } from 'chai';
import format from 'date-fns/format';
import chaiAsPromised from 'chai-as-promised';
import { K4Form } from '../types/k4-form';
import { TradeType } from '../types/trade';
import { generateBlanketterFileData, isCommodityFuture, SRUFile, SRUInfo } from './sru-file';
import { K4_SEC_TYPE, K4_TYPE, Statement } from '../types/statement';
import { CashPosition } from '../types/cash';

chai.use(chaiAsPromised);

describe('SRU Files', () => {
    const fxRates: Map<string, Map<string, number>> = new Map(
        Object.entries({
            '2021-01-11': new Map(Object.entries({ 'USD/SEK': 10 })),
            '2021-01-10': new Map(Object.entries({ 'USD/SEK': 9.1 })),
            '2020-01-10': new Map(Object.entries({ 'USD/SEK': 9.1 })),
            '2017-09-22': new Map(Object.entries({ 'USD/SEK': 7.98 })),
            '2025-01-15': new Map(Object.entries({ 'USD/SEK': 10.0 })),
            '2025-01-16': new Map(Object.entries({ 'USD/SEK': 10.0 })),
            '2025-01-17': new Map(Object.entries({ 'USD/SEK': 10.0 })),
            '2025-01-18': new Map(Object.entries({ 'USD/SEK': 10.0 })),
            '2025-01-19': new Map(Object.entries({ 'USD/SEK': 10.0 })),
        }),
    );

    const _createTrade = (
        symbol: string,
        cost: number,
        proceeds: number,
        comm: number,
        pnl: number,
        qty = 100,
        secType = 'STK',
        exitDate = '2020-01-10',
    ): TradeType => {
        const t = new TradeType();
        t.exitDateTime = exitDate;
        t.symbol = symbol;
        t.description = '...';
        t.quantity = qty;
        t.securityType = secType;
        t.proceeds = proceeds;
        t.cost = cost;
        t.commission = comm;
        t.pnl = pnl;
        t.transactionType = 'ExchTrade';
        t.tradeCurrency = 'USD';
        t.direction = qty > 0 ? 'LONG' : 'SHORT';
        return t;
    };

    const _createFutTrade = (
        symbol: string,
        cost: number,
        proceeds: number,
        comm: number,
        pnl: number,
        qty = 1,
        secType = 'FUT',
    ): TradeType => {
        const t = new TradeType();
        t.exitDateTime = '2021-01-11'; // USD/SEK is 10
        t.symbol = symbol;
        t.description = '...';
        t.quantity = qty;
        t.securityType = secType;
        t.proceeds = proceeds;
        t.cost = cost;
        t.commission = comm;
        t.pnl = pnl;
        t.transactionType = 'ExchTrade';
        t.tradeCurrency = 'USD';
        t.direction = qty > 0 ? 'LONG' : 'SHORT';
        return t;
    };

    const _createCashTrade = (init: Partial<TradeType>): TradeType => {
        return new TradeType({ securityType: 'CASH', tradeCurrency: 'USD', ...init });
    };

    const _createStatement = ({
        id,
        quantity,
        symbol,
        received,
        paid,
        pnl,
        type,
        date = '',
        secType,
    }: {
        id: number;
        quantity: number;
        symbol: string;
        received: number;
        paid: number;
        pnl: number;
        type: K4_TYPE;
        date?: string;
        secType: K4_SEC_TYPE;
    }): Statement => {
        return new Statement(id, quantity, symbol, paid, received, pnl, type, date, secType);
    };

    it('should create SRU info', () => {
        const sru = new SRUFile(new Map(), [], {
            id: '199001011234',
            name: 'NAME',
            surname: 'SURNAME',
            mail: 'test@example.com',
            code: '12345',
            city: 'STOCKHOLM',
        });
        const lines = sru.getInfoFileData();

        const expectedLines = [
            '#DATABESKRIVNING_START',
            '#PRODUKT SRU',
            `#SKAPAD ${format(new Date(), 'yyyyMMdd')}`,
            '#PROGRAM SKV-Reporter SKV-Reporter',
            '#FILNAMN blanketter.sru',
            '#DATABESKRIVNING_SLUT',
            '#MEDIELEV_START',
            '#ORGNR 199001011234',
            '#NAMN NAME SURNAME',
            '#POSTNR 12345',
            '#POSTORT STOCKHOLM',
            '#EMAIL test@example.com',
            '#MEDIELEV_SLUT',
        ];
        expect(lines).to.have.members(expectedLines);
    });

    describe('SRU statements', () => {
        describe('TYPE_A (STK/OPT/FUT)', () => {
            it('should create valid statement from closing trades', () => {
                const t1 = new TradeType();
                t1.exitDateTime = '2021-01-11';
                t1.symbol = 'SPY';
                t1.description = 'SPY ETF...';
                t1.quantity = -10;
                t1.securityType = 'STK';
                t1.proceeds = 1000;
                t1.cost = -900;
                t1.commission = -1;
                t1.transactionType = 'ExchTrade';
                t1.pnl = 99;
                t1.tradeCurrency = 'USD';
                t1.openClose = 'C';
                const sru = new SRUFile(fxRates, [t1]);
                const statements = sru.getStatements();
                expect(statements[0].pnl).to.equal(Math.round(99 * 10));
                expect(statements[0].paid).to.equal(Math.round(-1 * (-900 - 1) * 10));
                expect(statements[0].received).to.equal(Math.round(1000 * 10));
            });

            it('should create statement for non-USD trade correctly', () => {
                const expiredOpt = new TradeType();
                expiredOpt.description = 'OMXS30 MAR15 1565 P';
                expiredOpt.exitDateTime = '2020-01-10';
                expiredOpt.quantity = -1;
                expiredOpt.proceeds = 0;
                expiredOpt.cost = -1388.5;
                expiredOpt.securityType = 'OPT';
                expiredOpt.tradeCurrency = 'SEK';
                expiredOpt.pnl = -1398.5;
                expiredOpt.commission = -10;
                expiredOpt.transactionType = 'ExchTrade';
                const sru = new SRUFile(fxRates, [expiredOpt]);

                const statements = sru.getStatements();

                expect(statements[0].pnl).to.equal(-1398);
                expect(statements[0].paid).to.equal(1398);
                expect(statements[0].received).to.equal(0);
            });

            it('should handle short trades correctly', () => {
                const t1 = new TradeType();
                t1.tradeCurrency = 'USD';
                t1.direction = 'SHORT';
                t1.exitDateTime = '2017-09-22 14:21';
                t1.exitPrice = 5.1;
                t1.pnl = -436.19;
                t1.cost = 74.9;
                t1.proceeds = -510;
                t1.commission = -1.0915;
                t1.quantity = 1;
                t1.securityType = 'OPT';
                t1.symbol = 'APC';
                t1.transactionType = 'ExchTrade';

                const sru = new SRUFile(fxRates, [t1]);
                const statements = sru.getStatements();
                expect(statements[0].pnl).to.equal(-3481);
                expect(statements[0].quantity).to.equal(1);
                expect(statements[0].paid).to.equal(4079);
                expect(statements[0].received).to.equal(598);
            });

            it('should not create statements for trades with PnL < 1 SEK', () => {
                const t1 = new TradeType();
                t1.tradeCurrency = 'USD';
                t1.exitDateTime = '2017-09-22 14:21';
                t1.exitPrice = 0;
                t1.pnl = 0;
                t1.cost = -68.59;
                t1.proceeds = 0;
                t1.commission = 0;
                t1.quantity = -1;
                t1.securityType = 'OPT';
                t1.symbol = 'IWM';
                t1.transactionType = 'BookTrade';
                const t2 = new TradeType();
                t2.exitDateTime = '2020-01-10';
                t2.symbol = 'SPY';
                t2.securityType = 'STK';
                t2.pnl = 0.1;
                t2.tradeCurrency = 'USD';
                const t3 = new TradeType();
                t3.exitDateTime = '2020-01-10';
                t3.symbol = 'SPY';
                t3.securityType = 'STK';
                t3.pnl = 0.2;
                t3.tradeCurrency = 'USD';

                const sru = new SRUFile(fxRates, [t1, t2, t3]);
                const statements = sru.getStatements();
                expect(statements).to.be.of.length(1);
            });

            it('should throw error when including trade dates for wrong tax year', () => {
                const t1 = new TradeType();
                t1.exitDateTime = '2020-01-10';
                t1.symbol = 'SPY';
                t1.securityType = 'STK';
                t1.pnl = 1;
                const t2 = new TradeType();
                t2.exitDateTime = '2021-01-10';
                t2.symbol = 'SPY';
                t2.securityType = 'STK';
                t2.pnl = 1;

                const sru = new SRUFile(fxRates, [t1, t2], { taxYear: 2021 });
                expect(() => sru.getStatements()).to.throw(/Tax year mismatch/);
            });
            it('should throw error when missing FX rate for trade which must be converted', () => {
                const t1 = new TradeType();
                t1.exitDateTime = '2020-01-10';
                t1.symbol = 'SPY';
                t1.securityType = 'STK';
                t1.pnl = 1;
                t1.tradeCurrency = 'USD';
                const t2 = new TradeType();
                t2.exitDateTime = '2020-01-11';
                t2.symbol = 'SPY';
                t2.securityType = 'STK';
                t2.pnl = 1;
                t2.tradeCurrency = 'USD';
                const sru = new SRUFile(fxRates, [t1, t2]);
                expect(() => sru.getStatements()).to.throw('Missing USD/SEK rate for 2020-01-11');
            });
            it('should throw error for unsupported trade currency', () => {
                const t1 = new TradeType();
                t1.exitDateTime = '2020-01-10';
                t1.symbol = 'BMW';
                t1.securityType = 'STK';
                t1.pnl = 1;
                t1.tradeCurrency = 'EUR';
                const sru = new SRUFile(fxRates, [t1]);
                expect(() => sru.getStatements()).to.throw(/Unsupported currency 'EUR'/);
            });
            it('should handle "C;O" trades correctly', () => {
                const t1 = new TradeType();
                t1.symbol = 'M2KU1';
                t1.quantity = -1;
                t1.exitDateTime = '2021-01-11';
                t1.openClose = 'O';
                t1.securityType = 'FUT';
                t1.cost = -11095.48;
                t1.commission = -0.52;
                t1.proceeds = -11096;
                t1.pnl = 0;
                t1.tradeCurrency = 'USD';
                const t2 = new TradeType();
                t2.symbol = 'M2KU1';
                t2.quantity = 2;
                t2.exitDateTime = '2021-01-11';
                t2.openClose = 'C;O';
                t2.securityType = 'FUT';
                t2.cost = 11095.48;
                t2.commission = -1.04;
                t2.proceeds = -22405;
                t2.pnl = -107.54;
                t2.direction = 'SHORT';
                t2.tradeCurrency = 'USD';
                const t3 = new TradeType();
                t3.symbol = 'M2KU1';
                t3.quantity = -1;
                t3.exitDateTime = '2021-01-11';
                t3.openClose = 'C';
                t3.securityType = 'FUT';
                t3.cost = -11203.02;
                t3.commission = -0.52;
                t3.proceeds = 11160;
                t3.pnl = -43.54;
                t3.direction = 'LONG';
                t3.tradeCurrency = 'USD';
                const sru = new SRUFile(fxRates, [t1, t2, t3]);
                const statements = sru.getStatements();
                expect(statements).to.be.of.length(2);
                expect(statements[0].pnl).to.equal(Math.round(-107.54 * 10));
                expect(statements[1].pnl).to.equal(Math.round(-43.54 * 10));
                // TODO: what should it really be?
                //expect(statements[0].paid).to.equal(0);
                //expect(statements[0].proceeds).to.equal(0);
                //expect(statements[1].paid).to.equal(0);
                //expect(statements[1].proceeds).to.equal(0);
            });
        });

        describe('TYPE_C (Cash)', () => {
            // Manually added
            it('should load initial values from positions file', () => {
                //ASSET, ACCOUNT, YEAR, CUM_QTY, CUM_COST, AVG_COST, COMMENT
                //USD_SEK, U001, 2024, 500, 10000, 20, "Initial value for trade1.xml test cash trades 500 @ 20.0 USD/SEK"
                const cashPositions = [
                    new CashPosition({ symbol: 'USD/SEK', cumQty: 500, cumCost: 10000, currency: 'SEK' }),
                    new CashPosition({ symbol: 'BTC/USD', cumQty: 0.00555, cumCost: 300, currency: 'USD' }),
                ];

                const sru = new SRUFile(fxRates, []);

                sru.setInitialCashPositions(cashPositions);
                const statements = sru.getStatements();
                // Should have no statements, i.e. no SELL trades
                expect(statements).to.be.empty;

                // Assert Cum. Qty, Cum. Cost and Avg. Price for USD/SEK
                const pos = sru.getCashPosition('USD/SEK');
                expect(pos).to.not.be.undefined;
                expect(pos!.cumulativeQty).to.equal(500);
                expect(pos!.cumulativeCost).to.equal(10000);
                expect(pos!.averageCost).to.equal(20.0);

                // Assert for BTC/USD
                const pos2 = sru.getCashPosition('BTC/USD');
                expect(pos2).to.not.be.undefined;
                expect(pos2!.cumulativeQty).to.equal(0.00555);
                expect(pos2!.cumulativeCost).to.equal(300);
                expect(pos2!.averageCost).to.equal(54054.05405);
            });
            it('should process cum. cost, cum. cty and avg. price from buy trade', () => {
                const t1 = _createCashTrade({
                    symbol: 'USD/SEK',
                    direction: 'BUY',
                    quantity: 500,
                    entryPrice: 20.0,
                    proceeds: -10000,
                    commission: -2,
                    commissionCurrency: 'USD',
                    tradeCurrency: 'SEK',
                    entryDateTime: '2025-01-15 12:00:00',
                });
                const t2 = _createCashTrade({
                    symbol: 'USD/SEK',
                    direction: 'BUY',
                    quantity: 500,
                    entryPrice: 10.0,
                    proceeds: -5000,
                    commission: -2,
                    commissionCurrency: 'USD',
                    tradeCurrency: 'SEK',
                    entryDateTime: '2025-01-15 12:00:00',
                });
                const sru = new SRUFile(fxRates, [t1, t2]);
                const statements = sru.getStatements();
                const cashStatements = sru.getCashStatements();

                // Should have no statements, i.e. no SELL trades
                expect(statements).to.be.empty;
                expect(cashStatements).to.be.empty;

                // CumQty=1000
                // CumCost=15040 (proceeds + comm.)
                // AvgPrice=15.04
                const pos = sru.getCashPosition('USD/SEK');
                expect(pos).to.not.be.undefined;
                expect(pos!.cumulativeQty).to.equal(1000);
                expect(pos!.cumulativeCost).to.equal(15040);
                expect(pos!.averageCost).to.equal(15.04);
            });

            it('should create valid statement from sell trade', () => {
                const t1 = new TradeType({
                    symbol: 'USD/SEK',
                    direction: 'BUY',
                    quantity: 500,
                    entryPrice: 20.0,
                    proceeds: -10000,
                    commission: -2,
                    commissionCurrency: 'USD',
                    tradeCurrency: 'SEK',
                    entryDateTime: '2025-01-15 12:00:00',
                    securityType: 'CASH',
                });
                const t2 = new TradeType({
                    symbol: 'USD/SEK',
                    direction: 'BUY',
                    quantity: 500,
                    entryPrice: 19.5,
                    proceeds: -9750,
                    commission: -2,
                    commissionCurrency: 'USD',
                    tradeCurrency: 'SEK',
                    entryDateTime: '2025-01-15 13:00:00',
                    securityType: 'CASH',
                });
                const t3 = new TradeType({
                    symbol: 'USD/SEK',
                    direction: 'SELL',
                    quantity: -1000,
                    exitPrice: 19.0,
                    proceeds: 10000,
                    commission: -2,
                    commissionCurrency: 'USD',
                    tradeCurrency: 'SEK',
                    exitDateTime: '2025-01-16 13:00:00',
                    securityType: 'CASH',
                });
                const cashPositions = [new CashPosition({ symbol: 'USD/SEK', cumQty: 0, cumCost: 0, currency: 'SEK' })];

                const sru = new SRUFile(fxRates, [t1, t2, t3]);
                sru.setInitialCashPositions(cashPositions);

                const statements = sru.getCashStatements();
                const pos = sru.getCashPosition('USD/SEK');

                // Assert pos is reset to 0 after sell
                expect(pos).to.not.be.undefined;
                expect(pos!.cumulativeQty).to.equal(0);
                expect(pos!.cumulativeCost).to.equal(0);
                expect(pos!.averageCost).to.equal(0);

                //assert 1 statement
                expect(statements).to.have.lengthOf(1);
                const stmt = statements[0];
                //assert date, quantity, proceeds, cost, pnl
                expect(stmt.date).to.equal('2025-01-16');
                expect(stmt.symbol).to.equal('USD/SEK');
                expect(stmt.quantity).to.equal(1000);
                expect(stmt.received).to.equal(19000);
                expect(stmt.paid).to.equal(19810);
                expect(stmt.pnl).to.equal(-810);
            });

            it('should create reset cash position and add new position again', () => {
                const cashPositions = [
                    new CashPosition({ symbol: 'USD/SEK', cumQty: 1_000, cumCost: 10_020, currency: 'SEK' }), // Starting with 1000 USD/SEK @ 10.0 + commission (20SEK)
                ];
                // Buy 1000 USD/SEK @ 20.0, avg. 15.0
                // Sell 2000 USD/SEK @ 25.0, pnl: +20000ish
                // Buy 1000 USD/SEK @ 10.0, avg. 10.0
                // Buy 1000 USD/SEK @ 15.0, avg. 12.5ish
                // Sell 1000 USD/SEK @ 10, pnl: -2500ish
                // Cash position: 1000 @ 12.5ish
                const t1 = _createCashTrade({
                    symbol: 'USD/SEK',
                    direction: 'BUY',
                    quantity: 1000,
                    entryPrice: 20.0,
                    proceeds: -20_000,
                    commission: -2,
                    commissionCurrency: 'USD',
                    tradeCurrency: 'SEK',
                    entryDateTime: '2025-01-15 12:00:00',
                });
                const t2 = _createCashTrade({
                    symbol: 'USD/SEK',
                    direction: 'SELL',
                    quantity: -2000,
                    exitPrice: 25.0,
                    proceeds: 50_000,
                    commission: -2,
                    commissionCurrency: 'USD',
                    tradeCurrency: 'SEK',
                    exitDateTime: '2025-01-16 12:00:00',
                });
                const t3 = _createCashTrade({
                    symbol: 'USD/SEK',
                    direction: 'BUY',
                    quantity: 1000,
                    entryPrice: 10.0,
                    proceeds: -10_000,
                    commission: -2,
                    commissionCurrency: 'USD',
                    tradeCurrency: 'SEK',
                    entryDateTime: '2025-01-17 13:00:00',
                });
                const t4 = _createCashTrade({
                    symbol: 'USD/SEK',
                    direction: 'BUY',
                    quantity: 1000,
                    entryPrice: 15.0,
                    proceeds: -15_000,
                    commission: -2,
                    commissionCurrency: 'USD',
                    tradeCurrency: 'SEK',
                    entryDateTime: '2025-01-18 14:00:00',
                });
                const t5 = _createCashTrade({
                    symbol: 'USD/SEK',
                    direction: 'SELL',
                    quantity: -1000,
                    exitPrice: 10.0,
                    proceeds: 10_000,
                    commission: -2,
                    commissionCurrency: 'USD',
                    tradeCurrency: 'SEK',
                    exitDateTime: '2025-01-19 15:00:00',
                });

                const sru = new SRUFile(fxRates, [t1, t2, t3, t4, t5]);
                sru.setInitialCashPositions(cashPositions);

                const statements = sru.getCashStatements();
                const cashPos = sru.getCashPosition('USD/SEK');

                // Assert pos is reset to 0 after first sell, then updated again after next trades
                expect(cashPos).to.not.be.undefined;
                expect(cashPos!.cumulativeQty).to.equal(1_000);
                expect(cashPos!.cumulativeCost).to.equal(12_520);
                expect(cashPos!.averageCost).to.equal(12.52);

                //assert 2 statements
                expect(statements).to.have.lengthOf(2);
                const stmt1 = statements[0];
                expect(stmt1.date).to.equal('2025-01-16');
                expect(stmt1.symbol).to.equal('USD/SEK');
                expect(stmt1.quantity).to.equal(2000);
                expect(stmt1.received).to.equal(50_000);
                expect(stmt1.paid).to.equal(30_060);
                expect(stmt1.pnl).to.equal(19_940);

                const stmt2 = statements[1];
                expect(stmt2.date).to.equal('2025-01-19');
                expect(stmt2.symbol).to.equal('USD/SEK');
                expect(stmt2.quantity).to.equal(1000);
                expect(stmt2.received).to.equal(10_000);
                expect(stmt2.paid).to.equal(12_540);
                expect(stmt2.pnl).to.equal(-2_540);
            });
        });
    });

    describe('K4 forms', () => {
        describe('TYPE A K4 Form', () => {
            it('should add statements', () => {
                const t1 = _createTrade('SPY', 900, 1001, 1, 100);
                const t2 = _createTrade('QQQ', 1000, 901, 1, -100);
                const sru = new SRUFile(fxRates, [t1, t2, t1, t2, t1, t2, t1, t2, t1]);
                const totalProceeds = 5 * Math.round(t1.proceeds * 9.1) + 4 * Math.round(t2.proceeds * 9.1); // Add comm. to cost before applying rate
                const totalCost = 5 * Math.round((t1.cost + 1) * 9.1) + 4 * Math.round((t2.cost + 1) * 9.1); // Add comm. to cost before applying rate
                const totalProfit = 5 * t1.pnl * 9.1;
                const totalLoss = Math.abs(4 * t2.pnl * 9.1);
                const statements = sru.getStatements();
                const form = new K4Form('K4-2021P4', 1, '19900101-1234', new Date(2021, 0, 1, 14, 30, 0), statements);

                const expectedLines = [
                    '#BLANKETT K4-2021P4',
                    '#IDENTITET 19900101-1234 20210101 143000',
                    '#UPPGIFT 7014 1',
                    // T1
                    '#UPPGIFT 3100 100',
                    '#UPPGIFT 3101 SPY ...',
                    '#UPPGIFT 3102 9109',
                    '#UPPGIFT 3103 8199',
                    '#UPPGIFT 3104 910',
                    // T2
                    '#UPPGIFT 3110 100',
                    '#UPPGIFT 3111 QQQ ...',
                    '#UPPGIFT 3112 8199',
                    '#UPPGIFT 3113 9109',
                    '#UPPGIFT 3115 910',
                    // T1
                    '#UPPGIFT 3120 100',
                    '#UPPGIFT 3121 SPY ...',
                    '#UPPGIFT 3122 9109',
                    '#UPPGIFT 3123 8199',
                    '#UPPGIFT 3124 910',
                    // T2
                    '#UPPGIFT 3130 100',
                    '#UPPGIFT 3131 QQQ ...',
                    '#UPPGIFT 3132 8199',
                    '#UPPGIFT 3133 9109',
                    '#UPPGIFT 3135 910',
                    // T1
                    '#UPPGIFT 3140 100',
                    '#UPPGIFT 3141 SPY ...',
                    '#UPPGIFT 3142 9109',
                    '#UPPGIFT 3143 8199',
                    '#UPPGIFT 3144 910',
                    // T2
                    '#UPPGIFT 3150 100',
                    '#UPPGIFT 3151 QQQ ...',
                    '#UPPGIFT 3152 8199',
                    '#UPPGIFT 3153 9109',
                    '#UPPGIFT 3155 910',
                    // T1
                    '#UPPGIFT 3160 100',
                    '#UPPGIFT 3161 SPY ...',
                    '#UPPGIFT 3162 9109',
                    '#UPPGIFT 3163 8199',
                    '#UPPGIFT 3164 910',
                    // T2
                    '#UPPGIFT 3170 100',
                    '#UPPGIFT 3171 QQQ ...',
                    '#UPPGIFT 3172 8199',
                    '#UPPGIFT 3173 9109',
                    '#UPPGIFT 3175 910',
                    // T1
                    '#UPPGIFT 3180 100',
                    '#UPPGIFT 3181 SPY ...',
                    '#UPPGIFT 3182 9109',
                    '#UPPGIFT 3183 8199',
                    '#UPPGIFT 3184 910',
                    // Sum
                    `#UPPGIFT 3300 ${totalProceeds}`,
                    `#UPPGIFT 3301 ${totalCost}`,
                    `#UPPGIFT 3304 ${totalProfit}`,
                    `#UPPGIFT 3305 ${totalLoss}`,
                    '#BLANKETTSLUT',
                ];
                const lines = form.generateLinesTypeA();
                expect(lines).to.have.members(expectedLines);
            });

            it('should calculate totals for each type');

            it('should determine future type based on symbol', () => {
                expect(isCommodityFuture('ESM2')).to.be.false;
                expect(isCommodityFuture('MESH2')).to.be.false;
                expect(isCommodityFuture('SPY')).to.be.false;
                expect(isCommodityFuture('OMXS301C')).to.be.false;
                expect(isCommodityFuture('CLM2')).to.be.true;
                expect(isCommodityFuture('MCLM2')).to.be.true;
                expect(isCommodityFuture('GCM1')).to.be.true;
                expect(isCommodityFuture('MGCM1')).to.be.true;
            });

            it('should do commodity futures in Type D section', () => {
                const t1 = _createFutTrade('MCLX1', 1000, 1010, 1, 9, 1); // 1 LONG with +9 pnl
                const t2 = _createFutTrade('MCLX1', 1000, 1010, 1, -11, -1); // 1 SHORT with -11 pnl
                // const t3 = _createTrade('MCLX1 ...', 1000, 9900, 1, -105, 1, 'FUT');
                // const t4 = _createTrade('MCLX1', 1000, 9800, 1, -105, -1, 'FUT');
                // const t5 = _createTrade('MGCM1', 2000, 2010, 2, 90, 1, 'FUT');
                // const t6 = _createTrade('MGCM1', 2000, 2000, 2, , 1, 'FUT');
                // const t7 = _createTrade('MGCM1', 2000, 1900, 2, -110, 1, 'FUT');
                // const t8 = _createTrade('MGCM1', 2000, 2020, 2, -190, 1, 'FUT');
                const sru = new SRUFile(fxRates, [t1, t2]);
                const statements = sru.getStatements();
                const form = new K4Form('K4-2021P4', 1, '19900101-1234', new Date(2021, 0, 1, 14, 30, 0), statements);
                const expectedLines = [
                    '#BLANKETT K4-2021P4',
                    '#IDENTITET 19900101-1234 20210101 143000',
                    '#UPPGIFT 7014 1',
                    // T1
                    '#UPPGIFT 3410 1',
                    '#UPPGIFT 3411 MCLX1 ...',
                    '#UPPGIFT 3412 10100', // 1010*10
                    '#UPPGIFT 3413 10010', // (1000+1)*10
                    '#UPPGIFT 3414 90', // 9*10
                    // T2
                    '#UPPGIFT 3420 1',
                    '#UPPGIFT 3421 MCLX1 ...',
                    '#UPPGIFT 3422 10000', // 1000*10
                    '#UPPGIFT 3423 10110', // (1010+1)*10
                    '#UPPGIFT 3425 110', // -11*10

                    // Sum
                    `#UPPGIFT 3500 ${10100 + 10000}`,
                    `#UPPGIFT 3501 ${10010 + 10110}`,
                    `#UPPGIFT 3503 ${90}`,
                    `#UPPGIFT 3504 ${110}`,
                    '#BLANKETTSLUT',
                ];
                const lines = form.generateLinesTypeD();
                expect(lines).to.have.members(expectedLines);
            });
            it.skip('should do index futures in Type A section');
            it('should generate 9 (max) TYPE_A statements per K4Form', () => {
                const statements = new Array(10).fill(
                    new Statement(0, 100, 'SPY', 100, 100, 0, K4_TYPE.TYPE_A, '', K4_SEC_TYPE.STOCK),
                );
                const form = new K4Form('K4-2021P4', 1, '19900101-1234', new Date(2021, 0, 1, 14, 30, 0), statements);
                expect(() => form.generateLinesTypeA()).to.throw(/Form contains too many statements/);
            });
            it('should generate 7 (max) TYPE_D statements per K4Form', () => {
                const statements = new Array(8).fill(
                    new Statement(0, 100, 'MGCM1', 100, 100, 0, K4_TYPE.TYPE_D, '', K4_SEC_TYPE.FUTURE),
                );
                const form = new K4Form('K4-2021P4', 1, '19900101-1234', new Date(2021, 0, 1, 14, 30, 0), statements);
                expect(() => form.generateLinesTypeD()).to.throw(/Form contains too many statements/);
            });
            it('should throw error if generating empty form', () => {
                const form = new K4Form('K4-2021P4', 1, '19900101-1234', new Date(2021, 0, 1, 14, 30, 0), []);
                expect(() => form.generateLinesTypeA()).to.throw(/Form contains no statements/);
                expect(() => form.generateLinesTypeD()).to.throw(/Form contains no statements/);
            });
        });

        describe('TYPE C statements', () => {
            it('should add cash statements', () => {
                const stmt1 = _createStatement({
                    id: 1,
                    quantity: 1000,
                    symbol: 'USD/SEK ...',
                    received: 19000,
                    paid: 19810,
                    pnl: -810,
                    type: K4_TYPE.TYPE_C,
                    secType: K4_SEC_TYPE.CASH,
                });
                const stmt2 = _createStatement({
                    id: 2,
                    quantity: 500,
                    symbol: 'EUR/SEK ...',
                    received: 10000,
                    paid: 7500,
                    pnl: 2500,
                    type: K4_TYPE.TYPE_C,
                    secType: K4_SEC_TYPE.CASH,
                });
                const stmt3 = _createStatement({
                    id: 3,
                    quantity: 200,
                    symbol: 'NOK/SEK ...',
                    received: 2000,
                    paid: 1800,
                    pnl: 200,
                    type: K4_TYPE.TYPE_C,
                    secType: K4_SEC_TYPE.CASH,
                });
                const stmt4 = _createStatement({
                    id: 4,
                    quantity: 700,
                    symbol: 'DKK/SEK ...',
                    received: 7000,
                    paid: 7300,
                    pnl: -300,
                    type: K4_TYPE.TYPE_C,
                    secType: K4_SEC_TYPE.CASH,
                });
                const stmt5 = _createStatement({
                    id: 5,
                    quantity: 300,
                    symbol: 'CHF/SEK ...',
                    received: 6000,
                    paid: 5000,
                    pnl: 1000,
                    type: K4_TYPE.TYPE_C,
                    secType: K4_SEC_TYPE.CASH,
                });
                const stmt6 = _createStatement({
                    id: 6,
                    quantity: 150,
                    symbol: 'JPY/SEK ...',
                    received: 3000,
                    paid: 3200,
                    pnl: -200,
                    type: K4_TYPE.TYPE_C,
                    secType: K4_SEC_TYPE.CASH,
                });
                const stmt7 = _createStatement({
                    id: 7,
                    quantity: 80,
                    symbol: 'GBP/SEK ...',
                    received: 5000,
                    paid: 4000,
                    pnl: 1000,
                    type: K4_TYPE.TYPE_C,
                    secType: K4_SEC_TYPE.CASH,
                });

                const form = new K4Form(
                    'K4-2021P4',
                    1,
                    '19900101-1234',
                    new Date(2021, 0, 1, 14, 30, 0),
                    [stmt1, stmt2, stmt3, stmt4, stmt5, stmt6, stmt7],
                    K4_TYPE.TYPE_C,
                );

                const expectedLines = [
                    '#BLANKETT K4-2021P4',
                    '#IDENTITET 19900101-1234 20210101 143000',
                    '#UPPGIFT 7014 1',
                    // Row 1
                    '#UPPGIFT 3310 1000',
                    '#UPPGIFT 3311 USD/SEK ...',
                    '#UPPGIFT 3312 19000',
                    '#UPPGIFT 3313 19810',
                    '#UPPGIFT 3315 810',
                    // Row 2
                    '#UPPGIFT 3320 500',
                    '#UPPGIFT 3321 EUR/SEK ...',
                    '#UPPGIFT 3322 10000',
                    '#UPPGIFT 3323 7500',
                    '#UPPGIFT 3324 2500',
                    // Row 3
                    '#UPPGIFT 3330 200',
                    '#UPPGIFT 3331 NOK/SEK ...',
                    '#UPPGIFT 3332 2000',
                    '#UPPGIFT 3333 1800',
                    '#UPPGIFT 3334 200',
                    // Row 4
                    '#UPPGIFT 3340 700',
                    '#UPPGIFT 3341 DKK/SEK ...',
                    '#UPPGIFT 3342 7000',
                    '#UPPGIFT 3343 7300',
                    '#UPPGIFT 3345 300',
                    // Row 5
                    '#UPPGIFT 3350 300',
                    '#UPPGIFT 3351 CHF/SEK ...',
                    '#UPPGIFT 3352 6000',
                    '#UPPGIFT 3353 5000',
                    '#UPPGIFT 3354 1000',
                    // Row 6
                    '#UPPGIFT 3360 150',
                    '#UPPGIFT 3361 JPY/SEK ...',
                    '#UPPGIFT 3362 3000',
                    '#UPPGIFT 3363 3200',
                    '#UPPGIFT 3365 200',
                    // Row 7
                    '#UPPGIFT 3370 80',
                    '#UPPGIFT 3371 GBP/SEK ...',
                    '#UPPGIFT 3372 5000',
                    '#UPPGIFT 3373 4000',
                    '#UPPGIFT 3374 1000',
                    // Sum
                    `#UPPGIFT 3400 ${19000 + 10000 + 2000 + 7000 + 6000 + 3000 + 5000}`,
                    `#UPPGIFT 3401 ${19810 + 7500 + 1800 + 7300 + 5000 + 3200 + 4000}`,
                    `#UPPGIFT 3403 ${2500 + 200 + 1000 + 1000}`,
                    `#UPPGIFT 3404 ${810 + 300 + 200}`,
                    '#BLANKETTSLUT',
                ];
                const lines = form.generateLinesTypeC();
                expect(lines).to.have.members(expectedLines);
            });

            it('should throw when generating TYPE C lines for an empty form', () => {
                const form = new K4Form('K4-2021P4', 1, '19900101-1234', new Date(2021, 0, 1, 14, 30, 0), []);

                expect(() => form.generateLinesTypeC()).to.throw();
            });

            it('should throw when generating TYPE C lines for more than 7 statements', () => {
                const statements = Array.from({ length: 8 }, (_, index) =>
                    _createStatement({
                        id: index + 1,
                        quantity: 1000,
                        symbol: `USD/SEK ${index + 1}`,
                        received: 1000 + index,
                        paid: 900 + index,
                        pnl: 100,
                        type: K4_TYPE.TYPE_C,
                        secType: K4_SEC_TYPE.CASH,
                    })
                );
                const form = new K4Form(
                    'K4-2021P4',
                    1,
                    '19900101-1234',
                    new Date(2021, 0, 1, 14, 30, 0),
                    statements
                );

                expect(() => form.generateLinesTypeC()).to.throw();
            });
        });

        describe('TYPE D', () => {
            it('should add crypto statements', async () => {});
        });
    });

    describe('getSRUPackage', () => {
        it('should generate SRU packages', () => {
            const t1 = _createTrade('SPY', 900, 1001, 10, 100, 100, 'STK', '2021-01-11');
            const t2 = _createFutTrade('MNQM1', 900, 1001, 1, 100);
            const t3 = _createFutTrade('MCLM1', 900, 1001, 1, 100);
            const sru = new SRUFile(fxRates, [t1, t2, t3], {
                name: 'TEST',
                surname: 'TEST',
                mail: 'TEST',
                code: '123 45',
                city: 'TEST',
                taxYear: 2021,
                id: '19900101-1234',
            });

            const packages = sru.getSRUPackages();
            expect(packages).to.have.lengthOf(1);
            expect(packages[0].totals).to.have.lengthOf(2);
            expect(packages[0].totals[0].type).to.equal(K4_TYPE.TYPE_A);
            expect(packages[0].totals[0].totalReceived).to.equal(1001 * 10 + 1001 * 10);
            expect(packages[0].totals[0].totalPaid).to.equal((900 + 10) * 10 + (900 + 1) * 10);
            expect(packages[0].totals[0].totalLoss).to.equal(0);
            expect(packages[0].totals[0].totalProfit).to.equal(100 * 10 + 100 * 10);
            expect(packages[0].totals[1].type).to.equal(K4_TYPE.TYPE_D);
            expect(packages[0].totals[1].totalReceived).to.equal(1001 * 10);
            expect(packages[0].totals[1].totalPaid).to.equal((900 + 1) * 10);
            expect(packages[0].totals[1].totalLoss).to.equal(0);
            expect(packages[0].totals[1].totalProfit).to.equal(100 * 10);
        });

        it('should generate blanketter.sru data for each SRUPackage', () => {
            const t1 = _createTrade('SPY', 900, 1001, 10, 100, 100, 'STK', '2021-01-11');
            const t2 = _createFutTrade('MNQM1', 900, 1001, 1, 100);
            const t3 = _createFutTrade('MCLM1', 900, 1001, 1, 100);
            const sru = new SRUFile(
                fxRates,
                [t1, t2, t3],
                {
                    name: 'TEST',
                    surname: 'TEST',
                    mail: 'TEST',
                    code: '123 45',
                    city: 'TEST',
                    taxYear: 2021,
                    id: '19900101-1234',
                },
                new Date(2022, 0, 1, 14, 30, 0),
            );

            const packages = sru.getSRUPackages();
            const expectedLines = [
                '#BLANKETT K4-2021P4',
                '#IDENTITET 19900101-1234 20220101 143000',
                '#UPPGIFT 7014 1',
                // T1
                '#UPPGIFT 3100 100',
                '#UPPGIFT 3101 SPY ...',
                `#UPPGIFT 3102 ${1001 * 10}`,
                `#UPPGIFT 3103 ${(900 + 10) * 10}`,
                `#UPPGIFT 3104 ${100 * 10}`,
                // T2
                '#UPPGIFT 3110 1',
                '#UPPGIFT 3111 MNQM1 ...',
                `#UPPGIFT 3112 ${1001 * 10}`,
                `#UPPGIFT 3113 ${(900 + 1) * 10}`,
                `#UPPGIFT 3114 ${100 * 10}`,
                // Sum
                `#UPPGIFT 3300 ${1001 * 10 + 1001 * 10}`,
                `#UPPGIFT 3301 ${(900 + 10) * 10 + (900 + 1) * 10}`,
                `#UPPGIFT 3304 ${100 * 10 + 100 * 10}`,
                `#UPPGIFT 3305 ${0}`,
                '#BLANKETTSLUT',
                // T3
                '#BLANKETT K4-2021P4',
                '#IDENTITET 19900101-1234 20220101 143000',
                '#UPPGIFT 7014 2',
                '#UPPGIFT 3410 1',
                '#UPPGIFT 3411 MCLM1 ...',
                `#UPPGIFT 3412 ${1001 * 10}`,
                `#UPPGIFT 3413 ${(900 + 1) * 10}`,
                `#UPPGIFT 3414 ${100 * 10}`,
                // SUM
                `#UPPGIFT 3500 ${1001 * 10}`,
                `#UPPGIFT 3501 ${(900 + 1) * 10}`,
                `#UPPGIFT 3503 ${100 * 10}`,
                `#UPPGIFT 3504 ${0}`,
                '#BLANKETTSLUT',
                '#FIL_SLUT',
            ];
            expect(generateBlanketterFileData(packages[0].forms)).to.have.members(expectedLines);
        });

        it('should throw error when erroneous data', () => {
            expect(() => new SRUFile(fxRates, [], undefined).getSRUPackages()).to.throw(/Missing SRU info/);
            expect(() => new SRUFile(fxRates, [], { name: 'TEST' }).getSRUPackages()).to.throw(
                /Invalid SRU info: taxYear/,
            );
            expect(() => new SRUFile(fxRates, [], { name: 'TEST', taxYear: 2021 }).getSRUPackages()).to.throw(
                /Invalid SRU info: id/,
            );
        });
    });

    describe('generateBlanketterFile', () => {
        //const validForm = new K4Form('K4-2021P4', 1, '19900101-1234', new Date(2021, 0, 1, 14, 30, 0), new Array(9).fill(new Statement(0, 100, 'SPY', 100, 100, 0, K4_TYPE.TYPE_A, '')));
    });
});
