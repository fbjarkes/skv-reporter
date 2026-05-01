import { expect } from 'chai';

import { parseInitialCashPositionsCsv } from './sru-utils';

const test_data = `
    ASSET, ACCOUNT, YEAR, CUM_QTY, CUM_COST, AVG_COST, COMMENT
    USD_SEK, U1234, 2025, 10000, 109600, 10.96, "TEST..."
    USD_SEK, U4321, 2025, 500.5, 5565.56, 11.12, "TEST/TEST"
    BTC_USD, 01234, 2025, 0.002, 202.0002578, 101000.128905, "TEST 'TEST'"
    SHIBA_USD, ABC, 2025, 100000000, 520.0, 0.0000052, ""
`;

describe('SRU utilities', () => {
    it('parses and aggregates cash positions from positions file', () => {
        const positions = parseInitialCashPositionsCsv(test_data, 2025);

        expect(positions).to.have.lengthOf(3);
        expect(positions[0].symbol).to.equal('USD/SEK');
        expect(positions[0].currency).to.equal('SEK');
        expect(positions[0].cumulativeQty).equal(10000);
        expect(positions[0].cumulativeCost).equal(109600);
        expect(positions[0].averageCost).equal(10.96);
    });
});
