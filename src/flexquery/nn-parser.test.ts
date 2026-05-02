import 'mocha';
import { expect } from 'chai';
import { promises as fs } from 'fs';

import { NNParser } from './nn-parser';

describe('NNParser', () => {
    let nnParser: NNParser;

    beforeEach(() => {
        nnParser = new NNParser();
    });

    it('should parse Nordnet CSV fixture', async () => {
        const testFileData = await fs.readFile('test/fixtures/nordnet.csv', 'utf8');
        const stats = nnParser.parse(testFileData);
        const trades = nnParser.getAllTrades();

        expect(trades).to.have.lengthOf(8);
        expect(stats.tradesCount).to.equal(8);
        expect(stats.tradesUnhandledCount).to.equal(0);
        expect(nnParser.getConversionRates().size).to.equal(0);
    });

    it('should set expected fields for buy and sell rows', async () => {
        const testFileData = await fs.readFile('test/fixtures/nordnet.csv', 'utf8');
        nnParser.parse(testFileData);
        const trades = nnParser.getAllTrades();

        const investorSell = trades.find((t) => t.symbol === 'SE0020188415' && t.openClose === 'C');
        expect(investorSell).to.not.be.undefined;
        expect(investorSell?.description).to.equal('BULL INVESTOR X2 NORDNET');
        expect(investorSell?.securityType).to.equal('STK');
        expect(investorSell?.tradeCurrency).to.equal('SEK');
        expect(investorSell?.quantity).to.equal(-60);
        expect(investorSell?.exitPrice).to.equal(169.75);
        expect(investorSell?.exitDateTime).to.equal('2025-05-02 00:00');
        expect(investorSell?.entryDateTime).to.equal('2025-04-02 00:00');
        expect(investorSell?.pnl).to.equal(-360);
        expect(investorSell?.proceeds).to.equal(10190);
        expect(investorSell?.cost).to.equal(0);
        expect(investorSell?.commission).to.equal(0);
        expect(investorSell?.transactionType).to.equal('ExchTrade');
        expect(investorSell?.direction).to.equal('LONG');

        const skanskaSell = trades.find((t) => t.symbol === 'SE0020188985' && t.openClose === 'C');
        expect(skanskaSell).to.not.be.undefined;
        expect(skanskaSell?.quantity).to.equal(-60);
        expect(skanskaSell?.exitPrice).to.equal(203.6);
        expect(skanskaSell?.exitDateTime).to.equal('2025-04-23 00:00');
        expect(skanskaSell?.entryDateTime).to.equal('2025-04-03 00:00');
        expect(skanskaSell?.pnl).to.equal(260);

        const swedbankBuy = trades.find((t) => t.symbol === 'SE0000543043' && t.openClose === 'O');
        expect(swedbankBuy).to.not.be.undefined;
        expect(swedbankBuy?.quantity).to.equal(450.9897);
        expect(swedbankBuy?.entryPrice).to.equal(108.72);
        expect(swedbankBuy?.entryDateTime).to.equal('2025-01-29 00:00');
        expect(swedbankBuy?.exitDateTime).to.equal('');
        expect(swedbankBuy?.pnl).to.equal(0);
    });

    it('should return only closing trades', async () => {
        const testFileData = await fs.readFile('test/fixtures/nordnet.csv', 'utf8');
        nnParser.parse(testFileData);

        const closingTrades = nnParser.getClosingTrades();
        expect(closingTrades).to.have.lengthOf(4);
        closingTrades.forEach((trade) => {
            expect(trade.openClose).to.equal('C');
            expect(trade.quantity).to.be.lessThan(0);
            expect(trade.entryDateTime).to.not.equal('');
            expect(trade.exitDateTime).to.not.equal('');
        });
    });

    it('should include parser summary values', async () => {
        const testFileData = await fs.readFile('test/fixtures/nordnet.csv', 'utf8');
        const stats = nnParser.parse(testFileData);

        expect(stats.winnersCount).to.equal(2);
        expect(stats.losersCount).to.equal(6);
        expect(stats.tradePnl).to.equal(0);
        expect(stats.tradePnlNonUsd).to.be.closeTo(-19.58, 0.0001);
        expect(stats.totalComm).to.equal(0);
        expect(stats.stkTradesCount).to.equal(8);
        expect(stats.optTradesCount).to.equal(0);
        expect(stats.futTradesCount).to.equal(0);
        expect(stats.firstTradeDate).to.equal('2025-01-29 00:00');
        expect(stats.lastTradeDate).to.equal('2025-05-02 00:00');
        expect(stats.largestWinner).to.equal(260);
        expect(stats.largestLoser).to.equal(-360);
        expect(stats.tradesNonUSDCount).to.equal(8);
        expect(stats.ratesCount).to.equal(0);
    });
});
