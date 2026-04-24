/**
 * CLI script to generate SRU files from an IBKR Flex Query XML export.
 *
 * Usage:
 *   npx ts-node scripts/generate-sru.ts <xml-file> <tax-year>
 *
 * Personal info is read from environment variables (or a .env file):
 *   SRU_ID        - Personal/organisation number (personnummer)
 *   SRU_NAME      - First name
 *   SRU_SURNAME   - Surname
 *   SRU_MAIL      - Email address
 *   SRU_CODE      - Postal code
 *   SRU_CITY      - City
 *
 * Output files are written to the current working directory:
 *   info.sru
 *   blanketter0.sru, blanketter1.sru, ...  (rename each to blanketter.sru when uploading)
 *   totals.txt  (summary with SKV form instructions)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

import { FlexQueryParser } from '../src/flexquery/flexquery-parser';
import { SRUFile, SRUInfo, generateBlanketterFileData, totalsFileData } from '../src/sru/sru-file';
import { Statement } from '../src/types/statement';

dotenv.config();

// --- arg parsing ---

const [, , xmlFile, taxYearArg] = process.argv;

if (!xmlFile || !taxYearArg) {
    console.error('Usage: npx ts-node scripts/generate-sru.ts <xml-file> <tax-year>');
    process.exit(1);
}

const taxYear = parseInt(taxYearArg, 10);
if (isNaN(taxYear)) {
    console.error(`Invalid tax year: ${taxYearArg}`);
    process.exit(1);
}

const sruInfo: SRUInfo = {
    taxYear,
    id: process.env.SRU_ID,
    name: process.env.SRU_NAME,
    surname: process.env.SRU_SURNAME,
    mail: process.env.SRU_MAIL,
    code: process.env.SRU_CODE,
    city: process.env.SRU_CITY,
};

const missingEnv = (['id', 'name', 'surname', 'mail', 'code', 'city'] as const).filter((k) => !sruInfo[k]);
if (missingEnv.length > 0) {
    console.error(
        `Missing required environment variables: ${missingEnv.map((k) => `SRU_${k.toUpperCase()}`).join(', ')}`,
    );
    process.exit(1);
}

// --- main ---

const main = async () => {
    const resolvedPath = path.resolve(xmlFile);
    console.log(`Reading: ${resolvedPath}`);
    const fileData = await fs.readFile(resolvedPath, 'utf8');

    const flexParser = new FlexQueryParser();
    const stats = flexParser.parse(fileData);

    console.log('\n--- Parse summary ---');
    console.log(`Trades:       ${stats.tradesCount} (winners: ${stats.winnersCount}, losers: ${stats.losersCount})`);
    console.log(
        `  STK: ${stats.stkTradesCount}  OPT: ${stats.optTradesCount}  FUT: ${stats.futTradesCount}  Non-USD: ${stats.tradesNonUSDCount}`,
    );
    console.log(`Trade PnL:    ${stats.tradePnl.toFixed(2)} USD  (non-USD: ${stats.tradePnlNonUsd.toFixed(2)})`);
    console.log(`Commissions:  ${stats.totalComm.toFixed(2)} USD`);
    console.log(`FX mappings:  ${stats.ratesCount}`);
    if (stats.tradesUnhandledCount > 0) {
        console.warn(`Unhandled:    ${stats.tradesUnhandledCount} trades skipped`);
    }

    const trades = flexParser.getClosingTrades();
    const rates = flexParser.getConversionRates();

    const sruFile = new SRUFile(rates, trades, sruInfo);
    const packages = sruFile.getSRUPackages();

    console.log(`\nGenerating ${packages.length} SRU package(s)...`);

    // Write info.sru (same for all packages)
    const infoData = sruFile.getInfoFileData();
    await fs.writeFile('info.sru', infoData.join('\n'), { encoding: 'latin1' });
    console.log('Wrote: info.sru');

    // Write blanketter files
    for (let i = 0; i < packages.length; i++) {
        const pkg = packages[i];
        const blanketterData = generateBlanketterFileData(pkg.forms);
        const filename = `blanketter${i}.sru`;
        await fs.writeFile(filename, blanketterData.join('\n'), { encoding: 'latin1' });
        console.log(`Wrote: ${filename}  (${pkg.statements.length} statements)`);
    }

    // Write totals summary
    const allTotals = packages.flatMap((p) => p.totals);
    const totalsData = totalsFileData(allTotals);
    await fs.writeFile('totals.txt', totalsData.join('\n'), 'utf8');
    console.log('Wrote: totals.txt');

    // Print statement summary
    const allStatements: Statement[] = packages.flatMap((p) => p.statements);
    let totalPnl = 0,
        totalLoss = 0,
        totalProfit = 0,
        totalPaid = 0,
        totalReceived = 0;
    allStatements.forEach((s) => {
        totalPnl += s.pnl;
        totalPaid += s.paid;
        totalReceived += s.received;
        if (s.pnl > 0) totalProfit += s.pnl;
        else totalLoss += Math.abs(s.pnl);
    });

    console.log('\n--- Statement summary (SEK) ---');
    console.log(`Statements:     ${allStatements.length}`);
    console.log(`Total PnL:      ${totalPnl.toFixed(0)}`);
    console.log(`Total profit:   ${totalProfit.toFixed(0)}`);
    console.log(`Total loss:     ${totalLoss.toFixed(0)}`);
    console.log(`Total paid:     ${totalPaid.toFixed(0)}`);
    console.log(`Total received: ${totalReceived.toFixed(0)}`);

    if (packages.length > 1) {
        console.log(
            `\nNote: ${packages.length} blanketter files generated. Rename each to 'blanketter.sru' and upload separately.`,
        );
    }
};

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
