/* Copyright(c) 2017-2020 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */
/* jslint node:true */

'use strict';

import * as save_file from './save_file';
import * as send_file from './send_file';
import * as settings from './settings';
import { ALLOWED_EXTENSION_IDS } from './background';
import { ALL } from 'dns';

function string_or_null(s: string | null | undefined) {
  if (s) {
    return s;
  }
  return '';
}

export async function download(
  table: HTMLTableElement,
  sums_for_spreadsheet: boolean
): Promise<void> {
  const tableToArrayOfArrays = function (table: HTMLTableElement): string[][] {
    const rows: HTMLTableRowElement[] = Array.prototype.slice.call(table.rows);
    const result: string[][] = [];
    for (let i = 0; i < rows.length + (sums_for_spreadsheet ? -1 : 0); ++i) {
      let cells = rows[i].cells;
      let cell_array: string[] = [];
      for (let j = 0; j < cells.length; ++j) {
        let x:
          | HTMLTableDataCellElement
          | HTMLTableHeaderCellElement
          | undefined
          | null
          | string = cells[j];
        if (x?.getAttribute('class')?.search('azad_numeric_no') == -1) {
          x = x?.textContent?.replace(/^([£$]|CAD|EUR|GBP) */, '');
        } else {
          x = x.textContent;
        }
        cell_array.push(string_or_null(x));
      }
      result.push(cell_array);
    }
    if (sums_for_spreadsheet) {
      // replace last row for use in a spreadsheet
      let cells = rows[2].cells;
      let cell_array: string[] = [];
      let x: string = '';
      let y = true;
      for (let j = 0; j < cells.length; ++j) {
        if (cells[j]?.getAttribute('class')?.search('azad_numeric_no') == -1) {
          x = '=SUBTOTAL(109,{COL}2:{COL}{LAST})';
        } else {
          if (y) {
            x = '=SUBTOTAL(103, {COL}2:{COL}{LAST}) & " items"';
            y = false;
          } else {
            x = '';
          }
        }
        x = x
          .replace('{COL}', String.fromCharCode('A'.charCodeAt(0) + j))
          .replace('{COL}', String.fromCharCode('A'.charCodeAt(0) + j))
          .replace('{LAST}', (rows.length - 1).toString());
        cell_array.push(x);
      }
      result.push(cell_array);
    }
    return result;
  };
  const processRow = function (row: string[]): string {
    const processCell = function (cell: string): string {
      if (!cell) {
        return '';
      }
      let processed = cell.replace(/"/g, '""');
      if (processed.search(/("|,|\n)/g) >= 0) {
        processed = '"' + processed + '"';
      }
      return processed;
    };
    return row.map(processCell).join(',');
  };
  const cell_strings: string[][] = tableToArrayOfArrays(table);
  const row_strings = cell_strings.map(processRow);
  const csvFile = '\ufeff' + row_strings.join('\n');
  const ezp_mode = await settings.getBoolean('ezp_mode');

  if (ezp_mode ? ezp_mode : false) {
    // Retrieve the requesting EZP Extension ID from sessionStorage
    try {
      const requestingEzpExt = await getRequestingEzpExt();

      if (requestingEzpExt !== null) {
        //Added to asure that no other script modified the destination
        if (ALLOWED_EXTENSION_IDS.includes(requestingEzpExt))
          send_file.send(csvFile, requestingEzpExt);
        else
          console.warn(
            `Data Not Sent, Destination Extension ID, '${requestingEzpExt}' has been mofified, not on Whitelist.`
          );
      } else {
        // or is it prefered to just not send the data if data is not found?
        // console.error('No EZP Destination Extension ID Found, Data not sent.');

        console.warn(
          'Did not get Requesting EZP Extension ID, brodcasting to Whitelist...'
        );
        ALLOWED_EXTENSION_IDS.forEach((extID) => {
          if (extID !== undefined) {
            send_file.send(csvFile, extID as string);
          }
        });
      }
    } catch (error) {
      console.error('Error Sending Data to EZP Ext:', error);
    }
  } else {
    await save_file.save(csvFile, 'amazon_order_history.csv');
  }

  // retrieves the variable from sessionStorage as a Promise
  function getRequestingEzpExt(): Promise<string | null> {
    return new Promise((resolve) => {
      const requestingEzpExt = sessionStorage.getItem('requestingEzpExt');
      resolve(requestingEzpExt);
    });
  }
}
