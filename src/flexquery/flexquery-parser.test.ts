import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { promises as fs } from 'fs';
import { FlexQueryParser } from './flexquery-parser';

chai.use(chaiAsPromised);

describe('FlexQueryParser', () => {
    let flexParser: FlexQueryParser;

    beforeEach(() => {
        flexParser = new FlexQueryParser();
    });
    describe('Non CASH/FX trades', () => {
        it('should parse single STK trade', async () => {
            const testFileData = await fs.readFile('test/fixtures/trade1.xml', 'utf8');
            flexParser.parse(testFileData);
            const trades = flexParser.getClosingTrades();

            expect(trades[0]).to.not.be.undefined;
            expect(trades[0].symbol).to.equal('ABC');
            expect(trades[0].exitDateTime).to.equal('2015-03-27 16:00');
            expect(trades[0].securityType).to.equal('STK');
            expect(trades[0].quantity).to.equal(-1);
            expect(trades[0].exitPrice).to.equal(400.0);
            expect(trades[0].pnl).to.equal(-100.0);
        });

        it('should get all data for a STK trade', async () => {
            const testFileData = await fs.readFile('test/fixtures/trade2.xml', 'utf8');
            flexParser.parse(testFileData);
            const trades = flexParser.getClosingTrades();
            expect(trades).to.have.lengthOf(2);

            expect(trades[0].symbol).to.equal('UWM');
            expect(trades[0].description).to.equal('PROSHARES ULTRA RUSSELL2000');
            expect(trades[0].quantity).to.equal(-32);
            expect(trades[0].exitPrice).to.equal(88.86);
            expect(trades[0].proceeds).to.equal(2843.52);
            expect(trades[0].cost).to.equal(-2738.863785);
            expect(trades[0].pnl).to.equal(104.200907);
            expect(trades[0].securityType).to.equal('STK');
            expect(trades[0].exitDateTime).to.equal('2015-01-08 16:00');
            expect(trades[0].commission).to.equal(-0.455307);
            expect(trades[0].tradeCurrency).to.equal('USD');
            expect(trades[0].direction).to.equal('LONG');
            expect(trades[0].transactionType).to.equal('ExchTrade');
        });

        it('should handle exercised stock option', async () => {
            const testFileData = await fs.readFile('test/fixtures/option_exercised.xml', 'utf8');
            flexParser.parse(testFileData);
            const trades = flexParser.getClosingTrades();
            expect(trades).to.have.lengthOf(2);
            expect(trades[0].symbol).to.equal('BA');
            expect(trades[0].securityType).to.equal('STK');
            expect(trades[0].transactionType).to.equal('BookTrade');
            expect(trades[0].pnl).to.equal(316.946875);
            expect(trades[1].symbol).to.equal('BA    150417C00144000');
            expect(trades[1].securityType).to.equal('OPT');
            expect(trades[1].transactionType).to.equal('BookTrade');
        });

        it('should handle "O;C" trades', async () => {
            const testFileData = await fs.readFile('test/fixtures/trade_open_closed_1.xml', 'utf8');
            flexParser.parse(testFileData);
            const trades = flexParser.getClosingTrades();
            expect(trades).to.have.lengthOf(3);
            // Buy 5 (5 long), sell 3 (2 long), sell 3 (1 short), sell 2 (3 short), buy 3 (flat)
            expect(trades[0].pnl.toFixed(2)).to.equal('18.55');
            expect(trades[0].direction).to.equal('LONG');
            expect(trades[1].pnl.toFixed(2)).to.equal('1.57');
            expect(trades[1].direction).to.equal('LONG');
            expect(trades[2].pnl.toFixed(2)).to.equal('-0.09');
            expect(trades[2].direction).to.equal('SHORT');
        });
        it('should get FX mappings', async () => {
            const testFileData = await fs.readFile('test/fixtures/option_exercised.xml', 'utf8');
            flexParser.parse(testFileData);
            const rates = flexParser.getConversionRates();
            expect(rates.get('2015-03-30')?.get('SEK/USD')).to.equal(0.1542);
            expect(rates.get('2015-03-31')?.get('SEK/USD')).to.equal(0.15421);
            expect(rates.get('2015-03-31')?.get('EUR/USD')).to.equal(1.3634);
        });

        it('should have calculated FX mappings', async () => {
            const testFileData = await fs.readFile('test/fixtures/option_exercised.xml', 'utf8');
            flexParser.parse(testFileData);
            const rates = flexParser.getConversionRates();
            expect(rates.get('2015-03-30')?.get('USD/SEK')).to.equal(1 / 0.1542);
            expect(rates.get('2015-03-31')?.get('USD/SEK')).to.equal(1 / 0.15421);
            expect(rates.get('2015-03-31')?.get('SEK/EUR')).to.equal((0.15421 / 1.3634).toFixed(4)); // 0.15420 SEK/USD / 1.36 EUR/USD = SEK/EUR
            expect(rates.get('2015-03-31')?.get('EUR/SEK')).to.equal((1 / (0.15421 / 1.3634)).toFixed(4));
        });

        it('should handle short trades', async () => {
            const testFileData = await fs.readFile('test/fixtures/trade3.xml', 'utf8');
            flexParser.parse(testFileData);
            const trades = flexParser.getClosingTrades();
            expect(trades).to.have.lengthOf(2);
            expect(trades[0].quantity).to.equal(1); // QTY is pos. for short closing trades
            expect(trades[1].quantity).to.equal(-1);
        });

        it('should have entry datetime for closing trade', async () => {
            const testFileData = await fs.readFile('test/fixtures/trade1.xml', 'utf8');
            flexParser.parse(testFileData);
            const trades = flexParser.getClosingTrades();
            expect(trades).to.have.lengthOf(1);
            expect(trades[0].entryDateTime).to.equal('2015-03-26 16:00');
        });

        it('should set fields correctly for Opening trades', async () => {
            const testFileData = await fs.readFile('test/fixtures/trade3.xml', 'utf8');
            flexParser.parse(testFileData);
            const trades = flexParser.getAllTrades();
            expect(trades).to.have.lengthOf(4);
            expect(trades[0].symbol).to.equal('APC   170922C00043500');
            expect(trades[0].description).to.equal('APC 22SEP17 43.5 C');
            expect(trades[0].quantity).to.equal(-1);
            expect(trades[0].entryPrice).to.equal(0.76);
            expect(trades[0].exitPrice).to.equal(0);
            expect(trades[0].proceeds).to.equal(76);
            expect(trades[0].cost).to.equal(-74.9047444);
            expect(trades[0].pnl).to.equal(0);
            expect(trades[0].securityType).to.equal('OPT');
            expect(trades[0].entryDateTime).to.equal('2017-09-14 15:55');
            expect(trades[0].exitDateTime).to.equal('');
            expect(trades[0].commission).to.equal(-1.0952556);
            expect(trades[0].tradeCurrency).to.equal('USD');
            expect(trades[0].direction).to.equal('SHORT');
            expect(trades[0].transactionType).to.equal('ExchTrade');
        });

        it('should throw exception if required fields are missing in XML data', async () => {
            const testFileData = await fs.readFile('test/fixtures/erroneous.xml', 'utf8');
            expect(() => flexParser.parse(testFileData)).to.throw(/assetCategory/);
        });

        it('should handle missing dateTime gracefully', async () => {
            const testFileData = await fs.readFile('test/fixtures/missing_datetime.xml', 'utf8');
            flexParser.parse(testFileData);
            const trades = flexParser.getAllTrades();
            expect(trades[0]).to.not.be.undefined;
            expect(trades[0].symbol).to.equal('ABC');
            expect(trades[0].entryDateTime).to.equal('');
            expect(trades[0].exitDateTime).to.equal('');
            expect(trades[0].durationMin).to.equal(-1);
        });
    });

    describe('CASH trades', () => {
        it('should parse two CASH buy trades', async () => {
            const testFileData = await fs.readFile('test/fixtures/cash_trade1.xml', 'utf8');
            flexParser.parse(testFileData);
            const trades = flexParser.getAllTrades();

            expect(trades).to.have.lengthOf(2);

            // Assert first buy: 500 @ 20.0
            expect(trades[0].symbol).to.equal('USD/SEK');
            expect(trades[0].description).to.equal('USD/SEK');
            expect(trades[0].quantity).to.equal(500);
            expect(trades[0].entryPrice).to.equal(20);
            expect(trades[0].exitPrice).to.equal(0);
            expect(trades[0].proceeds).to.equal(-10_000);
            expect(trades[0].cost).to.equal(0);
            expect(trades[0].pnl).to.equal(0);
            expect(trades[0].securityType).to.equal('CASH');
            expect(trades[0].entryDateTime).to.equal('2025-01-15');
            expect(trades[0].exitDateTime).to.equal('');
            expect(trades[0].commission).to.equal(-2);
            expect(trades[0].tradeCurrency).to.equal('SEK');
            expect(trades[0].direction).to.equal('BUY'); //TODO: LONG/SHORT or BUY/SELL??
            expect(trades[0].transactionType).to.equal('ExchTrade');

            // Assert second buy: 500 @ 10.0
            expect(trades[1].symbol).to.equal('USD/SEK');
            expect(trades[1].description).to.equal('USD/SEK');
            expect(trades[1].quantity).to.equal(500);
            expect(trades[1].entryPrice).to.equal(10);
            expect(trades[1].exitPrice).to.equal(0);
            expect(trades[1].proceeds).to.equal(-5_000);
            expect(trades[1].cost).to.equal(0);
            expect(trades[1].pnl).to.equal(0);
            expect(trades[1].securityType).to.equal('CASH');
            expect(trades[1].entryDateTime).to.equal('2025-01-16');
            expect(trades[1].exitDateTime).to.equal('');
            expect(trades[1].commission).to.equal(-2);
            expect(trades[1].tradeCurrency).to.equal('SEK');
            expect(trades[1].direction).to.equal('BUY');
            expect(trades[1].transactionType).to.equal('ExchTrade');
        });

        it('should parse two buy trades and one sell trade', async () => {
            const testFileData = await fs.readFile('test/fixtures/cash_trade2.xml', 'utf8');
            flexParser.parse(testFileData);
            const trades = flexParser.getAllTrades();
            const pos = flexParser.getConversionRates();

            expect(trades).to.have.lengthOf(6);

            // Assert first buy: 1000 @ 10
            expect(trades[0].symbol).to.equal('USD/SEK');
            expect(trades[0].description).to.equal('USD/SEK');
            expect(trades[0].quantity).to.equal(1000);
            expect(trades[0].entryPrice).to.equal(10);
            expect(trades[0].exitPrice).to.equal(0);
            expect(trades[0].proceeds).to.equal(-10_000);
            expect(trades[0].cost).to.equal(0);
            expect(trades[0].pnl).to.equal(0);
            expect(trades[0].securityType).to.equal('CASH');
            expect(trades[0].entryDateTime).to.equal('2025-01-15');
            expect(trades[0].exitDateTime).to.equal('');
            expect(trades[0].commission).to.equal(-2);
            expect(trades[0].tradeCurrency).to.equal('SEK');
            expect(trades[0].direction).to.equal('BUY');
            expect(trades[0].transactionType).to.equal('ExchTrade');

            // Assert second buy: 1000 @ 20.0
            expect(trades[1].symbol).to.equal('USD/SEK');
            expect(trades[1].description).to.equal('USD/SEK');
            expect(trades[1].quantity).to.equal(1000);
            expect(trades[1].entryPrice).to.equal(20);
            expect(trades[1].exitPrice).to.equal(0);
            expect(trades[1].proceeds).to.equal(-20_000);
            expect(trades[1].cost).to.equal(0);
            expect(trades[1].pnl).to.equal(0);
            expect(trades[1].securityType).to.equal('CASH');
            expect(trades[1].entryDateTime).to.equal('2025-01-15');
            expect(trades[1].exitDateTime).to.equal('');
            expect(trades[1].commission).to.equal(-2);
            expect(trades[1].tradeCurrency).to.equal('SEK');
            expect(trades[1].direction).to.equal('BUY');
            expect(trades[1].transactionType).to.equal('ExchTrade');

            // Assert sell: 1000 @ 25.0
            expect(trades[2].symbol).to.equal('USD/SEK');
            expect(trades[2].description).to.equal('USD/SEK');
            expect(trades[2].quantity).to.equal(-1000);
            expect(trades[2].entryPrice).to.equal(0);
            expect(trades[2].exitPrice).to.equal(25);
            expect(trades[2].proceeds).to.equal(25_000);
            expect(trades[2].cost).to.equal(0);
            expect(trades[2].pnl).to.equal(0);
            expect(trades[2].securityType).to.equal('CASH');
            expect(trades[2].entryDateTime).to.equal('');
            expect(trades[2].exitDateTime).to.equal('2025-01-16');
            expect(trades[2].commission).to.equal(-2);
            expect(trades[2].tradeCurrency).to.equal('SEK');
            expect(trades[2].direction).to.equal('SELL');
            expect(trades[2].transactionType).to.equal('ExchTrade');

            // Assert buy: 1000 @ 10.0
            expect(trades[3].symbol).to.equal('USD/SEK');
            expect(trades[3].description).to.equal('USD/SEK');
            expect(trades[3].quantity).to.equal(1000);
            expect(trades[3].entryPrice).to.equal(10);
            expect(trades[3].exitPrice).to.equal(0);
            expect(trades[3].proceeds).to.equal(-10_000);
            expect(trades[3].cost).to.equal(0);
            expect(trades[3].pnl).to.equal(0);
            expect(trades[3].securityType).to.equal('CASH');
            expect(trades[3].entryDateTime).to.equal('2025-01-16');
            expect(trades[3].exitDateTime).to.equal('');
            expect(trades[3].commission).to.equal(-2);
            expect(trades[3].tradeCurrency).to.equal('SEK');
            expect(trades[3].direction).to.equal('BUY');
            expect(trades[3].transactionType).to.equal('ExchTrade');

            // Assert buy: 1000 @ 15.0
            expect(trades[4].symbol).to.equal('USD/SEK');
            expect(trades[4].description).to.equal('USD/SEK');
            expect(trades[4].quantity).to.equal(1000);
            expect(trades[4].entryPrice).to.equal(15);
            expect(trades[4].exitPrice).to.equal(0);
            expect(trades[4].proceeds).to.equal(-15_000);
            expect(trades[4].cost).to.equal(0);
            expect(trades[4].pnl).to.equal(0);
            expect(trades[4].securityType).to.equal('CASH');
            expect(trades[4].entryDateTime).to.equal('2025-01-16');
            expect(trades[4].exitDateTime).to.equal('');
            expect(trades[4].commission).to.equal(-2);
            expect(trades[4].tradeCurrency).to.equal('SEK');
            expect(trades[4].direction).to.equal('BUY');
            expect(trades[4].transactionType).to.equal('ExchTrade');

            // Assert sell: 1000 @ 10.0
            expect(trades[5].symbol).to.equal('USD/SEK');
            expect(trades[5].description).to.equal('USD/SEK');
            expect(trades[5].quantity).to.equal(-1000);
            expect(trades[5].entryPrice).to.equal(0);
            expect(trades[5].exitPrice).to.equal(10);
            expect(trades[5].proceeds).to.equal(10_000);
            expect(trades[5].cost).to.equal(0);
            expect(trades[5].pnl).to.equal(0);
            expect(trades[5].securityType).to.equal('CASH');
            expect(trades[5].entryDateTime).to.equal('');
            expect(trades[5].exitDateTime).to.equal('2025-01-16');
            expect(trades[5].commission).to.equal(-2);
            expect(trades[5].tradeCurrency).to.equal('SEK');
            expect(trades[5].direction).to.equal('SELL');
            expect(trades[5].transactionType).to.equal('ExchTrade');
        });
    });
});
