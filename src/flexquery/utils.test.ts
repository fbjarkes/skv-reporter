import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { TradeType } from '../types/trade';
import { connectTrades } from './utils';

chai.use(chaiAsPromised);

describe('Utils', () => {
    it('should add entry dates for closing trades', () => {
        const trades = [
            new TradeType({ symbol: 'SPY', quantity: 100, entryPrice: 250, exitPrice: 0, entryDateTime: '2020-01-01', exitDateTime: '', openClose: 'O', direction: 'LONG' }),
            new TradeType({ symbol: 'SPY', quantity: 100, entryPrice: 250, exitPrice: 0, entryDateTime: '2020-01-02', exitDateTime: '', openClose: 'O', direction: 'LONG' }),
            new TradeType({ symbol: 'SPY', quantity: 50, entryPrice: 0, exitPrice: 260, entryDateTime: '', exitDateTime: '2020-01-03', openClose: 'C', direction: 'LONG' }),
            new TradeType({ symbol: 'SPY', quantity: 50, entryPrice: 0, exitPrice: 270, entryDateTime: '', exitDateTime: '2020-01-04', openClose: 'C', direction: 'LONG' }),
        ];
        connectTrades(trades);

        expect(trades[2].entryDateTime).to.equal('2020-01-01');
        expect(trades[3].entryDateTime).to.equal('2020-01-01');
    });

    it('should add entry dates and prices for closing trades', () => {
        const trades = [
            new TradeType({ symbol: 'SPY', quantity: -100, entryPrice: 250, exitPrice: 0, entryDateTime: '2020-01-01', exitDateTime: '', openClose: 'O', direction: 'SHORT' }),
            new TradeType({ symbol: 'SPY', quantity: -100, entryPrice: 251, exitPrice: 0, entryDateTime: '2020-01-02', exitDateTime: '', openClose: 'O', direction: 'SHORT' }),
            new TradeType({ symbol: 'SPY', quantity: 100, entryPrice: 0, exitPrice: 260, entryDateTime: '', exitDateTime: '2020-01-03', openClose: 'C', direction: 'SHORT' }),
            new TradeType({ symbol: 'SPY', quantity: 100, entryPrice: 0, exitPrice: 270, entryDateTime: '', exitDateTime: '2020-01-04', openClose: 'C', direction: 'SHORT' }),
            new TradeType({ symbol: 'SPY', quantity: -100, entryPrice: 260, exitPrice: 0, entryDateTime: '2020-02-02', exitDateTime: '', openClose: 'O', direction: 'SHORT' }),
            new TradeType({ symbol: 'SPY', quantity: 100, entryPrice: 0, exitPrice: 250, entryDateTime: '', exitDateTime: '2020-02-03', openClose: 'C', direction: 'SHORT' }),
        ];
        connectTrades(trades);

        expect(trades[2].entryDateTime).to.equal('2020-01-01');
        expect(trades[2].entryPrice).to.equal(250);
        expect(trades[3].entryDateTime).to.equal('2020-01-01');
        expect(trades[3].entryPrice).to.equal(250);
        expect(trades[5].entryDateTime).to.equal('2020-02-02');
        expect(trades[5].entryPrice).to.equal(260);
    });

    it('should have a unique id to relate closing trades to the opening trade', () => {
        const trades = [
            new TradeType({ symbol: 'SPY', quantity: 100, entryPrice: 250, exitPrice: 0, entryDateTime: '2020-01-01', exitDateTime: '', openClose: 'O', direction: 'LONG' }),
            new TradeType({ symbol: 'SPY', quantity: 100, entryPrice: 240, exitPrice: 0, entryDateTime: '2020-01-01', exitDateTime: '', openClose: 'O', direction: 'LONG' }),
            new TradeType({ symbol: 'SPY', quantity: -100, entryPrice: 0, exitPrice: 260, entryDateTime: '', exitDateTime: '2020-01-03', openClose: 'C', direction: 'LONG' }),
            new TradeType({ symbol: 'SPY', quantity: -100, entryPrice: 0, exitPrice: 270, entryDateTime: '', exitDateTime: '2020-01-04', openClose: 'C', direction: 'LONG' }),
            new TradeType({ symbol: 'SPY', quantity: -100, entryPrice: 260, exitPrice: 0, entryDateTime: '2020-02-02', exitDateTime: '', openClose: 'O', direction: 'SHORT' }),
            new TradeType({ symbol: 'SPY', quantity: 100, entryPrice: 0, exitPrice: 250, entryDateTime: '', exitDateTime: '2020-02-03', openClose: 'C', direction: 'SHORT' }),
        ];
        connectTrades(trades);

        expect(trades[0].positionId).to.equal(1);
        expect(trades[1].positionId).to.equal(1);
        expect(trades[2].positionId).to.equal(1);
        expect(trades[3].positionId).to.equal(1);
        expect(trades[4].positionId).to.equal(2);
        expect(trades[5].positionId).to.equal(2);
    });

    it('should have a trade duration for connected trades', () => {
        const trades = [
            new TradeType({ symbol: 'SPY', quantity: 100, entryPrice: 250, exitPrice: 0, entryDateTime: '2020-01-02 09:00', exitDateTime: '', openClose: 'O', direction: 'LONG' }),
            new TradeType({ symbol: 'SPY', quantity: 100, entryPrice: 240, exitPrice: 0, entryDateTime: '2020-01-03 09:00', exitDateTime: '', openClose: 'O', direction: 'LONG' }),
            new TradeType({ symbol: 'SPY', quantity: -100, entryPrice: 0, exitPrice: 260, entryDateTime: '', exitDateTime: '2020-01-03 10:00', openClose: 'C', direction: 'LONG' }),
            new TradeType({ symbol: 'SPY', quantity: -100, entryPrice: 0, exitPrice: 270, entryDateTime: '', exitDateTime: '2020-01-04 09:00', openClose: 'C', direction: 'LONG' }),
        ];
        connectTrades(trades);

        expect(trades[2].durationMin).to.equal(24 * 60 + 60);
        expect(trades[3].durationMin).to.equal(2 * 24 * 60);
    });
});
