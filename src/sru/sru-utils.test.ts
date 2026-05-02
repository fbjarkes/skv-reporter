import { expect } from 'chai';

import { parseInitialCashPositionsCsv } from './sru-utils';

const test_data = `
    ASSET, ACCOUNT, YEAR, CUM_QTY, CUM_COST, AVG_COST, COMMENT
    USD_SEK, U1234, 2025, 10000, 109600, 10.96, "TEST..."
    USD_SEK, U4321, 2025, 500.5, 5565.56, 11.12, "TEST/TEST"
    BTC_USD, 01234, 2025, 0.002, 202.0002578, 101000.128905, "TEST 'TEST'"
    SHIBA_USD,, 2025, 100000000, 520.0, 0.0000052, ""
`;

describe('SRU utilities', () => {
    it('parses and aggregates cash positions from positions file', () => {
        const positions = parseInitialCashPositionsCsv(test_data, 2025);

        expect(positions).to.have.lengthOf(4);

        // Assert USD/SEK account U1234
        expect(positions[0].symbol).to.equal('USD/SEK');
        expect(positions[0].currency).to.equal('SEK');
        expect(positions[0].cumulativeQty).to.equal(10000);
        expect(positions[0].cumulativeCost).to.equal(109600);
        expect(positions[0].averageCost).to.equal(10.96);

        // Assert USD/SEK account U4321
        expect(positions[1].symbol).to.equal('USD/SEK');
        expect(positions[1].currency).to.equal('SEK');
        expect(positions[1].cumulativeQty).to.equal(500.5);
        expect(positions[1].cumulativeCost).to.equal(5565.56);
        expect(positions[1].averageCost).to.equal(11.12);

        // Assert BTC/USD account 01234
        expect(positions[2].symbol).to.equal('BTC/USD');
        expect(positions[2].currency).to.equal('USD');
        expect(positions[2].cumulativeQty).to.equal(0.002);
        expect(positions[2].cumulativeCost).to.equal(202.0002578);
        expect(positions[2].averageCost).to.equal(101000.1289);

        // Assert SHIBA/USD
        expect(positions[3].symbol).to.equal('SHIBA/USD');
        expect(positions[3].currency).to.equal('USD');
        expect(positions[3].cumulativeQty).to.equal(100000000);
        expect(positions[3].cumulativeCost).to.equal(520.0);
        expect(positions[3].averageCost).to.equal(0.0000052);
    });
});
