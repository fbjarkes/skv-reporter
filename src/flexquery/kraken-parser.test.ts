import 'mocha';
import { expect } from 'chai';
import { promises as fs } from 'fs';

import { KrakenParser } from './kraken-parser';

describe('KrakenParser', () => {
    let krakenParser: KrakenParser;

    beforeEach(() => {
        krakenParser = new KrakenParser();
    });

    it('should parse Kraken CSV fixture', async () => {
        const testFileData = await fs.readFile('test/fixtures/kraken_spot_anonymized.csv', 'utf8');
        const stats = krakenParser.parse(testFileData);
        const trades = krakenParser.getAllTrades();

        // 4 buy rows (O) + 5 sell rows (C)
        expect(trades).to.have.lengthOf(9);
        expect(stats.tradesCount).to.equal(9);
        expect(stats.tradesUnhandledCount).to.equal(0);
    });

    it('should map a buy row into an opening trade', async () => {
        const testFileData = await fs.readFile('test/fixtures/kraken_spot_anonymized.csv', 'utf8');
        krakenParser.parse(testFileData);
        const trades = krakenParser.getAllTrades();

        const btcBuy = trades.find((t) => t.symbol === 'BTC' && t.openClose === 'O');
        expect(btcBuy).to.not.be.undefined;
        expect(btcBuy?.description).to.equal('BTC/USD');
        expect(btcBuy?.securityType).to.equal('STK');
        expect(btcBuy?.tradeCurrency).to.equal('USD');
        expect(btcBuy?.quantity).to.equal(10);
        expect(btcBuy?.entryPrice).to.equal(10);
        expect(btcBuy?.entryDateTime).to.equal('2025-01-10 00:00');
        expect(btcBuy?.exitDateTime).to.equal('');
        expect(btcBuy?.cost).to.equal(100);
        expect(btcBuy?.proceeds).to.equal(0);
        expect(btcBuy?.pnl).to.equal(0);
        expect(btcBuy?.commission).to.equal(-0.1);
        expect(btcBuy?.transactionType).to.equal('ExchTrade');
        expect(btcBuy?.direction).to.equal('LONG');
    });

    it('should map a sell row into a closing trade', async () => {
        const testFileData = await fs.readFile('test/fixtures/kraken_spot_anonymized.csv', 'utf8');
        krakenParser.parse(testFileData);
        const trades = krakenParser.getAllTrades();

        // SELL-AAA: BTC/USD, 2025-01-20, price=12, cost=120, fee=0.2, vol=10
        const btcSell = trades.find((t) => t.symbol === 'BTC' && t.openClose === 'C');
        expect(btcSell).to.not.be.undefined;
        expect(btcSell?.description).to.equal('BTC/USD');
        expect(btcSell?.securityType).to.equal('STK');
        expect(btcSell?.tradeCurrency).to.equal('USD');
        expect(btcSell?.quantity).to.equal(-10);
        expect(btcSell?.exitPrice).to.equal(12);
        expect(btcSell?.exitDateTime).to.equal('2025-01-20 00:00');
        expect(btcSell?.entryDateTime).to.equal('');
        expect(btcSell?.proceeds).to.equal(120);
        expect(btcSell?.cost).to.equal(0); // cost basis unknown until position tracking
        expect(btcSell?.pnl).to.equal(0); // pnl unknown until position tracking
        expect(btcSell?.commission).to.equal(-0.2);
        expect(btcSell?.transactionType).to.equal('ExchTrade');
        expect(btcSell?.direction).to.equal('LONG');
    });

    it('should return only closing trades', async () => {
        const testFileData = await fs.readFile('test/fixtures/kraken_spot_anonymized.csv', 'utf8');
        krakenParser.parse(testFileData);

        // 5 sell rows in fixture
        const closingTrades = krakenParser.getClosingTrades();
        expect(closingTrades).to.have.lengthOf(5);
        closingTrades.forEach((trade) => {
            expect(trade.openClose).to.equal('C');
            expect(trade.quantity).to.be.lessThan(0);
            expect(trade.exitPrice).to.be.greaterThan(0);
            expect(trade.exitDateTime).to.not.equal('');
            expect(trade.entryDateTime).to.equal('');
        });
    });

    it('should count dust transactions and log a warning', () => {
        const header =
            'txid,ordertxid,pair,aclass,subclass,time,type,ordertype,price,cost,fee,vol,margin,misc,ledgers,posttxid,posstatuscode,cprice,ccost,cfee,cvol,cmargin,net,trades';
        const normalSell = 'SELL-X,ORDER-X,BTC/USD,forex,crypto,2025-06-01,sell,limit,10,99.9,0.1,9.99,,,,,,,,,,,,,';
        const dustSell = 'SELL-Y,ORDER-Y,BTC/USD,forex,crypto,2025-06-01,sell,limit,10,0.0001,0,0.00001,,,,,,,,,,,,,';
        const csvData = [header, normalSell, dustSell].join('\n');

        const stats = krakenParser.parse(csvData);

        expect(stats.tradesCount).to.equal(2);
        expect(stats.tradesUnhandledCount).to.equal(0);
        expect(stats.dustCount).to.equal(1);
        const trades = krakenParser.getAllTrades();
        expect(trades).to.have.lengthOf(2);
        expect(trades[0].quantity).to.be.closeTo(-9.99, 0.0001);
        expect(trades[1].quantity).to.be.closeTo(-0.00001, 0.0000001);
    });

    it('should respect a custom dust threshold', () => {
        const header =
            'txid,ordertxid,pair,aclass,subclass,time,type,ordertype,price,cost,fee,vol,margin,misc,ledgers,posttxid,posstatuscode,cprice,ccost,cfee,cvol,cmargin,net,trades';
        const row1 = 'SELL-X,ORDER-X,BTC/USD,forex,crypto,2025-06-01,sell,limit,10,3,0.01,0.3,,,,,,,,,,,,,';
        const row2 = 'SELL-Y,ORDER-Y,BTC/USD,forex,crypto,2025-06-01,sell,limit,10,6,0.01,0.6,,,,,,,,,,,,,';
        const csvData = [header, row1, row2].join('\n');

        // Default threshold 5.0 — cost=3 is dust, cost=6 is not
        const stats = new KrakenParser().parse(csvData);
        expect(stats.dustCount).to.equal(1);

        // Custom threshold 10.0 — both are dust
        const statsHigh = new KrakenParser(undefined, 10).parse(csvData);
        expect(statsHigh.dustCount).to.equal(2);
    });

    it('should include parser summary values', async () => {
        const testFileData = await fs.readFile('test/fixtures/kraken_spot_anonymized.csv', 'utf8');
        const stats = krakenParser.parse(testFileData);

        // pnl is 0 for all trades at parse time; cost basis / pnl resolved later
        expect(stats.winnersCount).to.equal(0);
        expect(stats.losersCount).to.equal(9);
        expect(stats.tradePnl).to.equal(0);
        expect(stats.tradePnlNonUsd).to.equal(0);
        // total commission = sum of all fees across all 9 rows
        expect(stats.totalComm).to.be.closeTo(-0.5032, 0.0001);
        expect(stats.stkTradesCount).to.equal(9);
        expect(stats.optTradesCount).to.equal(0);
        expect(stats.futTradesCount).to.equal(0);
        expect(stats.firstTradeDate).to.equal('2025-01-10 00:00');
        expect(stats.lastTradeDate).to.equal('2025-04-02 00:00');
        expect(stats.largestWinner).to.equal(0);
        expect(stats.largestLoser).to.equal(0);
        expect(stats.tradesNonUSDCount).to.equal(0);
        expect(stats.dustCount).to.equal(2); // XRP buy (cost=0.5001) + XRP sell (cost=0.4001) both < 5.0
        expect(stats.ratesCount).to.equal(1); // USD/SEK initialized in constructor
    });
});
