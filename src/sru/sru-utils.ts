import * as fs from 'fs/promises';

import { CashPosition } from '../types/cash';
import { logger } from '../logging';

export const parseCsvLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    values.push(current.trim());
    return values;
};

export const unquote = (value: string): string => {
    if (value.startsWith('"') && value.endsWith('"')) {
        return value.slice(1, -1);
    }
    return value;
};

export const parseInitialCashPositionsCsv = (content: string, taxYear: number): CashPosition[] => {
    const requiredHeaders = ['ASSET', 'ACCOUNT', 'YEAR', 'CUM_QTY', 'CUM_COST'];
    const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (lines.length < 2) {
        logger.warn(`No data lines found in Positions file for tax year ${taxYear}`);
        return [];
    }

    const headers = parseCsvLine(lines[0]).map((h) => unquote(h).toUpperCase());
    for (const header of requiredHeaders) {
        if (!headers.includes(header)) {
            throw new Error(`Missing required header "${header}" in Positions file for tax year ${taxYear}`);
        }
    }

    const positions: CashPosition[] = [];

    return positions;
};

export const parseInitialCashPositionsFile = async (filePath: string, taxYear: number): Promise<CashPosition[]> => {
    const content = await fs.readFile(filePath, 'utf8');
    return parseInitialCashPositionsCsv(content, taxYear, filePath);
};
