import { DEF03 } from './DEF-03-money-as-text.ts'
import { DEF04 } from './DEF-04-dead-columns.ts'
import { DEF05 } from './DEF-05-missing-agency.ts'
import { DEF06 } from './DEF-06-placeholders.ts'
import { DEF07 } from './DEF-07-author-mismatch.ts'
import { DEF08 } from './DEF-08-space-runs.ts'
import { DEF09 } from './DEF-09-whitespace.ts'
import { DEF11 } from './DEF-11-mangled-section-sign.ts'
import { DEF16 } from './DEF-16-negative-amounts.ts'
import { DEF17 } from './DEF-17-all-zero-rows.ts'
import type { RowRule } from './types.ts'

/**
 * Order matters and is deliberate:
 *  1. parse money (DEF-03) so every later rule sees numbers;
 *  2. drop all-zero rows (DEF-17) so every count below is over kept rows;
 *  3. whitespace (DEF-09, DEF-08) before any value comparison;
 *  4. observations that must see the original placeholders (DEF-04, DEF-07)
 *     before the null-encoding rules erase them (DEF-05, DEF-06);
 *  5. observations that only count (DEF-11, DEF-16).
 */
export const ROW_RULES: RowRule[] = [DEF03, DEF17, DEF09, DEF08, DEF04, DEF07, DEF05, DEF06, DEF11, DEF16]
